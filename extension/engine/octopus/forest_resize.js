// SPDX-License-Identifier: GPL-3.0-or-later
// BSP tree detachment, parent/sibling reassignment, and interactive fork boundary resizing.

import { Movement } from '../geom/movement.js';
import * as log from '../../ui/settings/log.js';
import * as Node from './node.js';

const { DOWN, UP, LEFT, RIGHT } = Movement;
const MAX_PARENT_DEPTH = 64;

export function detach_from_forest(forest, ext, fork_entity, window) {
    const fork = forest.forks.get(fork_entity);
    if (!fork) return null;
    let reflow_fork = null;
    let stack_detach = false;
    const parent = forest.parents.get(fork_entity);
    if (fork.left.is_window(window)) {
        if (parent && fork.right) {
            const pfork = reassign_child_to_parent(forest, fork_entity, parent, fork.right);
            if (!pfork) return null;
            reflow_fork = [parent, pfork];
        } else if (fork.right) {
            reflow_fork = [fork_entity, fork];
            if (fork.right.inner.kind === Node.NodeKind.FORK) {
                reassign_children_to_parent(forest, fork_entity, fork.right.inner.entity, fork);
            } else {
                fork.left = fork.right;
                fork.right = null;
            }
        } else {
            forest.delete_entity(fork_entity);
        }
    } else if (fork.left.is_in_stack(window)) {
        reflow_fork = [fork_entity, fork];
        stack_detach = true;
        remove_from_stack(forest, ext, fork.left.inner, window, () => {
            if (fork.right) {
                fork.left = fork.right;
                fork.right = null;
                if (parent) {
                    const pfork = reassign_child_to_parent(forest, fork_entity, parent, fork.left);
                    reflow_fork = pfork ? [parent, pfork] : null;
                }
            } else {
                forest.delete_entity(fork.entity);
                reflow_fork = null;
            }
        });
    } else if (fork.right) {
        if (fork.right.is_window(window)) {
            if (parent) {
                const pfork = reassign_child_to_parent(forest, fork_entity, parent, fork.left);
                if (!pfork) return null;
                reflow_fork = [parent, pfork];
            } else {
                reflow_fork = [fork_entity, fork];
                if (fork.left.inner.kind === Node.NodeKind.FORK) {
                    reassign_children_to_parent(forest, fork_entity, fork.left.inner.entity, fork);
                } else {
                    fork.right = null;
                }
            }
        } else if (fork.right.is_in_stack(window)) {
            reflow_fork = [fork_entity, fork];
            stack_detach = true;
            remove_from_stack(forest, ext, fork.right.inner, window, () => {
                fork.right = null;
                if (parent) {
                    const pfork = reassign_child_to_parent(forest, fork_entity, parent, fork.left);
                    reflow_fork = pfork ? [parent, pfork] : null;
                }
            });
        }
    }
    if (stack_detach) ext.windows.with(window, (w) => (w.stack = null));
    forest.on_detach(window);
    if (reflow_fork && !stack_detach) {
        reflow_fork[1].rebalance_orientation();
        if (!reflow_fork[1].right) {
            reflow_fork[1].orientation_changed = false;
            reflow_fork[1].set_ratio(reflow_fork[1].length() / 2);
        }
    }
    return reflow_fork;
}

export function reassign_sibling(forest, sibling, parent) {
    if (sibling.inner.kind === Node.NodeKind.FORK) {
        forest.parents.insert(sibling.inner.entity, parent);
    } else if (sibling.inner.kind === Node.NodeKind.WINDOW) {
        forest.on_attach(parent, sibling.inner.entity);
    } else if (sibling.inner.kind === Node.NodeKind.STACK) {
        for (const entity of sibling.inner.entities) forest.on_attach(parent, entity);
    }
}

export function reassign_child_to_parent(forest, child_entity, parent_entity, branch) {
    const parent = forest.forks.get(parent_entity);
    if (parent) {
        if (parent.left.is_fork(child_entity)) parent.left = branch;
        else parent.right = branch;
        reassign_sibling(forest, branch, parent_entity);
        forest.delete_entity(child_entity);
    }
    return parent;
}

export function reassign_to_parent(forest, child, reassign) {
    const p = forest.parents.get(child.entity);
    if (p) {
        const p_fork = forest.forks.get(p);
        if (p_fork) {
            if (p_fork.left.is_fork(child.entity)) p_fork.left = reassign;
            else p_fork.right = reassign;
            reassign_sibling(forest, reassign, p);
        }
        forest.delete_entity(child.entity);
    }
}

export function reassign_children_to_parent(forest, parent_entity, child_entity, p_fork) {
    const c_fork = forest.forks.get(child_entity);
    if (c_fork) {
        p_fork.left = c_fork.left;
        p_fork.right = c_fork.right;
        p_fork.rebalance_orientation();
        p_fork.orientation_changed = false;
        p_fork.set_ratio(p_fork.length() / 2);
        reassign_sibling(forest, p_fork.left, parent_entity);
        if (p_fork.right) reassign_sibling(forest, p_fork.right, parent_entity);
        forest.delete_entity(child_entity);
    } else {
        log.error(`Fork(${child_entity}) does not exist`);
    }
}

