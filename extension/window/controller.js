// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Primary ECS World & Window Controller (`Ext extends Ecs.World`) coordinating `AutoTiler`,
//   `Tiler`, `Keybindings`, `Indicator`, `ExceptionDialog`, `ShellWindow` entities, and overlay.
// - Zero-Trust Boundary & Invariants:
//   Maintains strict ownership of all GObject signals, GLib sources, Clutter overlay actors,
//   and ECS component storages. `destroy()` deterministically tears down every timer, signal,
//   keybinding, modal dialog, border actor, stack widget, and custom stylesheet.

import St from 'gi://St';
import * as Ecs from '../engine/ecs/world.js';
import { WakeupExecutor } from '../engine/ecs/executor.js';
import { ExtEvent, GlobalEvent } from '../engine/ecs/events.js';
import { Forest } from '../engine/tree/forest.js';
import { AutoTiler } from '../engine/tree/auto_tiler.js';
import { Tiler } from '../engine/tree/tiler.js';
import { ExtensionSettings } from '../ui/settings/gsettings.js';
import { Config } from '../ui/settings/float_rules.js';
import * as log from '../ui/settings/log.js';
import { Indicator } from '../ui/panel_indicator.js';
import { ExceptionDialog } from '../ui/exception_dialog.js';
import { ShellWindow } from './shell_window.js';
import { Keybindings } from './keybindings.js';
import { move_window_to_monitor, move_window_to_workspace } from './overview_tray.js';
import { load_theme, monitor_work_area, unload_theme, update_scale } from './controller_display.js';
import {
    active_window_list, active_workspace, cursor_status, focus_down, focus_left,
    focus_right, focus_selector, focus_up, on_focused, previously_focused,
    should_ignore_workspace, tab_list, windows_at_pointer, workspace_id,
} from './controller_workspace.js';
import { attach_controller_signals, cancel_drag_signal } from './controller_signals.js';

export class Ext extends Ecs.World {
    constructor(extension) {
        super();
        this.extension = extension;
        this.path = extension.path;
        this.settings = new ExtensionSettings(extension.getSettings());
        log.set_log_level(this.settings.log_level());

        this.conf = new Config();
        this.conf.reload();

        this.ids = this.register_storage();
        this.monitors = this.register_storage();
        this.movements = this.register_storage();
        this.names = this.register_storage();
        this.snapped = this.register_storage();
        this.windows = this.register_storage();

        this.signals = [];
        this.size_signals_blocked = new Set();
        this.prev_focused = [null, null];
        this.drag_signal = null;
        this.grab_op = null;
        this.ignore_display_update = false;
        this.current_style = null;
        this.focus_selector = focus_selector;

        this.overlay = new St.BoxLayout({ style_class: 'pop-shell-overlay', visible: false });
        if (global.window_group) global.window_group.add_child(this.overlay);

        update_scale(this);
        load_theme(this);

        this.events = new WakeupExecutor();
        this.tiler = new Tiler(this);
        this.auto_tiler = this.settings.tile_by_default() ? this._create_auto_tiler() : null;

        this.keybindings = new Keybindings(this);
        this.keybindings.sync(this);

        this.exception_dialog = new ExceptionDialog(this);
        this.indicator = new Indicator(this);

        attach_controller_signals(this);
        for (const actor of global.get_window_actors()) {
            const win = actor.get_meta_window();
            if (win) this.on_window_create(win);
        }
    }

    _create_auto_tiler() {
        return new AutoTiler(
            new Forest()
                .connect_on_attach((parent, child) => this.auto_tiler?.attached.insert(child, parent))
                .connect_on_detach((child) => this.auto_tiler?.attached.remove(child)),
            this.register_storage(),
        );
    }

    register(event) {
        this.events.send(event, (ev) => this.run(ev));
    }

    register_fn(callback) {
        this.register(ExtEvent.Callback(callback));
    }

    run(event) {
        if (event.kind === GlobalEvent.Changes) {
            for (const [entity, rect] of this.movements.drain()) {
                this.windows.get(entity)?.move(this, rect);
            }
        } else if (event.kind === GlobalEvent.Callback) {
            event.callback();
        } else if (event.kind === GlobalEvent.WindowCreate) {
            this.on_window_create(event.window);
        } else if (event.kind === GlobalEvent.WindowMove && this.auto_tiler) {
            event.func();
        }
    }

    on_window_create(window) {
        const actor = window.get_compositor_private();
        if (!actor) return null;
        let sw = this.get_window(window);
        if (sw) return sw;

        const entity = this.create_entity();
        this.ids.insert(entity, window.get_stable_sequence());
        sw = new ShellWindow(entity, window, window.get_window_type(), this);
        this.windows.insert(entity, sw);
        this.monitors.insert(entity, [window.get_monitor(), sw.workspace_id()]);

        actor.connect('destroy', () => this.on_destroy(entity));
        if (this.auto_tiler && sw.is_tilable(this)) {
            this.auto_tiler.auto_tile(this, sw, false);
        }
        return sw;
    }

