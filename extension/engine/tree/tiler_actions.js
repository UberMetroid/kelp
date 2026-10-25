// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Directional stack detachment (`move_from_stack`, `move_alongside_stack`), automatic
//   tree sibling/monitor movement (`move_auto`), keyboard resize (`resize_auto`), modal
//   commit (`accept_tile`), and multi-monitor raycasting (`locate_monitor`).
// - Zero-Trust Boundary & Invariants:
//   `locate_monitor` verifies `win.actor_exists()` and bounds monitor iteration by
//   `global.display.get_n_monitors()`. `move_auto` sets `focused.ignore_detach = true`
//   so reattaching a window on a neighbor avoids spurious floating-rectangle restoration.

import Meta from 'gi://Meta';
import * as Ecs from '../ecs/world.js';
import * as Rect from '../geom/rectangle.js';
import * as geom from '../geom/rectangle.js';
import { GrabOp } from '../geom/movement.js';
import * as Log from '../../ui/settings/log.js';
import { ShellWindow } from '../../window/shell_window.js';
import * as Node from './node.js';
import { Direction } from './tiler.js';

export function unstack_from_fork(ext, stack, focused, fork, left, right, is_left) {
    if (!ext.auto_tiler) return null;
    const forest = ext.auto_tiler.forest;
    const new_fork = forest.create_fork(left, right, fork.area, fork.workspace, fork.monitor);
    if (is_left) fork.left = Node.Node.fork(new_fork[0]);
    else fork.right = Node.Node.fork(new_fork[0]);
    forest.parents.insert(new_fork[0], fork.entity);
    forest.on_attach(new_fork[0], focused.entity);
    for (const e of stack.entities) forest.on_attach(new_fork[0], e);
    return new_fork[1];
}

function reset_smart_gap_area(ext, fork) {
    if (fork.is_toplevel && fork.smart_gapped) {
        fork.smart_gapped = false;
        const rect = ext.monitor_work_area(fork.monitor);
        rect.apply(new Rect.Rectangle([ext.gap_outer, ext.gap_outer, -ext.gap_outer * 2, -ext.gap_outer * 2]));
        fork.set_area(rect);
    }
}

export function move_alongside_stack(tiler, ext, [fork, branch, is_left], focused, direction) {
    if (!ext.auto_tiler) return;
    reset_smart_gap_area(ext, fork);
    const { HORIZONTAL, VERTICAL } = Rect.Orientation;
    const [orientation, reverse] =
        direction === Direction.Left ? [HORIZONTAL, false]
        : direction === Direction.Right ? [HORIZONTAL, true]
        : direction === Direction.Up ? [VERTICAL, false]
        : [VERTICAL, true];
    const inner = branch.inner;
    Node.stack_remove(ext.auto_tiler.forest, inner, focused.entity);
    ext.auto_tiler.detach_window(ext, focused.entity);
    focused.stack = null;
    let new_fork = null;
    if (fork.right) {
        const [left, right] = reverse ? [branch, Node.Node.window(focused.entity)] : [Node.Node.window(focused.entity), branch];
        new_fork = unstack_from_fork(ext, inner, focused, fork, left, right, is_left);
    } else if (reverse) {
        fork.right = Node.Node.window(focused.entity);
    } else {
        fork.right = fork.left;
        fork.left = Node.Node.window(focused.entity);
    }
    const modifier = new_fork ?? fork;
    modifier.set_orientation(orientation);
    ext.auto_tiler.forest.on_attach(modifier.entity, focused.entity);
    ext.auto_tiler.tile(ext, fork, fork.area);
    tiler.overlay_watch(ext, focused);
}

