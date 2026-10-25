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
import * as log from '../ui/settings/log.js';

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
    if (!ext.auto_tiler) return;
    if (ext.ignore_display_update) {
        ext.ignore_display_update = false;
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

    const smart_gaps = ext.settings.smart_gaps();
    if (!workareas_only) {
        for (const [fork_id] of ext.auto_tiler.forest.toplevel.values()) {
            const fork = ext.auto_tiler.forest.forks.get(fork_id);
            if (!fork) continue;
            const mon = fork.monitor < n_monitors ? fork.monitor : 0;
            fork.monitor = mon;
            ext.auto_tiler.update_toplevel(ext, fork, mon, smart_gaps);
        }
        return;
    }

    ext.update_snapped();
    for (const [fork_id] of ext.auto_tiler.forest.toplevel.values()) {
        const fork = ext.auto_tiler.forest.forks.get(fork_id);
        if (!fork) continue;
        const mon = fork.monitor < n_monitors ? fork.monitor : 0;
        ext.auto_tiler.update_toplevel(ext, fork, mon, smart_gaps);
    }
}

export function set_edge_tiling(ext, enable) {
    const m = ext.settings.mutter;
    if (m && m.settings_schema.has_key('edge-tiling')) {
        m.set_boolean('edge-tiling', Boolean(enable));
    }
}

export function cascade_otter_windows(ext) {
    let idx = 0;
    const seen = new Set();
    for (const [, win] of ext.windows.iter()) {
        win.meta?.get_compositor_private?.()?.show?.();
        if (!win.is_tilable(ext) || win.meta.minimized) continue;
        const mon = win.meta.get_monitor();
        const saved = win.floating_rect;
        const sig = saved ? `${mon}:${saved.x}:${saved.y}:${saved.width}:${saved.height}` : null;
        if (saved && !seen.has(sig)) {
            seen.add(sig);
            win.move(ext, saved.clone());
            continue;
        }
        const area = monitor_work_area(ext, mon);
        const step = (idx % 6) * 28;
        const w = Math.max(360, Math.round(area.width * 0.68));
        const h = Math.max(260, Math.round(area.height * 0.72));
        const x = area.x + Math.round((area.width - w) / 4) + step;
        const y = area.y + Math.round((area.height - h) / 4) + step;
        const rect = new Rectangle([x, y, w, h]);
        win.floating_rect = rect.clone();
        win.move(ext, rect);
        idx += 1;
    }
}

export function snap_otter_window(ext, dir) {
    const win = ext.focus_window();
    if (!win) return;
    const area = monitor_work_area(ext, win.meta.get_monitor());
    const g = ext.gap_outer;
    const hw = Math.floor((area.width - g * 3) / 2);
    const fh = Math.max(120, area.height - g * 2);
    if (dir === 0) {
        win.move(ext, new Rectangle([area.x + g, area.y + g, hw, fh]));
    } else if (dir === 2) {
        win.move(ext, new Rectangle([area.x + g * 2 + hw, area.y + g, hw, fh]));
    } else if (dir === 1) {
        win.move(ext, new Rectangle([area.x + g, area.y + g, area.width - g * 2, fh]));
    } else {
        const w = Math.max(360, Math.round(area.width * 0.68));
        const h = Math.max(260, Math.round(area.height * 0.72));
        win.move(
            ext,
            new Rectangle([
                area.x + Math.round((area.width - w) / 2),
                area.y + Math.round((area.height - h) / 2),
                w,
                h,
            ]),
        );
    }
    ext.register_fn(() => win.activate(ext, true));
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