    on_destroy(entity) {
        const win = this.windows.get(entity);
        if (!win) return;
        if (this.auto_tiler) this.auto_tiler.detach_window(this, entity);
        win.destroy();
        this.delete_entity(entity);
    }

    on_minimize(win) {
        if (!this.auto_tiler) return;
        if (win.meta.minimized) this.auto_tiler.detach_window(this, win.entity);
        else if (win.is_tilable(this)) this.auto_tiler.auto_tile(this, win, false);
    }

    on_window_changed(win) {
        if (this.size_signals_blocked.has(win.entity) || !this.auto_tiler || win.grab) return;
        const fork_entity = this.auto_tiler.attached.get(win.entity);
        const fork = fork_entity ? this.auto_tiler.forest.forks.get(fork_entity) : null;
        if (fork) this.auto_tiler.tile(this, fork, fork.area);
    }

    get_window(meta) {
        if (!meta) return null;
        const wid = meta.get_stable_sequence();
        const entity = this.ids.find((id) => id === wid).next().value;
        return entity ? this.windows.get(entity) : null;
    }

    set_overlay(rect) {
        if (!this.overlay || !rect) return;
        Object.assign(this.overlay, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    }

    focus_window() { return this.get_window(global.display.get_focus_window()); }
    focused_window_entity() { return this.prev_focused[1]; }
    previously_focused(win) { return previously_focused(this, win); }
    active_monitor() { return global.display.get_current_monitor(); }
    active_workspace() { return active_workspace(); }
    should_ignore_workspace(monitor) { return should_ignore_workspace(this, monitor); }
    workspace_id(win) { return workspace_id(this, win); }
    cursor_status() { return cursor_status(); }
    windows_at_pointer(c, m, w) { return windows_at_pointer(this, c, m, w); }
    monitor_work_area(monitor) { return monitor_work_area(this, monitor); }
    active_window_list() { return active_window_list(this); }
    tab_list(soort, ws) { return tab_list(this, soort, ws); }
    on_focused(win) { on_focused(this, win); }
    focus_left() { focus_left(this); }
    focus_right() { focus_right(this); }
    focus_down() { focus_down(this); }
    focus_up() { focus_up(this); }
    move_monitor(dir) { move_window_to_monitor(this, dir); }
    move_workspace(dir) { move_window_to_workspace(this, dir); }
    size_signals_block(win) { this.size_signals_blocked.add(win.entity); }
    size_signals_unblock(win) { if (win) this.size_signals_blocked.delete(win.entity); }
    update_snapped() {}
    show_border_on_focused() { this.hide_all_borders(); this.focus_window()?.show_border(this); }
    hide_all_borders() { for (const [, win] of this.windows.iter()) win.hide_border(); }
    toggle_tiling() { if (this.auto_tiler) this.auto_tile_off(); else this.auto_tile_on(); }

    auto_tile_on() {
        if (this.auto_tiler) return;
        this.settings.set_tile_by_default(true);
        if (this.indicator) this.indicator.tiled.setToggleState(true);
        this.auto_tiler = this._create_auto_tiler();
        this.keybindings.sync(this);
        for (const [, win] of this.windows.iter()) {
            if (win.is_tilable(this)) this.auto_tiler.auto_tile(this, win, true);
        }
    }

    auto_tile_off() {
        this.settings.set_tile_by_default(false);
        if (this.indicator) this.indicator.tiled.setToggleState(false);
        if (this.auto_tiler) { this.auto_tiler.destroy(this); this.auto_tiler = null; }
        this.keybindings.sync(this);
    }

    retile_workspace() {
        if (!this.auto_tiler) return;
        const smart_gaps = this.settings.smart_gaps();
        for (const fork of this.auto_tiler.forest.forks.values()) {
            if (fork.is_toplevel) this.auto_tiler.update_toplevel(this, fork, fork.monitor, smart_gaps);
        }
    }

    reload_config() {
        this.conf.reload();
        if (!this.auto_tiler) return;
        for (const [, win] of this.windows.iter()) {
            if (!win.is_tilable(this)) this.auto_tiler.detach_window(this, win.entity);
            else if (!this.auto_tiler.attached.contains(win.entity)) this.auto_tiler.auto_tile(this, win, false);
        }
    }

    exception_drawer() { this.exception_dialog.open(); }
    unload_theme() { unload_theme(this); }
    exit_modes() { this.tiler.exit(this); this.exception_dialog.close(); if (this.overlay) this.overlay.visible = false; }

    destroy() {
        this.exit_modes();
        cancel_drag_signal(this);
        this.events.stop();
        this.tiler.disable();
        this.keybindings.disable();
        for (const [obj, sig] of this.signals) {
            try { obj.disconnect(sig); } catch (_e) { /* finalized */ }
        }
        this.signals = [];
        if (this.auto_tiler) { this.auto_tiler.destroy(this); this.auto_tiler = null; }
        for (const [, win] of this.windows.iter()) win.destroy();
        if (this.indicator) { this.indicator.destroy(); this.indicator = null; }
        if (this.overlay) { this.overlay.destroy(); this.overlay = null; }
        this.unload_theme();
    }
}
