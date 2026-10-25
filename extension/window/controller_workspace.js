// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Workspace indexing (`workspace_id`), active/tab-list window queries (`focus_window`,
//   `active_window_list`), and geometric directional focus (`focus_selector`) for `Ext`.
// - Zero-Trust Boundary & Invariants:
//   Filters out destroyed or unmapped window actors before evaluating directional focus
//   and ensures stacked tab containers activate the target neighbor tab when focusing left/right.

import Meta from 'gi://Meta';
import * as Ecs from '../engine/ecs/world.js';
import { FocusSelector } from '../engine/geom/focus.js';
import * as node from '../engine/tree/node.js';

const focus_selector = new FocusSelector();

export function active_workspace() {
    const wsm = global.workspace_manager;
    return wsm ? wsm.get_active_workspace_index() : 0;
}

export function workspace_id(ext, window) {
    const id = window
        ? [window.meta.get_monitor(), window.workspace_id()]
        : [ext.active_monitor(), active_workspace()];
    if (ext.settings.workspaces_only_on_primary() && id[0] !== global.display.get_primary_monitor()) {
        id[1] = 0;
    }
    return id;
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
    focus_window_in(ext, (f, w) => focus_selector.left(f, w));
}

export function focus_right(ext) {
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
    focus_window_in(ext, (f, w) => focus_selector.right(f, w));
}

export function focus_down(ext) {
    focus_window_in(ext, (f, w) => focus_selector.down(f, w));
}

export function focus_up(ext) {
    focus_window_in(ext, (f, w) => focus_selector.up(f, w));
}

function focus_window_in(ext, select) {
    const focused = ext.focus_window();
    if (!focused) return;
    const candidates = active_window_list(ext).filter((w) => {
        if (Ecs.entity_eq(w.entity, focused.entity)) return false;
        if (w.stack !== null && ext.auto_tiler) {
            const stack = ext.auto_tiler.forest.stacks.get(w.stack);
            if (stack && !Ecs.entity_eq(stack.active, w.entity)) return false;
        }
        return true;
    });
    const target = select(focused, candidates);
    if (target) {
        target.activate(ext, true);
        ext.on_focused(target);
    }
}

export function on_focused(ext, win) {
    ext.size_signals_unblock(win);
    if (!win) return;

    const prev_entity = ext.focused_window_entity();
    if (prev_entity && !Ecs.entity_eq(prev_entity, win.entity)) {
        const prev = ext.windows.get(prev_entity);
        if (prev) prev.hide_border();
    }

    ext.prev_focused = [ext.prev_focused[1], win.entity];
    win.show_border(ext);

    if (ext.auto_tiler && win.is_tilable(ext)) {
        const entity = ext.auto_tiler.attached.get(win.entity);
        if (entity) {
            const fork = ext.auto_tiler.forest.forks.get(entity);
            if (fork) {
                const n = fork.left.is_in_stack(win.entity)
                    ? fork.left
                    : fork.right && fork.right.is_in_stack(win.entity)
                      ? fork.right
                      : null;
                if (n && n.inner.kind === 3) {
                    const stack = ext.auto_tiler.forest.stacks.get(n.inner.idx);
                    if (stack) stack.activate(win.entity);
                }
            }
        }
    }
}
