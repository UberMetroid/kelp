// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Interactive drag-and-drop placement (`on_drop`, `place_or_stack`, `cursor_placement`),
//   window tree swapping (`attach_swap`), floating toggle (`toggle_floating_window`), and
//   stack unwrapping (`unstack_window`).
// - Zero-Trust Boundary & Invariants:
//   Validates that the dropped or swapped window's parent fork and target sibling still exist
//   in the ECS world before mutating branches or creating/destroying a stack. Purely
//   synchronous tree updates with zero background timers or subprocesses.

import * as Ecs from '../ecs/world.js';
import * as geom from '../geom/rectangle.js';
import { Direction } from '../modal/modal_tiler.js';
import * as node from './node.js';

export function cursor_placement(ext, area, cursor) {
    const { LEFT, RIGHT, TOP, BOTTOM } = geom.Side;
    const { HORIZONTAL, VERTICAL } = geom.Orientation;
    const [, side] = geom.nearest_side(ext, [cursor.x, cursor.y], area);
    const res =
        side === LEFT ? [HORIZONTAL, true]
        : side === RIGHT ? [HORIZONTAL, false]
        : side === TOP ? [VERTICAL, true]
        : side === BOTTOM ? [VERTICAL, false]
        : null;
    return res ? { orientation: res[0], swap: res[1] } : null;
}

export function attach_swap(auto_tiler, ext, a, b) {
    const a_ent = auto_tiler.attached.get(a), b_ent = auto_tiler.attached.get(b);
    let a_win = ext.windows.get(a), b_win = ext.windows.get(b);
    if (!a_ent || !b_ent || !a_win || !b_win) return;
    const a_fork = auto_tiler.forest.forks.get(a_ent), b_fork = auto_tiler.forest.forks.get(b_ent);
    if (!a_fork || !b_fork) return;
    const a_stack = a_win.stack, b_stack = b_win.stack;
    if (ext.auto_tiler) {
        if (a_win.stack !== null) {
            const stack = ext.auto_tiler.forest.stacks.get(a_win.stack);
            if (stack) {
                a = stack.active;
                a_win = ext.windows.get(a);
                if (!a_win) return;
                stack.deactivate(a_win);
            }
        }
        if (b_win.stack !== null) {
            const stack = ext.auto_tiler.forest.stacks.get(b_win.stack);
            if (stack) {
                b = stack.active;
                b_win = ext.windows.get(b);
                if (!b_win) return;
                stack.deactivate(b_win);
            }
        }
    }
    const a_fn = a_fork.replace_window(ext, a_win, b_win);
    auto_tiler.forest.on_attach(a_ent, b);
    const b_fn = b_fork.replace_window(ext, b_win, a_win);
    auto_tiler.forest.on_attach(b_ent, a);
    if (a_fn) a_fn();
    if (b_fn) b_fn();
    a_win.stack = b_stack;
    b_win.stack = a_stack;
    a_win.meta.get_compositor_private()?.show();
    b_win.meta.get_compositor_private()?.show();
    auto_tiler.tile(ext, a_fork, a_fork.area);
    auto_tiler.tile(ext, b_fork, b_fork.area);
}

export function toggle_floating_window(auto_tiler, ext) {
    const focused = ext.focus_window();
    if (!focused) return;
    const wm_class = focused.meta.get_wm_class(), wm_title = focused.meta.get_title();
    const float_except = wm_class !== null && wm_title !== null && ext.conf.window_shall_float(wm_class, wm_title);
    if (float_except) {
        if (ext.contains_tag(focused.entity, Ecs.ForceTile)) {
            ext.delete_tag(focused.entity, Ecs.ForceTile);
            if (auto_tiler.attached.get(focused.entity)) auto_tiler.detach_window(ext, focused.entity);
        } else {
            ext.add_tag(focused.entity, Ecs.ForceTile);
            auto_tiler.auto_tile(ext, focused, false);
        }
    } else if (ext.contains_tag(focused.entity, Ecs.Floating)) {
        ext.delete_tag(focused.entity, Ecs.Floating);
        auto_tiler.auto_tile(ext, focused, false);
    } else if (auto_tiler.attached.get(focused.entity)) {
        auto_tiler.detach_window(ext, focused.entity);
        ext.add_tag(focused.entity, Ecs.Floating);
    }
    ext.register_fn(() => focused.activate(true));
}

