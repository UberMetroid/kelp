// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Multi-monitor / multi-workspace BSP forest (`Forest` extending `Ecs.World`) owning
//   fork/parent/stack entity storages, window attachment/detachment, and tree traversal.
// - Zero-Trust Boundary & Invariants:
//   Before moving any window (`move_window`), verifies `window.meta instanceof Meta.Window`
//   and `window.meta.get_compositor_private() !== null`, blocking size signals during the
//   frame move to prevent feedback loops. `iter()` is bounded by `MAX_TREE_NODES` (NASA JPL
//   Power-of-10 bounded loop rule).

import Meta from 'gi://Meta';
import { Arena } from '../ecs/arena.js';
import * as Ecs from '../ecs/world.js';
import * as Rect from '../geom/rectangle.js';
import * as geom from '../geom/rectangle.js';
import { Movement } from '../geom/movement.js';
import * as log from '../../ui/settings/log.js';
import * as Node from './node.js';
import * as Fork from './fork.js';
import {
    detach_from_forest, reassign_to_parent, grow_sibling, shrink_sibling,
    readjust_fork_ratio_by_left, readjust_fork_ratio_by_right,
    resize_fork_in_forest, display_fork,
} from './forest_resize.js';

const MAX_TREE_NODES = 512;

export class Forest extends Ecs.World {
    constructor() {
        super();
        this.toplevel = new Map();
        this.requested = new Map();
        this.stack_updates = [];
        this.forks = this.register_storage();
        this.parents = this.register_storage();
        this.string_reps = this.register_storage();
        this.stacks = new Arena();
        this.on_attach = () => {};
        this.on_detach = () => {};
    }

    measure(ext, fork, area) { fork.measure(this, ext, area, this.on_record()); }
    tile(ext, fork, area, ignore_reset = true) {
        this.measure(ext, fork, area);
        this.arrange(ext, fork.workspace, ignore_reset);
    }

    arrange(ext, _workspace, _ignore_reset = false) {
        for (const [entity, r] of this.requested) {
            const window = ext.windows.get(entity);
            if (!window) continue;
            let on_complete = () => { if (!window.actor_exists()) return; };
            if (ext.tiler.window && Ecs.entity_eq(ext.tiler.window, entity)) {
                on_complete = () => {
                    ext.set_overlay(window.rect());
                    if (!window.actor_exists()) return;
                };
            }
            move_window(ext, window, r.rect, on_complete);
        }
        this.requested.clear();
        for (const [stack] of this.stack_updates.splice(0)) {
            ext.auto_tiler?.update_stack(ext, stack);
        }
    }

    attach_fork(ext, fork, window, is_left) {
        const node = Node.Node.window(window);
        if (is_left) {
            if (fork.right) {
                const new_fork = this.create_fork(fork.left, fork.right, fork.area_of_right(ext), fork.workspace, fork.monitor)[0];
                fork.right = Node.Node.fork(new_fork);
                this.parents.insert(new_fork, fork.entity);
                this.on_attach(new_fork, window);
            } else {
                this.on_attach(fork.entity, window);
                fork.right = fork.left;
            }
            fork.left = node;
        } else {
            if (fork.right) {
                const new_fork = this.create_fork(fork.left, fork.right, fork.area_of_left(ext), fork.workspace, fork.monitor)[0];
                fork.left = Node.Node.fork(new_fork);
                this.parents.insert(new_fork, fork.entity);
                this.on_attach(new_fork, window);
            } else {
                this.on_attach(fork.entity, window);
            }
            fork.right = node;
        }
        this.on_attach(fork.entity, window);
    }

    attach_stack(ext, stack, fork, new_entity, stack_from_left) {
        const container = this.stacks.get(stack.idx), window = ext.windows.get(new_entity);
        if (!container || !window) {
            log.warn('attempted to attach window to stack that does not exist');
            return null;
        }
        window.stack = stack.idx;
        if (stack_from_left) stack.entities.push(new_entity);
        else stack.entities.unshift(new_entity);
        this.on_attach(fork.entity, new_entity);
        ext.auto_tiler?.update_stack(ext, stack);
        if (window.meta.has_focus()) container.activate(new_entity);
        return [fork.entity, fork];
    }

    attach_window(ext, onto_entity, new_entity, place_by, stack_from_left) {
        const right_node = Node.Node.window(new_entity);
        for (const [entity, fork] of this.forks.iter()) {
            if (fork.left.is_window(onto_entity)) {
                if (fork.right) {
                    const [fork_entity, new_fork] = this.create_fork(fork.left, right_node, fork.area_of_left(ext), fork.workspace, fork.monitor);
                    fork.left = Node.Node.fork(fork_entity);
                    this.parents.insert(fork_entity, entity);
                    place_new_fork(place_by, new_fork);
                    return this._attach(onto_entity, new_entity, this.on_attach, entity, fork, [fork_entity, new_fork]);
                }
                fork.right = right_node;
                fork.set_ratio(fork.length() / 2);
                if ('src' in place_by) place_new_fork(place_by, fork);
                return this._attach(onto_entity, new_entity, this.on_attach, entity, fork, null);
            } else if (fork.left.is_in_stack(onto_entity)) {
                return this.attach_stack(ext, fork.left.inner, fork, new_entity, stack_from_left);
            } else if (fork.right) {
                if (fork.right.is_window(onto_entity)) {
                    const [fork_entity, new_fork] = this.create_fork(fork.right, right_node, fork.area_of_right(ext), fork.workspace, fork.monitor);
                    fork.right = Node.Node.fork(fork_entity);
                    this.parents.insert(fork_entity, entity);
                    place_new_fork(place_by, new_fork);
                    return this._attach(onto_entity, new_entity, this.on_attach, entity, fork, [fork_entity, new_fork]);
                } else if (fork.right.is_in_stack(onto_entity)) {
                    return this.attach_stack(ext, fork.right.inner, fork, new_entity, stack_from_left);
                }
            }
        }
        return null;
    }

