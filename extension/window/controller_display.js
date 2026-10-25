// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Monitor & workarea geometry queries (`monitor_work_area`, `update_display_configuration`,
//   `update_scale`) and stylesheet loader (`load_theme`, `unload_theme`) for `Ext` controller.
// - Zero-Trust Boundary & Invariants:
//   Always unloads any previously loaded custom stylesheet from `St.ThemeContext` before
//   loading a new theme (`dark.css`, `light.css`, `highcontrast.css`), and exposes
//   `unload_theme(ext)` so `KelpExtension.disable()` leaves zero stale stylesheets in GNOME Shell.

import Gio from 'gi://Gio';
import St from 'gi://St';
import { Rectangle } from '../engine/geom/rectangle.js';
import { cascade_otter_windows, snap_otter_window } from '../engine/otter/otter_tiler.js';
import * as log from '../ui/settings/log.js';

export { cascade_otter_windows, snap_otter_window };

export function monitor_work_area(ext, monitor) {
    const ws = global.workspace_manager.get_active_workspace();
    const area = ws
        ? ws.get_work_area_for_monitor(monitor)
        : global.display.get_monitor_geometry(monitor);
    return Rectangle.from_meta(area);
}

export function update_scale(ext) {
    const dpi = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
    ext.dpi = dpi;
    ext.column_size = ext.settings.column_size() * dpi;
    ext.row_size = ext.settings.row_size() * dpi;
    ext.gap_inner_prev = ext.gap_inner || 0;
    ext.gap_inner = ext.settings.gap_inner() * dpi;
    ext.gap_inner_half = Math.round(ext.gap_inner / 2);
    ext.gap_outer_prev = ext.gap_outer || 0;
    ext.gap_outer = ext.settings.gap_outer() * dpi;
}

export function set_gap_inner(ext, gap) {
    ext.gap_inner_prev = ext.gap_inner;
    ext.gap_inner = gap * ext.dpi;
    ext.gap_inner_half = Math.round(ext.gap_inner / 2);
}

export function set_gap_outer(ext, gap) {
    ext.gap_outer_prev = ext.gap_outer;
    ext.gap_outer = gap * ext.dpi;
}

export function update_display_configuration(ext, workareas_only) {
    if (ext.ignore_display_update) {
        ext.ignore_display_update = false;
        return;
    }
    if (!ext.auto_tiler) {
        for (const [, win] of ext.windows.iter()) {
            if (!win.is_tilable(ext) || win.meta.minimized) continue;
            const rect = (win.floating_rect ?? win.rect()).clone();
            const area = monitor_work_area(ext, win.meta.get_monitor());
            if (area) { rect.clamp(area); win.floating_rect = rect; win.move(ext, rect); }
        }
        return;
    }
    if (ext.auto_tiler.is_seahorse) {
        ext.auto_tiler.retile_all(ext);
        return;
    }
    const display = global.display;
    if (!display) return;

    const n_monitors = display.get_n_monitors();
    if (n_monitors === 0) return;
    const n_ws = Math.max(1, global.workspace_manager?.get_n_workspaces?.() ?? 1);

    const smart_gaps = ext.settings.smart_gaps();
    for (const [fork_id] of ext.auto_tiler.forest.toplevel.values()) {
        const fork = ext.auto_tiler.forest.forks.get(fork_id);
        if (!fork) continue;
        const mon = fork.monitor < n_monitors ? fork.monitor : 0;
        if (!workareas_only) fork.monitor = mon;
        if (fork.workspace >= n_ws) fork.workspace = n_ws - 1;
        ext.auto_tiler.update_toplevel(ext, fork, mon, smart_gaps);
    }
}

export function set_edge_tiling(ext, enable) {
    const m = ext.settings.mutter;
    if (m && m.settings_schema.has_key('edge-tiling')) {
        if (ext.saved_edge_tiling === undefined) ext.saved_edge_tiling = m.get_boolean('edge-tiling');
        m.set_boolean('edge-tiling', Boolean(enable));
    }
}

export function restore_edge_tiling(ext) {
    const m = ext.settings?.mutter;
    if (ext.saved_edge_tiling !== undefined && m && m.settings_schema.has_key('edge-tiling')) {
        m.set_boolean('edge-tiling', Boolean(ext.saved_edge_tiling));
    }
}

export function clear_seahorse_peeks(ext) {
    if (!ext.seahorse_peeks) return;
    for (const pair of ext.seahorse_peeks.values()) {
        pair.left?.destroy?.();
        pair.right?.destroy?.();
    }
    ext.seahorse_peeks.clear();
}

export function sync_seahorse_peeks(ext, strip_id, rects) {
    if (!global.window_group) return;
    if (!ext.seahorse_peeks) ext.seahorse_peeks = new Map();
    const key = `${strip_id[0]}:${strip_id[1]}`;
    const active = strip_id[1] === ext.active_workspace() || ext.should_ignore_workspace(strip_id[0]);
    if (!rects || !active || (!rects.left && !rects.right)) {
        const old = ext.seahorse_peeks.get(key);
        if (old) { old.left?.destroy?.(); old.right?.destroy?.(); ext.seahorse_peeks.delete(key); }
        return;
    }
    let pair = ext.seahorse_peeks.get(key);
    if (!pair) { pair = { left: null, right: null }; ext.seahorse_peeks.set(key, pair); }
    for (const [side, delta] of [['left', -1], ['right', 1]]) {
        const r = rects[side];
        if (!r) {
            if (pair[side]) { pair[side].destroy(); pair[side] = null; }
            continue;
        }
        if (!pair[side]) {
            const btn = new St.Button({ style_class: 'kelp-seahorse-peek', reactive: true, can_focus: false });
            btn.connect('clicked', () => ext.auto_tiler?.focus_step?.(ext, delta));
            global.window_group.add_child(btn);
            pair[side] = btn;
        }
        pair[side].set_position(r.x, r.y);
        pair[side].set_size(r.width, r.height);
        pair[side].show();
    }
}

export function unload_theme(ext) {
    if (!ext.current_style) return;
    try {
        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        if (theme) {
            theme.unload_stylesheet(ext.current_style);
        }
    } catch (e) {
        log.debug(`failed to unload theme stylesheet: ${e}`);
    }
    ext.current_style = null;
}

export function load_theme(ext) {
    unload_theme(ext);
    try {
        const style = ext.settings.is_high_contrast()
            ? 'highcontrast.css'
            : ext.settings.is_dark_shell()
              ? 'dark.css'
              : 'light.css';
        const file = Gio.File.new_for_path(`${ext.path}/ui/${style}`);
        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        if (theme) {
            theme.load_stylesheet(file);
            ext.current_style = file;
        }
    } catch (e) {
        log.error(`failed to load theme stylesheet: ${e}`);
    }
}
