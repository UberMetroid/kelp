// SPDX-License-Identifier: GPL-3.0-or-later
// Otter floating and edge-snap engine restoring geometry, cascading, and edge snapping.

import { Rectangle } from '../geom/rectangle.js';

export function is_on_active_workspace(win, ext) {
    if (!win || win.meta?.minimized) return false;
    if (!ext?.active_workspace) return true;
    const mon = win.meta?.get_monitor?.() ?? 0;
    if (ext.should_ignore_workspace?.(mon)) return true;
    return (win.workspace_id?.() ?? 0) === ext.active_workspace();
}

export function is_full_work_area_rect(rect, area, gap = 0) {
    if (!rect || !area) return false;
    const min_w = Math.max(1, area.width - gap * 2 - 24);
    const min_h = Math.max(1, area.height - gap * 2 - 24);
    return rect.width >= min_w && rect.height >= min_h;
}

export function cascade_otter_windows(ext, focused = ext.focus_window?.()) {
    const groups = new Map();
    for (const [, win] of ext.windows.iter()) {
        if (!win.is_tilable(ext) || win.meta?.minimized) continue;
        const [mon, ws] = ext.workspace_id ? ext.workspace_id(win) : [win.meta?.get_monitor?.() ?? 0, win.workspace_id?.() ?? 0];
        const key = `${mon}:${ws}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(win);
    }
    for (const wins of groups.values()) {
        if (focused && wins.indexOf(focused) !== -1 && wins.indexOf(focused) < wins.length - 1) {
            wins.splice(wins.indexOf(focused), 1);
            wins.push(focused);
        }
        let idx = 0;
        const seen = new Set();
        for (const win of wins) {
            if (is_on_active_workspace(win, ext)) win.meta?.get_compositor_private?.()?.show?.();
            else win.meta?.get_compositor_private?.()?.hide?.();
            const mon = win.meta?.get_monitor?.() ?? 0;
            const area = ext.monitor_work_area(mon);
            const saved = win.floating_rect;
            const is_full = is_full_work_area_rect(saved, area, ext.gap_outer ?? 0);
            const sig = saved && !is_full ? `${mon}:${saved.x}:${saved.y}:${saved.width}:${saved.height}` : null;
            if (sig && !seen.has(sig)) {
                seen.add(sig);
                win.move(ext, saved.clone());
                continue;
            }
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
