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
import { ModalTiler } from '../engine/modal/modal_tiler.js';
import { Forest } from '../engine/octopus/forest.js';
import { OctopusTiler } from '../engine/octopus/octopus_tiler.js';
import { cascade_otter_windows, snap_otter_window } from '../engine/otter/otter_tiler.js';
import { SeahorseTiler } from '../engine/seahorse/seahorse_tiler.js';
import { ExtensionSettings, TILING_MODES } from '../ui/settings/gsettings.js';
import { Config } from '../ui/settings/float_rules.js';
import * as log from '../ui/settings/log.js';
import { Indicator } from '../ui/panel_indicator.js';
import { ExceptionDialog } from '../ui/exception_dialog.js';
import { ShellWindow } from './shell_window.js';
import { Keybindings } from './keybindings.js';
import { move_window_to_monitor, move_window_to_workspace } from './overview_tray.js';
import { clear_seahorse_peeks, load_theme, monitor_work_area, restore_edge_tiling, set_edge_tiling, sync_seahorse_peeks, unload_theme, update_scale } from './controller_display.js';
import { active_window_list, active_workspace, cursor_status, focus_down, focus_left, focus_right, focus_selector, focus_up, on_focused, previously_focused, should_ignore_workspace, tab_list, windows_at_pointer, workspace_id } from './controller_workspace.js';
import { attach_controller_signals, cancel_drag_signal } from './controller_signals.js';

export class Ext extends Ecs.World {
    constructor(extension) {
        super();
        this.extension = extension;
        this.path = extension.path;
        this.settings = new ExtensionSettings(extension.getSettings());
        log.set_log_level(this.settings.log_level());

        this.conf = new Config(); this.conf.reload();
        this.ids = this.register_storage(); this.monitors = this.register_storage(); this.windows = this.register_storage();
        this.signals = []; this.size_signals_blocked = new Set();
        this.prev_focused = [null, null]; this.drag_signal = null; this.grab_op = null;
        this.ignore_display_update = false; this.current_style = null;
        this.focus_selector = focus_selector; this._switching_mode = false;
        this.overlay = new St.BoxLayout({ style_class: 'kelp-overlay', visible: false });
        if (global.window_group) global.window_group.add_child(this.overlay);
        update_scale(this); load_theme(this);
        this.events = new WakeupExecutor(); this.tiler = new ModalTiler(this);
        this.mode = this.settings.tiling_mode(); this.auto_tiler = this._create_tiler_for_mode(this.mode);
        set_edge_tiling(this, this.mode === 'otter');
        this.keybindings = new Keybindings(this).sync(this);
        this.exception_dialog = new ExceptionDialog(this); this.indicator = new Indicator(this);
        attach_controller_signals(this);
        for (const actor of global.get_window_actors()) {
            const win = actor.get_meta_window();
            if (win) this.on_window_create(win);
        }
    }

    _create_auto_tiler() {
        const f = new Forest().connect_on_attach((p, c) => this.auto_tiler?.attached.insert(c, p)).connect_on_detach((c) => this.auto_tiler?.attached.remove(c));
        return new OctopusTiler(f, this.register_storage());
    }
    _create_tiler_for_mode(mode) {
        return mode === 'octopus' ? this._create_auto_tiler() : mode === 'seahorse' ? new SeahorseTiler(this.register_storage()) : null;
    }
    _destroy_auto_tiler() {
        if (!this.auto_tiler) return;
        const old_att = this.auto_tiler.attached;
        this.auto_tiler.destroy(this);
        this.unregister_storage(old_att);
        this.auto_tiler = null;
    }

    register(event) { if (!this._destroyed) this.events.send(event, (ev) => this.run(ev)); }
    register_fn(callback) { this.register(ExtEvent.Callback(callback)); }

    run(event) {
        if (this._destroyed) return;
        if (event.kind === GlobalEvent.Callback) event.callback();
        else if (event.kind === GlobalEvent.WindowCreate) this.on_window_create(event.window);
        else if (event.kind === GlobalEvent.WindowMove && this.auto_tiler) event.func();
    }

    on_window_create(window) {
        const actor = window.get_compositor_private();
        if (!actor) return null;
        let sw = this.get_window(window);
        if (sw) return sw;
        const entity = this.create_entity();
        this.ids.insert(entity, window.get_stable_sequence());
        sw = new ShellWindow(entity, window, window.get_window_type(), this);
        const tilable = sw.is_tilable(this);
        sw.floating_rect = !this.auto_tiler || !tilable ? sw.rect() : null;
        this.windows.insert(entity, sw);
        this.monitors.insert(entity, [window.get_monitor(), sw.workspace_id()]);
        sw.actor_destroy_sig = [actor, actor.connect('destroy', () => this.on_destroy(entity))];
        this.signals.push(sw.actor_destroy_sig);
        if (this.auto_tiler && tilable) this.auto_tiler.auto_tile(this, sw, false);
        return sw;
    }

    on_destroy(entity) {
        if (this._destroyed) return;
        const win = this.windows.get(entity);
        if (!win) return;
        this.size_signals_unblock(win);
        const idx = win.actor_destroy_sig ? this.signals.indexOf(win.actor_destroy_sig) : -1;
        if (idx !== -1) this.signals.splice(idx, 1);
        win.actor_destroy_sig = null;
        if (this.auto_tiler) this.auto_tiler.detach_window(this, entity, true);
        win.destroy();
        this.delete_entity(entity);
        this.register_fn(() => this.show_border_on_focused());
    }

