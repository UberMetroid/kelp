// SPDX-License-Identifier: GPL-3.0-or-later
// Workspace indexing, active/tab-list window queries, and directional focus helpers for `Ext`.

import Meta from 'gi://Meta';
import * as Ecs from '../engine/ecs/world.js';
import { cursor_rect } from '../engine/geom/movement.js';
import { NodeKind } from '../engine/octopus/node.js';

export function active_workspace() {
    const wsm = global.workspace_manager;
    return wsm ? wsm.get_active_workspace_index() : 0;
}

export function should_ignore_workspace(ext, monitor) {
    return (
        ext.settings.workspaces_only_on_primary() &&
        monitor !== global.display.get_primary_monitor()
    );
}

export function workspace_id(ext, window = null) {
    const id = window
        ? [window.meta.get_monitor(), window.workspace_id()]
        : [ext.active_monitor(), active_workspace()];
    if (should_ignore_workspace(ext, id[0])) {
        id[1] = 0;
    }
    id[0] = Math.max(0, id[0]);
    id[1] = Math.max(0, id[1]);
    return id;
}

export function previously_focused(ext, active) {
    for (const idx of [1, 0]) {
        const prev = ext.prev_focused[idx];
        if (prev && !Ecs.entity_eq(active.entity, prev)) {
            return prev;
        }
    }
    return null;
}

export function cursor_status() {
    const cursor = cursor_rect();
    const n_monitors = global.display ? global.display.get_n_monitors() : 0;
    for (let i = 0; i < n_monitors; i += 1) {
        const geom = global.display.get_monitor_geometry(i);
        if (
            geom &&
            cursor.x >= geom.x &&
            cursor.x < geom.x + geom.width &&
            cursor.y >= geom.y &&
            cursor.y < geom.y + geom.height
        ) {
            return [cursor, i];
        }
    }
    return [cursor, global.display ? global.display.get_current_monitor() : 0];
}

export function* windows_at_pointer(ext, cursor, monitor, workspace) {
    for (const entity of ext.monitors.find((m) => m[0] === monitor && m[1] === workspace)) {
        const win = ext.windows.with(entity, (w) => {
            if (
                w.stack_Previously_hidden ||
                w.meta.minimized ||
                w.meta.get_compositor_private()?.visible === false
            ) {
                return null;
            }
            return w.is_tilable(ext) && w.rect().contains(cursor) ? w : null;
        });
        if (win) yield win;
    }
}

export function active_window_list(ext) {
    const ws = global.workspace_manager.get_active_workspace();
    if (!ws) return [];
    return ext.tab_list(Meta.TabList.NORMAL_ALL, ws);
}

export function tab_list(ext, soort, workspace) {
    const windows = global.display.get_tab_list(soort, workspace);
    const matched = [];
    for (const win of windows) {
        const sw = ext.get_window(win);
        if (sw) matched.push(sw);
    }
    return matched;
}

export function focus_left(ext) {
    if (ext.auto_tiler?.is_seahorse) {
        ext.auto_tiler.focus_step(ext, -1);
        return;
    }
    const win = ext.focus_window();
    if (win && win.stack !== null && ext.auto_tiler) {
        const stack = ext.auto_tiler.forest.stacks.get(win.stack);
        if (stack && stack.active_id > 0) {
            const prev = stack.tabs[stack.active_id - 1];
            if (prev) {
                stack.activate(prev.entity);
                const target = ext.windows.get(prev.entity);
                if (target) {
                    target.activate(ext, true);
                    ext.on_focused(target);
                    return;
                }
            }
        }
    }
    focus_window_in(ext, (e, w) => e.focus_selector.left(e, w));
}

export function focus_right(ext) {
    if (ext.auto_tiler?.is_seahorse) {
        ext.auto_tiler.focus_step(ext, 1);
        return;
    }
    const win = ext.focus_window();
    if (win && win.stack !== null && ext.auto_tiler) {
        const stack = ext.auto_tiler.forest.stacks.get(win.stack);
        if (stack && stack.active_id + 1 < stack.tabs.length) {
            const next = stack.tabs[stack.active_id + 1];
            if (next) {
                stack.activate(next.entity);
                const target = ext.windows.get(next.entity);
                if (target) {
                    target.activate(ext, true);
                    ext.on_focused(target);
                    return;
                }
            }
        }
    }
    focus_window_in(ext, (e, w) => e.focus_selector.right(e, w));
}

export function focus_down(ext) {
    if (ext.auto_tiler?.is_seahorse) {
        ext.auto_tiler.focus_step(ext, 1);
        return;
    }
    focus_window_in(ext, (e, w) => e.focus_selector.down(e, w));
}

export function focus_up(ext) {
    if (ext.auto_tiler?.is_seahorse) {
        ext.auto_tiler.focus_step(ext, -1);
        return;
    }
    focus_window_in(ext, (e, w) => e.focus_selector.up(e, w));
}

function focus_window_in(ext, select) {
    const focused = ext.focus_window();
    if (!focused) return;
    const target = select(ext, focused);
    if (target) {
        target.activate(ext, true);
        ext.on_focused(target);
    }
}

export function on_focused(ext, win) {
    if (!win) return;
    ext.size_signals_unblock(win);

    const prev_entity = ext.focused_window_entity();
    if (prev_entity && !Ecs.entity_eq(prev_entity, win.entity)) {
        const prev = ext.windows.get(prev_entity);
        if (prev) prev.hide_border();
    }

    ext.prev_focused = [ext.prev_focused[1], win.entity];
    win.show_border(ext);

    if (ext.auto_tiler && win.is_tilable(ext)) {
        if (ext.auto_tiler.is_seahorse) {
            ext.auto_tiler.on_focused(ext, win);
            return;
        }
        const entity = ext.auto_tiler.attached.get(win.entity);
        const fork = entity ? ext.auto_tiler.forest.forks.get(entity) : null;
        if (fork) {
            const n = fork.left.is_in_stack(win.entity)
                ? fork.left
                : fork.right && fork.right.is_in_stack(win.entity)
                  ? fork.right
                  : null;
            if (n && n.inner.kind === NodeKind.STACK) {
                ext.auto_tiler.forest.stacks.get(n.inner.idx)?.activate(win.entity);
            }
        }
    }
}
