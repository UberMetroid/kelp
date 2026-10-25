// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Binary Space Partitioning (BSP) tree leaf & branch node (`Node`, `NodeKind`) and
//   in-place stack array mutations (`stack_find`, `stack_move_left`, `stack_move_right`,
//   `stack_replace`, `stack_remove`).
// - Zero-Trust Boundary & Invariants:
//   Every node is tagged (`FORK = 1`, `WINDOW = 2`, `STACK = 3`). `measure()` clones
//   the parent rectangle before offsetting stack tab-bar height (`size * 6`) so sibling
//   forks never share aliased mutable geometry. `stack_find` bounds iteration by
//   `MAX_STACK_ENTITIES` (NASA JPL Power-of-10 bounded loop rule).

import * as Ecs from '../ecs/world.js';

export const NodeKind = Object.freeze({
    FORK: 1,
    WINDOW: 2,
    STACK: 3,
});

const MAX_STACK_ENTITIES = 256;

function node_variant_as_string(value) {
    return value === NodeKind.FORK ? 'NodeVariant::Fork' : 'NodeVariant::Window';
}

function stack_detach(node, stack, idx) {
    node.entities.splice(idx, 1);
    stack.remove_by_pos(idx);
}

function stack_swap(node, from, to) {
    const tmp = node.entities[from];
    node.entities[from] = node.entities[to];
    node.entities[to] = tmp;
}

export function stack_find(node, entity) {
    let idx = 0;
    const limit = Math.min(node.entities.length, MAX_STACK_ENTITIES);
    while (idx < limit) {
        if (Ecs.entity_eq(entity, node.entities[idx])) {
            return idx;
        }
        idx += 1;
    }
    return null;
}

export function stack_move_left(ext, forest, node, entity) {
    const stack = forest.stacks.get(node.idx);
    if (!stack)
        return false;
    let idx = 0;
    for (const cmp of node.entities) {
        if (Ecs.entity_eq(cmp, entity)) {
            if (idx === 0) {
                stack_detach(node, stack, 0);
                return false;
            }
            stack_swap(node, idx - 1, idx);
            stack.active_id -= 1;
            ext.auto_tiler?.update_stack(ext, node);
            return true;
        }
        idx += 1;
    }
    return false;
}

export function stack_move_right(ext, forest, node, entity) {
    const stack = forest.stacks.get(node.idx);
    if (!stack)
        return false;
    let moved = false;
    let idx = 0;
    const max = node.entities.length - 1;
    for (const cmp of node.entities) {
        if (Ecs.entity_eq(cmp, entity)) {
            if (idx === max) {
                stack_detach(node, stack, idx);
                moved = false;
            } else {
                stack_swap(node, idx + 1, idx);
                stack.active_id += 1;
                ext.auto_tiler?.update_stack(ext, node);
                moved = true;
            }
            break;
        }
        idx += 1;
    }
    return moved;
}

export function stack_replace(ext, node, window) {
    if (!ext.auto_tiler)
        return;
    const stack = ext.auto_tiler.forest.stacks.get(node.idx);
    if (!stack)
        return;
    stack.replace(window);
}

export function stack_remove(forest, node, entity) {
    const stack = forest.stacks.get(node.idx);
    if (!stack)
        return null;
    const idx = stack.remove_tab(entity);
    if (idx !== null)
        node.entities.splice(idx, 1);
    return idx;
}

export class Node {
    constructor(inner) {
        this.inner = inner;
    }

    static fork(entity) {
        return new Node({ kind: NodeKind.FORK, entity });
    }

    static window(entity) {
        return new Node({ kind: NodeKind.WINDOW, entity });
    }

    static stacked(window, idx) {
        return new Node({
            kind: NodeKind.STACK,
            entities: [window],
            idx,
            rect: null,
        });
    }

    display(fmt) {
        fmt += `{\n    kind: ${node_variant_as_string(this.inner.kind)},\n    `;
        switch (this.inner.kind) {
            case NodeKind.FORK:
            case NodeKind.WINDOW:
                fmt += `entity: (${this.inner.entity})\n  }`;
                return fmt;
            case NodeKind.STACK:
                fmt += `entities: ${this.inner.entities}\n  }`;
                return fmt;
            default:
                return fmt;
        }
    }

    is_in_stack(entity) {
        if (this.inner.kind === NodeKind.STACK) {
            for (const compare of this.inner.entities) {
                if (Ecs.entity_eq(entity, compare))
                    return true;
            }
        }
        return false;
    }

    is_fork(entity) {
        return this.inner.kind === NodeKind.FORK && Ecs.entity_eq(this.inner.entity, entity);
    }

    is_window(entity) {
        return this.inner.kind === NodeKind.WINDOW && Ecs.entity_eq(this.inner.entity, entity);
    }

    measure(tiler, ext, parent, area, record) {
        switch (this.inner.kind) {
            case NodeKind.FORK: {
                const fork = tiler.forks.get(this.inner.entity);
                if (fork) {
                    fork.measure(tiler, ext, area, record);
                }
                break;
            }
            case NodeKind.WINDOW:
                record(this.inner.entity, parent, area.clone());
                break;
            case NodeKind.STACK: {
                const size = ext.dpi * 4;
                this.inner.rect = area.clone();
                this.inner.rect.y += size * 6;
                this.inner.rect.height -= size * 6;
                for (const entity of this.inner.entities) {
                    record(entity, parent, this.inner.rect);
                }
                if (ext.auto_tiler) {
                    ext.auto_tiler.forest.stack_updates.push([this.inner, parent]);
                }
                break;
            }
        }
    }
}