export function remove_from_stack(forest, ext, stack, window, on_last) {
    if (stack.entities.length === 1) {
        forest.stacks.remove(stack.idx)?.destroy();
        on_last();
    } else if (forest.stacks.get(stack.idx)) {
        Node.stack_remove(forest, stack, window);
    }
    const win = ext.windows.get(window);
    if (win) win.stack = null;
}

export function readjust_fork_ratio_by_left(forest, ext, left_length, fork) {
    fork.set_ratio(left_length).measure(forest, ext, fork.area, forest.on_record());
}

export function readjust_fork_ratio_by_right(forest, ext, right_length, fork, fork_length) {
    readjust_fork_ratio_by_left(forest, ext, fork_length - right_length, fork);
}

export function grow_sibling(forest, ext, fork_e, fork_c, is_left, movement, crect) {
    const resize_fork = () => resize_fork_in_forest(forest, ext, fork_e, crect, movement, false);
    if (fork_c.is_horizontal()) {
        if ((movement & (DOWN | UP)) !== 0) resize_fork();
        else if (is_left) {
            if ((movement & RIGHT) !== 0) readjust_fork_ratio_by_left(forest, ext, crect.width, fork_c);
            else resize_fork();
        } else if ((movement & RIGHT) !== 0) resize_fork();
        else readjust_fork_ratio_by_right(forest, ext, crect.width, fork_c, fork_c.area.width);
    } else {
        if ((movement & (LEFT | RIGHT)) !== 0) resize_fork();
        else if (is_left) {
            if ((movement & DOWN) !== 0) readjust_fork_ratio_by_left(forest, ext, crect.height, fork_c);
            else resize_fork();
        } else if ((movement & DOWN) !== 0) resize_fork();
        else readjust_fork_ratio_by_right(forest, ext, crect.height, fork_c, fork_c.area.height);
    }
}

export function shrink_sibling(forest, ext, fork_e, fork_c, is_left, movement, crect) {
    const resize_fork = () => resize_fork_in_forest(forest, ext, fork_e, crect, movement, true);
    if (!fork_c.area) return;
    if (fork_c.is_horizontal()) {
        if ((movement & (DOWN | UP)) !== 0) resize_fork();
        else if (is_left) {
            if ((movement & LEFT) !== 0) readjust_fork_ratio_by_left(forest, ext, crect.width, fork_c);
            else resize_fork();
        } else if ((movement & LEFT) !== 0) resize_fork();
        else readjust_fork_ratio_by_right(forest, ext, crect.width, fork_c, fork_c.area.array[2]);
    } else {
        if ((movement & (LEFT | RIGHT)) !== 0) resize_fork();
        else if (is_left) {
            if ((movement & UP) !== 0) readjust_fork_ratio_by_left(forest, ext, crect.height, fork_c);
            else resize_fork();
        } else if ((movement & UP) !== 0) resize_fork();
        else readjust_fork_ratio_by_right(forest, ext, crect.height, fork_c, fork_c.area.array[3]);
    }
}

export function resize_fork_in_forest(forest, ext, child_e, crect, mov, shrunk) {
    let parent = forest.parents.get(child_e);
    let child = forest.forks.get(child_e);
    if (!parent) {
        child?.measure(forest, ext, child.area, forest.on_record());
        return;
    }
    const src_node = forest.forks.get(child_e);
    if (!src_node) return;
    let is_left = child.left.is_fork(child_e);
    let depth = 0;
    while (parent !== null && depth < MAX_PARENT_DEPTH) {
        depth += 1;
        child = forest.forks.get(parent);
        if (!child) break;
        is_left = child.left.is_fork(child_e);
        if (child.area.contains(crect)) {
            if ((mov & UP) !== 0) {
                if (shrunk ? child.area.y + child.area.height > src_node.area.y + src_node.area.height : !child.is_horizontal() || !is_left)
                    break;
            } else if ((mov & DOWN) !== 0) {
                if (shrunk ? child.area.y < src_node.area.y : child.is_horizontal() || is_left)
                    break;
            } else if ((mov & LEFT) !== 0) {
                if (shrunk ? child.area.x + child.area.width > src_node.area.x + src_node.area.width : !child.is_horizontal() || !is_left)
                    break;
            } else if ((mov & RIGHT) !== 0) {
                if (shrunk ? child.area.x < src_node.area.x : !child.is_horizontal() || is_left)
                    break;
            }
        }
        child_e = parent;
        parent = forest.parents.get(child_e);
    }
    if (!child) return;
    const length = child.is_horizontal()
        ? (is_left ? crect.x + crect.width - child.area.x : crect.x - child.area.x)
        : (is_left ? crect.y + crect.height - child.area.y : Math.max(32, Math.round(crect.y - child.area.y)));
    child.set_ratio(length);
    child.measure(forest, ext, child.area, forest.on_record());
}

export function display_fork(forest, _ext) {
    let fmt = '';
    for (const [entity] of forest.toplevel.values()) {
        const fork = forest.forks.get(entity);
        fmt += fork ? ` ${fork.area ? fork.area.fmt() : 'unknown'}\n` : ` Fork(${entity}) Invalid\n`;
    }
    return fmt;
}
