// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Otter floating & edge-snap engine (`cascade_otter_windows`, `snap_otter_window`) restoring
//   floating window geometry, gently cascading overlapping windows, and snapping windows to
//   50% left/right (Left/Right), 100% full-screen (Up), or centered floating frames (Down).
// - Zero-Trust Boundary & Invariants:
//   Purely process-agnostic JS geometry module (imports ONLY `../geom/rectangle.js` — zero
//   `gi://` typelibs) so it can be unit-tested headlessly in `gjs -m`. Never calls `show()` on
//   minimized windows or windows on inactive workspaces.

import { Rectangle } from '../geom/rectangle.js';

export function is_on_active_workspace(win, ext) {
    if (!win || win.meta?.minimized) return false;
    if (!ext?.active_workspace) return true;
    const mon = win.meta?.get_monitor?.() ?? 0;
    if (ext.should_ignore_workspace?.(mon)) return true;
    return (win.workspace_id?.() ?? 0) === ext.active_workspace();
}

export function cascade_otter_windows(ext) {
    let idx = 0;
    const seen = new Set();
    for (const [, win] of ext.windows.iter()) {
        if (!win.is_tilable(ext) || win.meta?.minimized) continue;
        if (!is_on_active_workspace(win, ext)) continue;
        win.meta?.get_compositor_private?.()?.show?.();
        const mon = win.meta?.get_monitor?.() ?? 0;
        const saved = win.floating_rect;
        const sig = saved ? `${mon}:${saved.x}:${saved.y}:${saved.width}:${saved.height}` : null;
        if (saved && !seen.has(sig)) {
            seen.add(sig);
            win.move(ext, saved.clone());
            continue;
        }
        const area = ext.monitor_work_area(mon);
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
    const area = ext.monitor_work_area(win.meta.get_monitor());
    const g = ext.gap_outer;
    const hw = Math.floor((area.width - g * 3) / 2);
    const fh = Math.max(120, area.height - g * 2);
    let rect;
    if (dir === 0) {
        rect = new Rectangle([area.x + g, area.y + g, hw, fh]);
    } else if (dir === 2) {
        rect = new Rectangle([area.x + g * 2 + hw, area.y + g, hw, fh]);
    } else if (dir === 1) {
        rect = new Rectangle([area.x + g, area.y + g, area.width - g * 2, fh]);
    } else {
        const w = Math.max(360, Math.round(area.width * 0.68));
        const h = Math.max(260, Math.round(area.height * 0.72));
        rect = new Rectangle([
            area.x + Math.round((area.width - w) / 2),
            area.y + Math.round((area.height - h) / 2),
            w,
            h,
        ]);
    }
    win.floating_rect = rect.clone();
    win.move(ext, rect);
    ext.register_fn(() => win.activate(ext, true));
}
