// SPDX-License-Identifier: GPL-3.0-or-later
// Binary Space Partitioning (BSP) internal split node (Fork) managing branch geometry and ratios.

import * as Ecs from '../ecs/world.js';
import * as Rect from '../geom/rectangle.js';
import * as node from './node.js';

const XPOS = 0, YPOS = 1, WIDTH = 2, HEIGHT = 3;
const MAX_PARENT_DEPTH = 64;

export class Fork {
    constructor(entity, left, right, area, workspace, monitor, orient) {
        this.prev_ratio = 0.5;
        this.minimum_ratio = 0.1;
        this.orientation_changed = false;
        this.is_toplevel = false;
        this.toplevel_key = null;
        this.smart_gapped = false;
        this.n_toggled = 0;
        this.on_primary_display = globalThis.global?.display?.get_primary_monitor?.() === monitor;
        this.area = area;
        this.left = left;
        this.right = right;
        this.workspace = workspace;
        this.length_left = Math.round((orient === Rect.Orientation.HORIZONTAL ? this.area.width : this.area.height) / 2);
        this.prev_length_left = this.length_left;
        this.entity = entity;
        this.orientation = orient;
        this.monitor = monitor;
    }

    area_of_left(ext) {
        const len = Math.max(1, this.length_left - ext.gap_inner_half);
        return new Rect.Rectangle(this.is_horizontal() ? [this.area.x, this.area.y, len, this.area.height] : [this.area.x, this.area.y, this.area.width, len]);
    }

    area_of_right(ext) {
        const offset = this.length_left + ext.gap_inner_half;
        return new Rect.Rectangle(this.is_horizontal()
            ? [this.area.x + offset, this.area.y, Math.max(1, this.area.width - offset), this.area.height]
            : [this.area.x, this.area.y + offset, this.area.width, Math.max(1, this.area.height - offset)]);
    }

    depth() { return this.is_horizontal() ? this.area.height : this.area.width; }
    is_horizontal() { return Rect.Orientation.HORIZONTAL === this.orientation; }
    length() { return this.is_horizontal() ? this.area.width : this.area.height; }

    find_branch(entity) {
        const locate = (branch) => {
            if (branch.inner.kind === node.NodeKind.WINDOW && Ecs.entity_eq(branch.inner.entity, entity))
                return branch;
            if (branch.inner.kind === node.NodeKind.STACK) {
                for (const e of branch.inner.entities)
                    if (Ecs.entity_eq(e, entity)) return branch;
            }
            return null;
        };
        return locate(this.left) ?? (this.right ? locate(this.right) : null);
    }

    replace_window(ext, a, b) {
        let closure = null;
        const check_right = () => {
            if (!this.right) return;
            const inner = this.right.inner;
            if (inner.kind === node.NodeKind.WINDOW) {
                closure = () => { inner.entity = b.entity; };
            } else if (inner.kind === node.NodeKind.STACK) {
                const idx = node.stack_find(inner, a.entity);
                if (idx === null) return;
                closure = () => {
                    node.stack_replace(ext, inner, b, idx);
                    inner.entities[idx] = b.entity;
                };
            }
        };
        if (this.left.inner.kind === node.NodeKind.FORK) {
            check_right();
        } else if (this.left.inner.kind === node.NodeKind.WINDOW) {
            const inner = this.left.inner;
            if (Ecs.entity_eq(inner.entity, a.entity)) closure = () => { inner.entity = b.entity; };
            else check_right();
        } else if (this.left.inner.kind === node.NodeKind.STACK) {
            const inner_s = this.left.inner;
            const idx = node.stack_find(inner_s, a.entity);
            if (idx !== null) {
                closure = () => {
                    node.stack_replace(ext, inner_s, b, idx);
                    inner_s.entities[idx] = b.entity;
                };
            } else check_right();
        }
        return closure;
    }

    set_area(area) {
        this.area = area;
        return this.area;
    }

    set_ratio(left_length) {
        const fork_len = this.is_horizontal() ? this.area.width : this.area.height;
        const min_b = Math.min(256, Math.max(32, Math.floor(fork_len / 4)));
        const max_b = Math.max(min_b, fork_len - min_b);
        const clamped = Math.round(Math.max(min_b, Math.min(max_b, left_length)));
        this.prev_length_left = clamped;
        this.length_left = clamped;
        return this;
    }

    set_toplevel(tiler, entity, string, id) {
        this.is_toplevel = true;
        this.toplevel_key = string;
        tiler.toplevel.set(string, [entity, id]);
        return this;
    }

    // Recursively partitions `area` across `left` and `right` children, snapping the split
    // point to the midpoint (within ±32px) or a 32px grid boundary and deducting inner gaps.
    measure(tiler, ext, area, record, depth = 0) {
        if (depth >= MAX_PARENT_DEPTH) return;
        let ratio = null;
        const manually_moved = ext.grab_op !== null || ext.tiler.resizing_window;
        if (!this.is_toplevel) {
            ratio = this.orientation_changed ? this.length_left / this.depth() : this.length_left / this.length();
            this.orientation_changed = false;
            this.area = this.set_area(area.clone());
        } else if (this.orientation_changed) {
            this.orientation_changed = false;
            ratio = this.length_left / this.depth();
        }
        if (area && this.is_toplevel) this.area = this.set_area(area.clone());
        if (ratio) {
            this.length_left = Math.round(ratio * this.length());
            if (manually_moved) this.prev_ratio = ratio;
        } else if (manually_moved) {
            this.prev_ratio = this.length_left / this.length();
        }
        if (this.right) {
            const [l, p, startpos] = this.is_horizontal() ? [WIDTH, XPOS, this.area.x] : [HEIGHT, YPOS, this.area.y];
            const region = this.area.clone();
            const total = this.area.array[l];
            const half = total / 2;
            const min_b = Math.min(256, Math.max(32, Math.floor(total / 4)));
            let length;
            if (this.length_left > half - 32 && this.length_left < half + 32) {
                length = Math.round(half);
            } else {
                const diff = (startpos + this.length_left) % 32;
                length = this.length_left - diff + (diff > 16 ? 32 : 0);
                length = Math.round(Math.max(min_b, Math.min(Math.max(min_b, total - min_b), length)));
            }
            this.length_left = length;
            region.array[l] = Math.max(1, length - ext.gap_inner_half);
            this.left.measure(tiler, ext, this.entity, region, record, depth + 1);
            region.array[p] = region.array[p] + length + ext.gap_inner_half;
            region.array[l] = Math.max(1, total - length - ext.gap_inner_half);
            this.right.measure(tiler, ext, this.entity, region, record, depth + 1);
        } else {
            this.left.measure(tiler, ext, this.entity, this.area, record, depth + 1);
        }
    }

    rebalance_orientation() {
        this.set_orientation(this.area.height > this.area.width ? Rect.Orientation.VERTICAL : Rect.Orientation.HORIZONTAL);
    }

    set_orientation(o) {
        if (o !== this.orientation) {
            this.orientation = o;
            this.orientation_changed = true;
        }
    }

    swap_branches() {
        if (this.right) {
            const temp = this.left;
            this.left = this.right;
            this.right = temp;
        }
    }

    toggle_orientation() {
        this.orientation = Rect.Orientation.HORIZONTAL === this.orientation ? Rect.Orientation.VERTICAL : Rect.Orientation.HORIZONTAL;
        this.orientation_changed = true;
        if (this.n_toggled === 1) {
            if (this.right) {
                const tmp = this.right;
                this.right = this.left;
                this.left = tmp;
            }
            this.n_toggled = 0;
        } else {
            this.n_toggled += 1;
        }
    }
}