export function move_from_stack(tiler, ext, [fork, branch, is_left], focused, direction, force_detach = false) {
    if (!ext.auto_tiler) return;
    const inner = branch.inner;
    if (inner.entities.length === 1) {
        ext.auto_tiler.toggle_stacking(ext);
        tiler.overlay_watch(ext, focused);
        return;
    }
    reset_smart_gap_area(ext, fork);
    const forest = ext.auto_tiler.forest, fentity = focused.entity;
    const detach = (orient, reverse) => {
        if (!ext.auto_tiler) return;
        focused.stack = null;
        let new_fork = null;
        if (fork.right) {
            const [left, right] = reverse ? [branch, Node.Node.window(fentity)] : [Node.Node.window(fentity), branch];
            new_fork = unstack_from_fork(ext, inner, focused, fork, left, right, is_left);
        } else if (reverse) {
            fork.right = Node.Node.window(fentity);
        } else {
            fork.right = fork.left;
            fork.left = Node.Node.window(fentity);
        }
        const modifier = new_fork ?? fork;
        modifier.set_orientation(orient);
        forest.on_attach(modifier.entity, fentity);
        ext.auto_tiler.tile(ext, fork, fork.area);
        tiler.overlay_watch(ext, focused);
    };
    if (direction === Direction.Left) {
        if (force_detach || !Node.stack_move_left(ext, forest, inner, fentity)) {
            if (force_detach) Node.stack_remove(forest, inner, fentity);
            detach(Rect.Orientation.HORIZONTAL, false);
        }
        ext.auto_tiler.update_stack(ext, inner);
    } else if (direction === Direction.Right) {
        if (force_detach || !Node.stack_move_right(ext, forest, inner, fentity)) {
            if (force_detach) Node.stack_remove(forest, inner, fentity);
            detach(Rect.Orientation.HORIZONTAL, true);
        }
        ext.auto_tiler.update_stack(ext, inner);
    } else if (direction === Direction.Up) {
        Node.stack_remove(forest, inner, fentity);
        detach(Rect.Orientation.VERTICAL, false);
    } else if (direction === Direction.Down) {
        Node.stack_remove(forest, inner, fentity);
        detach(Rect.Orientation.VERTICAL, true);
    }
}

export function resize_auto(tiler, ext, direction) {
    const hrow = 64, hcolumn = 64;
    const [mov1, mov2] =
        direction === Direction.Left ? [[hrow, 0, -hrow, 0], [0, 0, -hrow, 0]]
        : direction === Direction.Right ? [[0, 0, hrow, 0], [-hrow, 0, hrow, 0]]
        : direction === Direction.Up ? [[0, hcolumn, 0, -hcolumn], [0, 0, 0, -hcolumn]]
        : [[0, 0, 0, hcolumn], [0, -hcolumn, 0, hcolumn]];
    if (!ext.auto_tiler || !tiler.window) return;
    const entity = ext.auto_tiler.attached.get(tiler.window);
    const fork = entity ? ext.auto_tiler.forest.forks.get(entity) : null;
    const window = ext.windows.get(tiler.window);
    if (!fork || !window) return;
    const toplevel = ext.auto_tiler.forest.find_toplevel(ext.workspace_id(window));
    const topfork = toplevel ? ext.auto_tiler.forest.forks.get(toplevel) : null;
    if (!topfork) return;
    const grab_op = new GrabOp(tiler.window, window.rect());
    const crect = grab_op.rect.clone();
    const apply_step = (mov) => {
        crect.apply(new Rect.Rectangle(mov));
        const before = crect.clone();
        crect.clamp(topfork.area);
        const diff = before.diff(crect);
        crect.apply(new Rect.Rectangle([0, 0, -diff.x, -diff.y]));
        if (crect.eq(grab_op.rect)) return;
        ext.auto_tiler.forest.resize(ext, entity, fork, tiler.window, grab_op.operation(crect), crect);
        grab_op.rect = crect.clone();
    };
    apply_step(mov1);
    apply_step(mov2);
    ext.auto_tiler.forest.arrange(ext, fork.workspace);
    ext.register_fn(() => ext.set_overlay(window.rect()));
}