export function unstack_window(auto_tiler, ext, fork, win, toggled = false) {
    const stack_toggle = (f, branch) => {
        if (branch.inner.entities.length === 1) {
            win.stack = null;
            auto_tiler.forest.stacks.remove(branch.inner.idx)?.destroy();
            f.measure(auto_tiler.forest, ext, f.area, auto_tiler.forest.on_record());
            return node.Node.window(win.entity);
        }
        return null;
    };
    if (toggled && fork.left.is_window(win.entity)) {
        auto_tiler.stack_left(ext, fork, win);
    } else if (fork.left.is_in_stack(win.entity)) {
        const n = stack_toggle(fork, fork.left);
        if (n) { fork.left = n; if (!fork.right) auto_tiler.forest.reassign_to_parent(fork, n); }
    } else if (toggled && fork.right?.is_window(win.entity)) {
        auto_tiler.stack_right(ext, fork, win);
    } else if (fork.right?.is_in_stack(win.entity)) {
        const n = stack_toggle(fork, fork.right);
        if (n) fork.right = n;
    }
    auto_tiler.tile(ext, fork, fork.area);
}

export function on_drop(auto_tiler, ext, win, via_overview = false) {
    const [cursor, monitor] = ext.cursor_status();
    const workspace = ext.active_workspace();
    if (win.rect().contains(cursor)) via_overview = false;
    const attach_mon = () => {
        const attach_to = auto_tiler.largest_on_workspace(ext, monitor, workspace);
        if (attach_to) auto_tiler.attach_to_window(ext, attach_to, win, { auto: 0 });
        else auto_tiler.attach_to_monitor(ext, win, [monitor, workspace], ext.settings.smart_gaps());
    };
    if (via_overview) {
        auto_tiler.detach_window(ext, win.entity);
        attach_mon();
        return;
    }
    let attach_to = null;
    for (const found of ext.windows_at_pointer(cursor, monitor, workspace)) {
        if (found !== win && auto_tiler.attached.contains(found.entity)) { attach_to = found; break; }
    }
    const fork = auto_tiler.get_parent_fork(win.entity);
    if (!fork) return;
    const windowless = auto_tiler.largest_on_workspace(ext, monitor, workspace) === null;
    if (attach_to === null) {
        if (fork.left.inner.kind === node.NodeKind.WINDOW && fork.right?.inner.kind === node.NodeKind.WINDOW) {
            const attaching = fork.left.is_window(win.entity) ? fork.right.inner.entity : fork.left.inner.entity;
            attach_to = ext.windows.get(attaching);
        } else if (!windowless) {
            auto_tiler.tile(ext, fork, fork.area);
            return true;
        }
    }
    if (windowless) {
        auto_tiler.detach_window(ext, win.entity);
        auto_tiler.attach_to_monitor(ext, win, [monitor, workspace], ext.settings.smart_gaps());
    } else if (attach_to) {
        place_or_stack(auto_tiler, ext, win, attach_to, cursor);
    } else {
        auto_tiler.detach_window(ext, win.entity);
        attach_mon();
    }
}

export function place_or_stack(auto_tiler, ext, win, attach_to, cursor) {
    const fork = auto_tiler.get_parent_fork(attach_to.entity);
    if (!fork) return true;
    const is_sibling = auto_tiler.windows_are_siblings(win.entity, attach_to.entity);
    const attach_area = (win.stack === null && is_sibling) ? fork.area : attach_to.meta.get_frame_rect();
    let placement = cursor_placement(ext, attach_area, cursor);
    const stack = ext.auto_tiler?.find_stack(attach_to.entity);
    const matching_stack = win.stack !== null && win.stack === attach_to.stack;
    const { Left, Up, Right, Down } = Direction;
    const swap = (o, d) => {
        fork.set_orientation(o);
        const is_left = fork.left.is_window(win.entity);
        if ((is_left && (d === Right || d === Down)) || (!is_left && (d === Left || d === Up)))
            fork.swap_branches();
        auto_tiler.tile(ext, fork, fork.area);
    };
    if (placement) {
        const direction = placement.orientation === geom.Orientation.HORIZONTAL
            ? (placement.swap ? Left : Right)
            : (placement.swap ? Up : Down);
        if (stack) {
            if (matching_stack) {
                ext.tiler.move_from_stack(ext, stack, win, direction, true);
                return true;
            } else if (attach_to.stack !== null) {
                const onto_stack = ext.auto_tiler?.find_stack(attach_to.entity);
                if (onto_stack) {
                    if (is_sibling && win.stack === null) swap(placement.orientation, direction);
                    else ext.tiler.move_alongside_stack(ext, onto_stack, win, direction);
                    return true;
                }
            }
        } else if (is_sibling && win.stack === null) {
            swap(placement.orientation, direction);
            return true;
        } else if (fork.is_toplevel && fork.right === null) {
            auto_tiler.detach_window(ext, win.entity);
            auto_tiler.attach_to_window(ext, attach_to, win, placement);
            swap(placement.orientation, direction);
            return true;
        }
    } else if (matching_stack) {
        auto_tiler.tile(ext, fork, fork.area);
        return true;
    } else {
        if (attach_to.stack === null) auto_tiler.create_stack(ext, attach_to);
        placement = { auto: 0 };
    }
    auto_tiler.detach_window(ext, win.entity);
    return auto_tiler.attach_to_window(ext, attach_to, win, placement);
}
