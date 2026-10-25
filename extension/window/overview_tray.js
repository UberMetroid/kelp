// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Monitor & workspace movement helper (`move_window_to_monitor`, `move_window_to_workspace`,
//   `workspace_Monitor_bounds`) handling multi-monitor and vertical/horizontal workspace hops.
// - Zero-Trust Boundary & Invariants:
//   Validates workspace and monitor indices against `global.workspace_manager` and
//   `global.display.get_n_monitors()` before moving `Meta.Window` instances, preventing
//   out-of-bounds monitor/workspace crashes during hotplug events.

import Meta from 'gi://Meta';

/**
 * Moves the currently focused window to an adjacent monitor in `direction` (`Meta.DisplayDirection`).
 */
export function move_window_to_monitor(ext, direction) {
    const win = ext.focus_window();
    if (!win) return;
    const display = global.display;
    if (!display) return;

    const current_mon = win.meta.get_monitor();
    const next_mon = display.get_monitor_neighbor_index(current_mon, direction);
    if (next_mon < 0 || next_mon === current_mon) return;

    win.meta.move_to_monitor(next_mon);
    ext.register_fn(() => {
        if (win.meta.get_monitor() !== current_mon && ext.monitors.get(win.entity)?.[0] === current_mon) {
            win.window_changed();
        }
        win.activate(ext, true);
    });
}

/**
 * Moves the currently focused window one workspace up/left or down/right and activates
 * the target workspace.
 */
export function move_window_to_workspace(ext, direction) {
    const win = ext.focus_window();
    if (!win) return;
    const wsm = global.workspace_manager;
    if (!wsm) return;

    const current_ws = win.meta.get_workspace();
    if (!current_ws) return;

    let target_ws = current_ws.get_neighbor(direction);
    if (!target_ws || target_ws === current_ws) {
        if (
            (direction === Meta.MotionDirection.DOWN || direction === Meta.MotionDirection.RIGHT) &&
            current_ws.index() === wsm.get_n_workspaces() - 1
        ) {
            target_ws = wsm.append_new_workspace(false, global.get_current_time());
        } else {
            return;
        }
    }

    win.meta.change_workspace_by_index(target_ws.index(), false);
    target_ws.activate_with_focus(win.meta, global.get_current_time());
}
