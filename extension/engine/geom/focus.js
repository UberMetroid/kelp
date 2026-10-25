// SPDX-License-Identifier: GPL-3.0-or-later
// Directional window focus selector (`FocusSelector`) and pointer warp target (`FocusPosition`).

import * as Geom from './rectangle.js';

export const FocusPosition = Object.freeze({
    TopLeft: 'Top Left',
    TopRight: 'Top Right',
    BottomLeft: 'Bottom Left',
    BottomRight: 'Bottom Right',
    Center: 'Center',
});

export class FocusSelector {
    select(ext, direction, window) {
        window = window ?? ext.focus_window();
        if (window) {
            const window_list = ext.active_window_list();
            return select_nearest(direction, window, window_list);
        }
        return null;
    }

    down(ext, window) {
        return this.select(ext, window_down, window);
    }

    left(ext, window) {
        return this.select(ext, window_left, window);
    }

    right(ext, window) {
        return this.select(ext, window_right, window);
    }

    up(ext, window) {
        return this.select(ext, window_up, window);
    }
}

function is_visible_candidate(win) {
    return (
        !win.meta.minimized &&
        !win.stack_Previously_hidden &&
        win.meta.get_compositor_private?.()?.visible !== false
    );
}

function select_nearest(windows_fn, focused, window_list) {
    const array = windows_fn(focused, window_list);
    return array.length > 0 ? array[0] : null;
}

function window_down(focused, windows) {
    return windows
        .filter(
            (win) =>
                is_visible_candidate(win) &&
                win.meta.get_frame_rect().y > focused.meta.get_frame_rect().y
        )
        .sort(
            (a, b) =>
                Geom.downward_distance(a.meta, focused.meta) -
                Geom.downward_distance(b.meta, focused.meta)
        );
}

function window_left(focused, windows) {
    return windows
        .filter(
            (win) =>
                is_visible_candidate(win) &&
                win.meta.get_frame_rect().x < focused.meta.get_frame_rect().x
        )
        .sort(
            (a, b) =>
                Geom.leftward_distance(a.meta, focused.meta) -
                Geom.leftward_distance(b.meta, focused.meta)
        );
}

function window_right(focused, windows) {
    return windows
        .filter(
            (win) =>
                is_visible_candidate(win) &&
                win.meta.get_frame_rect().x > focused.meta.get_frame_rect().x
        )
        .sort(
            (a, b) =>
                Geom.rightward_distance(a.meta, focused.meta) -
                Geom.rightward_distance(b.meta, focused.meta)
        );
}

function window_up(focused, windows) {
    return windows
        .filter(
            (win) =>
                is_visible_candidate(win) &&
                win.meta.get_frame_rect().y < focused.meta.get_frame_rect().y
        )
        .sort(
            (a, b) =>
                Geom.upward_distance(a.meta, focused.meta) -
                Geom.upward_distance(b.meta, focused.meta)
        );
}
