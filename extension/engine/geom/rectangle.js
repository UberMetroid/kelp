// SPDX-License-Identifier: GPL-3.0-or-later
// 2D axis-aligned bounding box (Rectangle), distance math, and BSP drop-zone classification.

export const Orientation = Object.freeze({
    HORIZONTAL: 0,
    VERTICAL: 1,
});

export const Side = Object.freeze({
    LEFT: 0,
    TOP: 1,
    RIGHT: 2,
    BOTTOM: 3,
    CENTER: 4,
});

export function orientation_as_str(value) {
    return value === Orientation.HORIZONTAL ? 'Orientation::Horizontal' : 'Orientation::Vertical';
}

export function round_increment(value, increment) {
    return Math.round(value / increment) * increment;
}

export class Rectangle {
    constructor(array) {
        this.array = array;
    }

    static from_meta(meta) {
        return new Rectangle([meta.x, meta.y, meta.width, meta.height]);
    }

    get x() {
        return this.array[0];
    }

    set x(x) {
        this.array[0] = x;
    }

    get y() {
        return this.array[1];
    }

    set y(y) {
        this.array[1] = y;
    }

    get width() {
        return this.array[2];
    }

    set width(width) {
        this.array[2] = width;
    }

    get height() {
        return this.array[3];
    }

    set height(height) {
        this.array[3] = height;
    }

    apply(other) {
        this.x += other.x;
        this.y += other.y;
        this.width += other.width;
        this.height += other.height;
        return this;
    }

    clamp(other) {
        this.width = Math.max(Math.min(1, other.width), Math.min(this.width, other.width));
        this.height = Math.max(Math.min(1, other.height), Math.min(this.height, other.height));
        this.x = Math.max(other.x, Math.min(this.x, other.x + other.width - this.width));
        this.y = Math.max(other.y, Math.min(this.y, other.y + other.height - this.height));
    }

    clone() {
        return new Rectangle([this.array[0], this.array[1], this.array[2], this.array[3]]);
    }

    contains(other) {
        return (
            this.x <= other.x &&
            this.y <= other.y &&
            this.x + this.width >= other.x + other.width &&
            this.y + this.height >= other.y + other.height
        );
    }

    diff(other) {
        return new Rectangle([
            other.x - this.x,
            other.y - this.y,
            other.width - this.width,
            other.height - this.height,
        ]);
    }

    eq(other) {
        return (
            this.x === other.x &&
            this.y === other.y &&
            this.width === other.width &&
            this.height === other.height
        );
    }

    fmt() {
        return `Rect(${[this.x, this.y, this.width, this.height]})`;
    }

    intersects(other) {
        return (
            this.x < other.x + other.width &&
            this.x + this.width > other.x &&
            this.y < other.y + other.height &&
            this.y + this.height > other.y
        );
    }
}

export function xend(rect) {
    return rect.x + rect.width;
}

export function xcenter(rect) {
    return rect.x + rect.width / 2;
}

export function yend(rect) {
    return rect.y + rect.height;
}

export function ycenter(rect) {
    return rect.y + rect.height / 2;
}

export function center(rect) {
    return [xcenter(rect), ycenter(rect)];
}

export function north(rect) {
    return [xcenter(rect), rect.y];
}

export function east(rect) {
    return [xend(rect), ycenter(rect)];
}

export function south(rect) {
    return [xcenter(rect), yend(rect)];
}

export function west(rect) {
    return [rect.x, ycenter(rect)];
}

export function distance([ax, ay], [bx, by]) {
    return Math.hypot(bx - ax, by - ay);
}

export function directional_distance(a, b, fn_a, fn_b) {
    return distance(fn_a(a), fn_b(b));
}

export function window_distance(win_a, win_b) {
    return directional_distance(win_a.get_frame_rect(), win_b.get_frame_rect(), center, center);
}

export function upward_distance(win_a, win_b) {
    return directional_distance(win_a.get_frame_rect(), win_b.get_frame_rect(), south, north);
}

export function rightward_distance(win_a, win_b) {
    return directional_distance(win_a.get_frame_rect(), win_b.get_frame_rect(), west, east);
}

export function downward_distance(win_a, win_b) {
    return directional_distance(win_a.get_frame_rect(), win_b.get_frame_rect(), north, south);
}

export function leftward_distance(win_a, win_b) {
    return directional_distance(win_a.get_frame_rect(), win_b.get_frame_rect(), east, west);
}

export function nearest_side(ext, origin, rect) {
    const left_d = distance(origin, west(rect));
    const top_d = distance(origin, north(rect));
    const right_d = distance(origin, east(rect));
    const bottom_d = distance(origin, south(rect));
    const center_d = distance(origin, center(rect));

    let nearest = left_d < right_d ? [left_d, Side.LEFT] : [right_d, Side.RIGHT];
    if (top_d < nearest[0])
        nearest = [top_d, Side.TOP];
    if (bottom_d < nearest[0])
        nearest = [bottom_d, Side.BOTTOM];
    if (ext.settings.stacking_with_mouse() && center_d < nearest[0])
        nearest = [center_d, Side.CENTER];
    return nearest;
}

export function shortest_side(origin, rect) {
    return Math.min(
        distance(origin, west(rect)),
        distance(origin, north(rect)),
        distance(origin, east(rect)),
        distance(origin, south(rect))
    );
}