    on_minimize(win) {
        if (!this.auto_tiler) return;
        if (win.meta.minimized) this.auto_tiler.detach_window(this, win.entity, true);
        else if (win.is_tilable(this)) this.auto_tiler.auto_tile(this, win, false);
    }

    on_window_changed(win) {
        if (!this.auto_tiler) { win.floating_rect = win.rect(); return; }
        if (this.size_signals_blocked.has(`${win.entity[0]}:${win.entity[1]}`) || win.grab) return;
        if (this.auto_tiler.is_seahorse) { this.auto_tiler.reflow(this, win.entity); return; }
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
        if (this.overlay && rect) Object.assign(this.overlay, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
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
    size_signals_block(win) { if (win) this.size_signals_blocked.add(`${win.entity[0]}:${win.entity[1]}`); }
    size_signals_unblock(win) { if (win) this.size_signals_blocked.delete(`${win.entity[0]}:${win.entity[1]}`); }
    show_border_on_focused() { this.hide_all_borders(); this.focus_window()?.show_border(this); }
    hide_all_borders() { for (const [, win] of this.windows.iter()) win.hide_border(); }
    toggle_floating() { if (this.auto_tiler) this.auto_tiler.toggle_floating(this); }
    toggle_tiling() { this.cycle_mode(); }
    cycle_mode() { this.set_mode(TILING_MODES[(TILING_MODES.indexOf(this.mode) + 1) % TILING_MODES.length]); }

    set_mode(mode) {
        if (this._switching_mode) return;
        const target = TILING_MODES.includes(mode) ? mode : 'octopus';
        if (this.mode === target && Boolean(this.auto_tiler) === (target !== 'otter')) { this.indicator?.sync_mode(target); return; }
        this._switching_mode = true;
        try {
            const focused = this.focus_window(), ordered = this._ordered_tilable_windows(target, focused);
            if (this.mode === 'otter') for (const [, win] of this.windows.iter()) win.floating_rect = win.rect();
            this._destroy_auto_tiler();
            this.mode = target; this.auto_tiler = this._create_tiler_for_mode(target);
            this.settings.set_tiling_mode(target); set_edge_tiling(this, target === 'otter');
            this.indicator?.sync_mode(target); this.keybindings.sync(this);
            if (this.auto_tiler) {
                for (const win of ordered) if (win.is_tilable(this) && !win.meta?.minimized) this.auto_tiler.auto_tile(this, win, true);
                if (focused && !focused.meta?.minimized && this.auto_tiler.is_seahorse) this.auto_tiler.on_focused(this, focused);
            } else cascade_otter_windows(this, focused);
            if (focused && !focused.meta?.minimized) this.register_fn(() => focused.activate(this, false));
            this.show_border_on_focused();
        } finally { this._switching_mode = false; }
    }

    _ordered_tilable_windows(target = null, focused = this.focus_window()) {
        const order = [];
        if (this.auto_tiler?.is_seahorse) {
            const seen = new Set();
            for (const s of this.auto_tiler.strips.values()) for (const e of s.cols) { const w = this.windows.get(e); if (w) { order.push(w); seen.add(w); } }
            for (const [, w] of this.windows.iter()) if (!seen.has(w)) order.push(w);
        } else {
            order.push(...Array.from(this.windows.values()).sort((a, b) => (a.workspace_id() - b.workspace_id()) || (a.meta.get_monitor() - b.meta.get_monitor()) || (a.rect().x - b.rect().x) || (a.rect().y - b.rect().y)));
        }
        if (target !== 'seahorse' && focused && order.indexOf(focused) > 0) { order.splice(order.indexOf(focused), 1); order.unshift(focused); }
        return order;
    }

    move_global(dir) {
        if (this.auto_tiler?.is_seahorse) { this.auto_tiler.move_step(this, dir === 0 || dir === 1 ? -1 : 1); return; }
        if (!this.auto_tiler) { snap_otter_window(this, dir); return; }
        const ent = this.focus_window()?.entity;
        if (dir === 0) this.tiler.move_left(this, ent); else if (dir === 1) this.tiler.move_up(this, ent);
        else if (dir === 2) this.tiler.move_right(this, ent); else this.tiler.move_down(this, ent);
    }

    retile_workspace() {
        if (!this.auto_tiler) { cascade_otter_windows(this); return; }
        if (this.auto_tiler.is_seahorse) { this.auto_tiler.retile_all(this); return; }
        const smart_gaps = this.settings.smart_gaps();
        for (const fork of this.auto_tiler.forest.forks.values()) if (fork.is_toplevel) this.auto_tiler.update_toplevel(this, fork, fork.monitor, smart_gaps);
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
    sync_seahorse_peeks(id, rects) { sync_seahorse_peeks(this, id, rects); }
    clear_seahorse_peeks() { clear_seahorse_peeks(this); }
    exit_modes() { this.tiler.exit(this); this.exception_dialog.close(); if (this.overlay) this.overlay.visible = false; }

    destroy() {
        this._destroyed = true; this.exit_modes(); cancel_drag_signal(this);
        this.events.stop(); this.tiler.disable(); this.keybindings.disable();
        for (const [obj, sig] of this.signals) { try { obj.disconnect(sig); } catch (_e) { /* finalized */ } }
        this.signals = []; this._destroy_auto_tiler(); this.clear_seahorse_peeks(); restore_edge_tiling(this);
        for (const [ent, win] of this.windows.iter()) { win.destroy(); this.delete_entity(ent); }
        if (this.indicator) { this.indicator.destroy(); this.indicator = null; }
        if (this.overlay) { this.overlay.destroy(); this.overlay = null; }
        this.unload_theme();
    }
}
