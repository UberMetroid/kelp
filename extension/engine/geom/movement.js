// SPDX-License-Identifier: GPL-3.0-or-later
// Window grab operation tracking (GrabOp), resize/move bitflags, and Meta.GrabOp classification.

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
            if (from.height === change.height) {
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
    return (op & 0x0100) !== 0;
}

export function is_resize_op(op) {
    return (op & 0xf000) !== 0 || (op & 0x0300) === 0x0300;
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
