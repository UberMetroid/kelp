// SPDX-License-Identifier: GPL-3.0-or-later
// Mutter Meta.Window wrapper (`ShellWindow`) bridging ECS entities to GNOME Shell window actors.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import { entity_eq } from '../engine/ecs/world.js';
import { Rectangle } from '../engine/geom/rectangle.js';
import { WindowBorder, place_cursor_on_rect } from './window_border.js';

export class ShellWindow {
    constructor(entity, window, _window_type, ext) {
        this.entity = entity; this.meta = window; this.ext = ext;
        this.known_workspace = this.workspace_id();
        this.grab = false;
        this.stack = null; this.stack_Previously_hidden = false; this.smart_gapped = false;
        this.prev_rect = null; this.target_rect = null;
        this.border = new WindowBorder(this); this.window_signals = [];
        this.bind_window_events();
        this.update_border_layout();
    }

    bind_window_events() {
        const connect = (sig, cb) => { this.window_signals.push(this.meta.connect(sig, cb)); };
        connect('size-changed', () => this.window_changed());
        connect('position-changed', () => this.window_changed());
        connect('workspace-changed', () => this.workspace_changed());
        connect('notify::wm-class', () => this.wm_class_changed());
        connect('notify::window-type', () => this.wm_class_changed());
        connect('notify::title', () => this.wm_class_changed());
        connect('notify::minimized', () => this.ext.on_minimize(this));
        connect('notify::maximized-horizontally', () => this.update_border_layout());
        connect('notify::maximized-vertically', () => this.update_border_layout());
        connect('notify::fullscreen', () => {
            this.update_border_layout();
            if (this.meta.is_fullscreen()) {
                this.ext.clear_seahorse_peeks?.();
                for (const s of this.ext.auto_tiler?.forest?.stacks?.values?.() ?? []) s.sync_visibility?.();
            } else {
                this.ext.on_window_changed(this);
                this.ext.retile_workspace();
            }
        });
    }

    activate(ext_or_move = true, maybe_move = true) {
        const move_mouse = typeof ext_or_move === 'boolean' ? ext_or_move : maybe_move;
        const ext = this.ext, ws = this.meta.get_workspace();
        this.meta.unminimize();
        if (ws) ws.activate_with_focus(this.meta, global.get_current_time());
        else this.meta.activate(global.get_current_time());
        this.meta.raise();
        if (move_mouse && ext.settings.mouse_cursor_follows_active_window()) {
            place_cursor_on_rect(this.target_rect ?? this.rect(), ext.settings.mouse_cursor_focus_location());
        }
    }

    actor_exists() {
        return this.meta !== null && !this.meta.in_destruction?.() && this.meta.get_compositor_private() !== null;
    }

    cmdline() { const pid = this.meta.get_pid(); return pid <= 0 ? null : String(pid); }
    decoration(_ext, callback) { if (this.actor_exists()) callback(); }

    icon(_ext, size) {
        const app = Shell.WindowTracker.get_default().get_window_app(this.meta);
        return app ? app.create_icon_texture(size) : null;
    }

    is_maximized() {
        if (typeof this.meta.is_maximized === 'function') return Boolean(this.meta.is_maximized());
        return Boolean(this.meta.maximized_horizontally || this.meta.maximized_vertically);
    }

    is_single_max_screen() {
        const display = global.display;
        if (!display) return false;
        const area = display.get_monitor_geometry(this.meta.get_monitor()), r = this.rect();
        return r.width >= area.width && r.height >= area.height;
    }

    is_tilable(ext) {
        if (ext.contains_tag(this.entity, 1) || this.meta.is_on_all_workspaces?.()) return false;
        if (this.meta.get_window_type() !== Meta.WindowType.NORMAL) return false;
        if (this.meta.is_override_redirect() || this.meta.get_transient_for() !== null) return false;
        if (this.meta.is_skip_taskbar() && !ext.settings.show_skip_taskbar()) return false;

        const wm_class = this.meta.get_wm_class(), wm_title = this.meta.get_title();
        if (wm_class === null && wm_title === null) return false;
        if (typeof wm_title === 'string' && (wm_title.startsWith('Desktop Icons ') || wm_title.includes('@!'))) {
            return false;
        }
        if (ext.conf.window_shall_float(wm_class, wm_title)) return ext.contains_tag(this.entity, 3);
        return true;
    }

    may_decorate() { return !this.meta.is_client_decorated(); }

    unmaximize() {
        if (this.meta.unmaximize.length === 0) this.meta.unmaximize();
        else this.meta['unmaximize'](Meta.MaximizeFlags.BOTH);
    }

