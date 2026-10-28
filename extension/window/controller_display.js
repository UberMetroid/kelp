// SPDX-License-Identifier: GPL-3.0-or-later
// Monitor workarea geometry queries, HiDPI scale factor, WM settings restore, and theme loader.

import Gio from 'gi://Gio';
import St from 'gi://St';
import { Rectangle } from '../engine/geom/rectangle.js';
import { cascade_otter_windows, snap_otter_window } from '../engine/otter/otter_tiler.js';
import { parse_rgba } from '../ui/settings/color.js';
import * as log from '../ui/settings/log.js';

export { cascade_otter_windows, snap_otter_window };

export function sync_accent_styles(ext) {
    if (ext.settings?.is_high_contrast?.()) {
        if (ext.overlay) ext.overlay.style = null;
        if (ext.seahorse_peeks) {
            for (const p of ext.seahorse_peeks.values()) {
                if (p.left) p.left.style = null;
                if (p.right) p.right.style = null;
            }
        }
        return;
    }
    const c = parse_rgba(ext.settings?.hint_color_rgba?.() ?? 'rgb(255,0,0)');
    if (ext.overlay) {
        ext.overlay.style = `background-color: rgba(${c.red}, ${c.green}, ${c.blue}, 0.25); ` +
            `border: 2px solid rgba(${c.red}, ${c.green}, ${c.blue}, 0.85);`;
    }
    if (ext.seahorse_peeks) {
        const peek_css = `background-color: rgba(${c.red}, ${c.green}, ${c.blue}, 0.24); ` +
            `border: 2px solid rgba(${c.red}, ${c.green}, ${c.blue}, 0.78);`;
        for (const p of ext.seahorse_peeks.values()) {
            if (p.left) p.left.style = peek_css;
            if (p.right) p.right.style = peek_css;
        }
    }
}

export function monitor_work_area(_ext, monitor) {
    const n_mon = Math.max(1, global.display?.get_n_monitors?.() ?? 1);
    const mon = Math.max(0, Math.min(n_mon - 1, Number(monitor) | 0));
    const ws = global.workspace_manager?.get_active_workspace?.();
    const area = ws
        ? ws.get_work_area_for_monitor(mon)
        : global.display?.get_monitor_geometry?.(mon);
    return area ? Rectangle.from_meta(area) : new Rectangle([0, 0, 1920, 1080]);
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
    ext.auto_tiler.forest.remap_toplevels(ext, n_monitors, n_ws, workareas_only);
}

export function set_edge_tiling(ext, enable) {
    const m = ext.settings.mutter;
    if (m && m.settings_schema.has_key('edge-tiling')) {
        if (ext.saved_edge_tiling === undefined) ext.saved_edge_tiling = m.get_boolean('edge-tiling');
        m.set_boolean('edge-tiling', Boolean(enable));
    }
    const wm = ext.settings.wm;
    if (wm && wm.settings_schema.has_key('focus-mode') && ext.saved_focus_mode === undefined) {
        ext.saved_focus_mode = wm.get_string('focus-mode');
    }
}

export function restore_edge_tiling(ext) {
    const m = ext.settings?.mutter;
    if (ext.saved_edge_tiling !== undefined && m && m.settings_schema.has_key('edge-tiling')) {
        m.set_boolean('edge-tiling', Boolean(ext.saved_edge_tiling));
    }
    const wm = ext.settings?.wm;
    if (ext.saved_focus_mode !== undefined && wm && wm.settings_schema.has_key('focus-mode')) {
        wm.set_string('focus-mode', String(ext.saved_focus_mode));
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
    let has_fs = false;
    if (ext.windows) {
        for (const [, w] of ext.windows.iter()) {
            if (!w.meta?.minimized && w.meta?.is_fullscreen?.() && w.meta.get_monitor?.() === strip_id[0]) {
                has_fs = true;
                break;
            }
        }
    }
    if (!rects || !active || has_fs || (!rects.left && !rects.right)) {
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
            const btn = new St.Button({
                style_class: 'kelp-seahorse-peek',
                reactive: true,
                can_focus: false,
            });
            btn.connect('clicked', () => ext.auto_tiler?.focus_step?.(ext, delta, true));
            global.window_group.add_child(btn);
            pair[side] = btn;
        }
        pair[side].set_position(r.x, r.y);
        pair[side].set_size(r.width, r.height);
        pair[side].show();
    }
    sync_accent_styles(ext);
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
        sync_accent_styles(ext);
    } catch (e) {
        log.error(`failed to load theme stylesheet: ${e}`);
    }
}