export function move_auto(tiler, ext, focused, move_to, stack_from_left = true) {
    let watching = null;
    const at = ext.auto_tiler;
    if (at) {
        if (move_to instanceof ShellWindow) {
            const stack_info = at.find_stack(move_to.entity);
            if (stack_info) {
                const [stack_fork, branch] = stack_info;
                focused.ignore_detach = true;
                at.detach_window(ext, focused.entity);
                at.forest.on_attach(stack_fork.entity, focused.entity);
                at.update_stack(ext, branch.inner);
                at.tile(ext, stack_fork, stack_fork.area);
                focused.ignore_detach = true;
                at.detach_window(ext, focused.entity);
                at.attach_to_window(ext, move_to, focused, { auto: 0 }, stack_from_left);
                watching = focused;
            } else {
                const parent = at.windows_are_siblings(focused.entity, move_to.entity);
                const fork = parent ? at.forest.forks.get(parent) : null;
                if (fork) {
                    if (!fork.right) { Log.error('move_auto: fork lacks right branch'); return; }
                    if (fork.left.inner.kind === Node.NodeKind.STACK) {
                        Node.stack_remove(at.forest, fork.left.inner, focused.entity);
                        focused.stack = null;
                    } else {
                        fork.swap_branches();
                        at.tile(ext, fork, fork.area);
                        watching = focused;
                    }
                }
                if (!watching) {
                    focused.ignore_detach = true;
                    at.detach_window(ext, focused.entity);
                    at.attach_to_window(ext, move_to, focused, { src: focused.meta.get_frame_rect() }, false);
                    watching = focused;
                }
            }
        } else {
            focused.ignore_detach = true;
            at.detach_window(ext, focused.entity);
            at.attach_to_workspace(ext, focused, [move_to, ext.active_workspace()]);
            watching = focused;
        }
    }
    if (watching) tiler.overlay_watch(ext, watching);
    else ext.set_overlay(focused.rect());
}

export function accept_tile(tiler, ext) {
    const meta = tiler.window ? ext.windows.get(tiler.window) : null;
    if (meta) {
        let tree_swapped = false;
        const meta_swap = tiler.swap_window ? ext.windows.get(tiler.swap_window) : null;
        if (meta_swap) {
            if (ext.auto_tiler && !ext.auto_tiler.is_seahorse) {
                tree_swapped = true;
                ext.auto_tiler.attach_swap(ext, tiler.swap_window, tiler.window);
            } else {
                ext.size_signals_block(meta_swap);
                meta_swap.move(ext, meta.rect(), () => ext.size_signals_unblock(meta_swap));
            }
            ext.register_fn(() => meta.activate(true));
        }
        if (!tree_swapped && !ext.auto_tiler?.is_seahorse) {
            ext.size_signals_block(meta);
            const meta_entity = tiler.window;
            meta.move(ext, ext.overlay, () => {
                ext.size_signals_unblock(meta);
                ext.add_tag(meta_entity, Ecs.Tiled);
            });
        }
    }
    tiler.swap_window = null;
    tiler.exit(ext);
}

export function locate_monitor(win, direction) {
    if (!win.actor_exists()) return null;
    const from = win.meta.get_monitor();
    const ref = win.meta.get_work_area_for_monitor(from);
    const n_monitors = global.display.get_n_monitors();
    const { UP, DOWN, LEFT } = Meta.DisplayDirection;
    const [origin, exclude] =
        direction === UP ? [[ref.x + ref.width / 2, ref.y], (r) => r.y > ref.y]
        : direction === DOWN ? [[ref.x + ref.width / 2, ref.y + ref.height], (r) => r.y < ref.y]
        : direction === LEFT ? [[ref.x, ref.y + ref.height / 2], (r) => r.x > ref.x]
        : [[ref.x + ref.width, ref.y + ref.height / 2], (r) => r.x < ref.x];
    let next = null;
    for (let mon = 0; mon < n_monitors; mon += 1) {
        if (mon === from) continue;
        const work_area = win.meta.get_work_area_for_monitor(mon);
        if (!work_area || exclude(work_area)) continue;
        const weight = geom.shortest_side(origin, work_area);
        if (next === null || next[1] > weight) next = [mon, weight, work_area];
    }
    return next ? [next[0], next[2]] : null;
}