    connect_on_attach(callback) { this.on_attach = callback; return this; }
    connect_on_detach(callback) { this.on_detach = callback; return this; }

    create_entity() {
        const entity = super.create_entity();
        this.string_reps.insert(entity, `${entity}`);
        return entity;
    }

    create_fork(left, right, area, workspace, monitor) {
        const entity = this.create_entity();
        const orient = area.width > area.height ? Rect.Orientation.HORIZONTAL : Rect.Orientation.VERTICAL;
        const fork = new Fork.Fork(entity, left, right, area, workspace, monitor, orient);
        this.forks.insert(entity, fork);
        return [entity, fork];
    }

    create_toplevel(window, area, id) {
        const [entity, fork] = this.create_fork(Node.Node.window(window), null, area, id[1], id[0]);
        this.string_reps.with(entity, (sid) => fork.set_toplevel(this, entity, sid, id));
        return [entity, fork];
    }

    delete_entity(entity) {
        const fork = this.forks.remove(entity);
        if (fork && fork.is_toplevel) {
            const id = this.string_reps.get(entity);
            if (id) this.toplevel.delete(id);
        }
        super.delete_entity(entity);
    }

    find_toplevel([src_mon, src_work]) {
        for (const [entity, fork] of this.forks.iter()) {
            if (fork.is_toplevel && fork.monitor === src_mon && fork.workspace === src_work)
                return entity;
        }
        return null;
    }

    *iter(entity, kind = null) {
        let fork = this.forks.get(entity), visited = 0;
        const forks = [];
        while (fork && visited < MAX_TREE_NODES) {
            visited += 1;
            const lf = fork.left.inner.kind === Node.NodeKind.FORK ? this.forks.get(fork.left.inner.entity) : null;
            if (lf) forks.push(lf);
            if (kind === null || fork.left.inner.kind === kind) yield fork.left;
            if (fork.right) {
                const rf = fork.right.inner.kind === Node.NodeKind.FORK ? this.forks.get(fork.right.inner.entity) : null;
                if (rf) forks.push(rf);
                if (kind === null || fork.right.inner.kind === kind) yield fork.right;
            }
            fork = forks.pop();
        }
    }

    largest_window_on(ext, entity) {
        let largest_window = null, largest_size = 0;
        const compare = (e) => {
            const win = ext.windows.get(e);
            if (win && win.is_tilable(ext)) {
                const r = win.rect(), size = r.width * r.height;
                if (size > largest_size) { largest_size = size; largest_window = win; }
            }
        };
        for (const node of this.iter(entity)) {
            if (node.inner.kind === Node.NodeKind.WINDOW) compare(node.inner.entity);
            else if (node.inner.kind === Node.NodeKind.STACK) compare(node.inner.entities[0]);
        }
        return largest_window;
    }

    on_record() { return (e, p, a) => this.record(e, p, a); }
    record(entity, parent, rect) { this.requested.set(entity, { parent, rect }); }

    resize(ext, fork_e, fork_c, win_e, movement, crect) {
        const is_left = fork_c.left.is_window(win_e) || fork_c.left.is_in_stack(win_e);
        if ((movement & Movement.SHRINK) !== 0) shrink_sibling(this, ext, fork_e, fork_c, is_left, movement, crect);
        else grow_sibling(this, ext, fork_e, fork_c, is_left, movement, crect);
    }

    detach(ext, fork_entity, window) { return detach_from_forest(this, ext, fork_entity, window); }
    reassign_to_parent(child, reassign) { reassign_to_parent(this, child, reassign); }
    readjust_fork_ratio_by_left(ext, left_length, fork) { readjust_fork_ratio_by_left(this, ext, left_length, fork); }
    readjust_fork_ratio_by_right(ext, right_length, fork, fork_length) { readjust_fork_ratio_by_right(this, ext, right_length, fork, fork_length); }
    resize_fork_(ext, child_e, crect, mov, shrunk) { resize_fork_in_forest(this, ext, child_e, crect, mov, shrunk); }
    fmt(ext) { return display_fork(this, ext); }

    _attach(onto_entity, new_entity, assoc, entity, fork, result) {
        if (result) { assoc(result[0], onto_entity); assoc(result[0], new_entity); }
        else assoc(entity, new_entity);
        return [entity, fork];
    }
}

function place_new_fork(place_by, fork) {
    const { x, y, width, height } = fork.area;
    const [l, r] = fork.is_horizontal()
        ? [new Rect.Rectangle([x, y, width / 2, height]), new Rect.Rectangle([x + width / 2, y, width / 2, height])]
        : [new Rect.Rectangle([x, y, width, height / 2]), new Rect.Rectangle([x, y + height / 2, width, height / 2])];
    if ('swap' in place_by) {
        fork.set_orientation(place_by.orientation);
        if (place_by.swap) fork.swap_branches();
    } else if ('src' in place_by) {
        const from = [place_by.src.x + place_by.src.width / 2, place_by.src.y + place_by.src.height / 2];
        if (geom.shortest_side(from, l) < geom.shortest_side(from, r)) fork.swap_branches();
    }
}

function move_window(ext, window, rect, on_complete) {
    if (!(window.meta instanceof Meta.Window) || !window.meta.get_compositor_private()) return;
    ext.size_signals_block(window);
    window.move(ext, rect, () => { on_complete(); ext.size_signals_unblock(window); });
}