    move(ext, rect, on_complete) {
        if (!this.actor_exists() || this.meta.is_fullscreen()) {
            ext.size_signals_unblock(this);
            if (on_complete) on_complete();
            return;
        }
        const clone = Rectangle.from_meta(rect);
        const work_area = ext.monitor_work_area(this.meta.get_monitor());
        if (work_area) clone.clamp(work_area);
        const x = Math.round(clone.x), y = Math.round(clone.y);
        const w = Math.max(1, Math.round(clone.width)), h = Math.max(1, Math.round(clone.height));
        this.target_rect = new Rectangle([x, y, w, h]);
        this.hide_border();
        ext.size_signals_block(this);
        if (this.is_maximized()) this.unmaximize();

        const apply = () => {
            if (!this.actor_exists() || this.meta.is_fullscreen()) {
                ext.size_signals_unblock(this);
                if (on_complete) on_complete();
                return;
            }
            try {
                const actor = this.meta.get_compositor_private();
                if (actor && typeof actor.remove_all_transitions === 'function') actor.remove_all_transitions();
                this.meta.move_resize_frame(true, x, y, w, h);
                ext.monitors.insert(this.entity, [this.meta.get_monitor(), this.workspace_id()]);
                if (on_complete) on_complete();
                this.show_border(ext);
            } finally {
                ext.register_fn(() => ext.size_signals_unblock(this));
            }
        };
        ext.register_fn(apply);
    }

    name(_ext) { return this.meta.get_wm_class() || 'Application'; }
    rect() { return Rectangle.from_meta(this.meta.get_frame_rect()); }
    same_monitor(other) { return this.meta.get_monitor() === other.meta.get_monitor(); }
    same_workspace(other) { return this.workspace_id() === other.workspace_id(); }

    swap(ext, other) {
        const ar = this.rect().clone(), br = other.rect().clone();
        this.move(ext, br);
        other.move(ext, ar);
        if (ext.settings.mouse_cursor_follows_active_window()) {
            place_cursor_on_rect(br, ext.settings.mouse_cursor_focus_location());
        }
    }

    title() { return this.meta.get_title() || this.meta.get_wm_class() || ''; }
    workspace_id() { const ws = this.meta.get_workspace(); return ws ? ws.index() : 0; }
    hide_border() { if (this.border) this.border.hide(); }

    show_border(ext = this.ext) {
        if (!this.border) return;
        const f = ext.focus_window();
        if (f === this || entity_eq(ext.focused_window_entity(), this.entity)) this.border.show(ext);
    }

    update_border_layout() {
        if (!this.border) return;
        const f = this.ext.focus_window();
        if (f === this || entity_eq(this.ext.focused_window_entity(), this.entity)) {
            this.border.show(this.ext);
        } else {
            this.border.hide();
        }
    }

    window_changed() {
        const r = this.rect(), t = this.target_rect;
        if (t && Math.abs(r.x - t.x) <= 4 && Math.abs(r.y - t.y) <= 4 &&
            Math.abs(r.width - t.width) <= 4 && Math.abs(r.height - t.height) <= 4) {
            this.target_rect = null;
            this.update_border_layout();
            return;
        }
        this.target_rect = null;
        const mon = this.meta.get_monitor(), prev_mon = this.ext.monitors.get(this.entity)?.[0];
        if (prev_mon !== undefined && mon !== prev_mon && !this.grab) {
            this.ext.monitors.insert(this.entity, [mon, this.workspace_id()]);
            if (this.ext.auto_tiler && this.is_tilable(this.ext)) {
                this.ext.auto_tiler.detach_window(this.ext, this.entity);
                this.ext.auto_tiler.auto_tile(this.ext, this, false);
                this.update_border_layout();
                return;
            }
        }
        this.ext.on_window_changed(this);
        this.update_border_layout();
    }

    workspace_changed() {
        const nw = this.workspace_id();
        if (nw !== this.known_workspace) {
            this.known_workspace = nw;
            this.ext.monitors.insert(this.entity, [this.meta.get_monitor(), nw]);
            if (this.ext.auto_tiler && this.is_tilable(this.ext)) {
                this.ext.auto_tiler.auto_tile(this.ext, this, false);
            }
        }
        this.update_border_layout();
    }

    wm_class_changed() {
        if (!this.is_tilable(this.ext) && this.ext.auto_tiler) {
            this.ext.auto_tiler.detach_window(this.ext, this.entity);
        }
    }

    destroy() {
        if (this.meta) for (const sig of this.window_signals) this.meta.disconnect(sig);
        this.window_signals = [];
        if (this.border) { this.border.destroy(); this.border = null; }
    }
}
