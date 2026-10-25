// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Window grab operation tracking (`GrabOp`), resize/move bitflags (`Movement`), and
//   Mutter `Meta.GrabOp` bitmask classification (`is_keyboard_op`, `is_resize_op`, `is_move_op`).
// - Zero-Trust Boundary & Invariants:
//   Pure geometric diffing (`calculate`) and bitmask checks over `Meta.GrabOp` constants.
//   Does not retain GObject references or allocate actors; `cursor_rect` and `current_monitor`
//   query `global` only when invoked at runtime inside an active session.

import Meta from 'gi://Meta';
import { Rectangle } from './rectangle.js';

export const Movement = Object.freeze({
    NONE: 0,
    MOVED: 1,
    GROW: 2,
    SHRINK: 4,
    LEFT: 8,
    UP: 16,
    RIGHT: 32,
    DOWN: 64,
});

// Classifies a rectangle delta (`from` -> `change`) into directional grow/shrink bitflags
// so the BSP tree knows which fork boundary was dragged by the user.
export function calculate(from, change) {
    const xpos = from.x === change.x;
    const ypos = from.y === change.y;
    if (xpos && ypos) {
        if (from.width === change.width) {
            if (from.height === change.width) {
                return Movement.NONE;
            }
            if (from.height < change.height) {
                return Movement.GROW | Movement.DOWN;
            }
            return Movement.SHRINK | Movement.UP;
        }
        if (from.width < change.width) {
            return Movement.GROW | Movement.RIGHT;
        }
        return Movement.SHRINK | Movement.LEFT;
    }
    if (xpos) {
        if (from.height < change.height) {
            return Movement.GROW | Movement.UP;
        }
        return Movement.SHRINK | Movement.DOWN;
    }
    if (ypos) {
        if (from.width < change.width) {
            return Movement.GROW | Movement.LEFT;
        }
        return Movement.SHRINK | Movement.RIGHT;
    }
    return Movement.MOVED;
}

export class GrabOp {
    constructor(entity, rect) {
        this.entity = entity;
        this.rect = rect;
    }

    operation(change) {
        return calculate(this.rect, change);
    }
}

export function is_keyboard_op(op) {
    const window_flag_keyboard = Meta.GrabOp.KEYBOARD_MOVING & ~Meta.GrabOp.WINDOW_BASE;
    return (op & window_flag_keyboard) !== 0;
}

export function is_resize_op(op) {
    const window_dir_mask =
        (Meta.GrabOp.RESIZING_N |
            Meta.GrabOp.RESIZING_E |
            Meta.GrabOp.RESIZING_S |
            Meta.GrabOp.RESIZING_W) &
        ~Meta.GrabOp.WINDOW_BASE;
    return (
        (op & window_dir_mask) !== 0 ||
        (op & Meta.GrabOp.KEYBOARD_RESIZING_UNKNOWN) === Meta.GrabOp.KEYBOARD_RESIZING_UNKNOWN
    );
}

export function is_move_op(op) {
    return !is_resize_op(op);
}

export function current_monitor() {
    return Rectangle.from_meta(
        global.display.get_monitor_geometry(global.display.get_current_monitor())
    );
}

export function cursor_rect() {
    const [x, y] = global.get_pointer();
    return new Rectangle([x, y, 1, 1]);
}
