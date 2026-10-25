// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Interactive keyboard & grid tiling controller (`Tiler`, `Direction`) handling modal
//   adjustment mode (`enter`, `accept`, `exit`), directional window moves, and grid snapping.
// - Zero-Trust Boundary & Invariants:
//   Queues directional movements via `ChannelExecutor` (max queue depth 2) to prevent
//   key-repeat floods from starving the compositor. Always restores normal keybindings and
//   hides `ext.overlay` on `exit()`, and stops `this.queue` on `disable()`.

import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Ecs from '../ecs/world.js';
import { ChannelExecutor } from '../ecs/executor.js';
import * as Rect from '../geom/rectangle.js';
import {
    move_alongside_stack, move_from_stack, move_auto,
    resize_auto, locate_monitor, accept_tile,
} from './tiler_actions.js';

export { locate_monitor };

export const Direction = Object.freeze({ Left: 0, Up: 1, Right: 2, Down: 3 });

export class Tiler {
    constructor(ext) {
        this.window = null;
        this.moving = false;
        this.resizing_window = false;
        this.swap_window = null;
        this.queue = new ChannelExecutor();
        this.keybindings = {
            'management-orientation': () => this.toggle_orientation(ext),
            'tile-move-left': () => this.move_left(ext),
            'tile-move-down': () => this.move_down(ext),
            'tile-move-up': () => this.move_up(ext),
            'tile-move-right': () => this.move_right(ext),
            'tile-resize-left': () => this.resize(ext, Direction.Left),
            'tile-resize-down': () => this.resize(ext, Direction.Down),
            'tile-resize-up': () => this.resize(ext, Direction.Up),
            'tile-resize-right': () => this.resize(ext, Direction.Right),
            'tile-swap-left': () => this.swap_left(ext),
            'tile-swap-down': () => this.swap_down(ext),
            'tile-swap-up': () => this.swap_up(ext),
            'tile-swap-right': () => this.swap_right(ext),
            'tile-accept': () => this.accept(ext),
            'tile-reject': () => this.exit(ext),
            'toggle-stacking': () => this.toggle_stacking(ext),
        };
    }

    toggle_orientation(ext) {
        const window = ext.focus_window();
        if (window && ext.auto_tiler) {
            ext.auto_tiler.toggle_orientation(ext, window);
            ext.register_fn(() => window.activate(true));
        }
    }

    toggle_stacking(ext) {
        ext.auto_tiler?.toggle_stacking(ext);
        const win = ext.focus_window();
        if (win) this.overlay_watch(ext, win);
    }

    rect(ext, monitor) {
        if (!ext.overlay.visible) return null;
        const columns = Math.floor(monitor.width / ext.column_size);
        const rows = Math.floor(monitor.height / ext.row_size);
        return monitor_rect(monitor, columns, rows);
    }

    change(overlay, rect, dx, dy, dw, dh) {
        const changed = new Rect.Rectangle([
            overlay.x + dx * rect.width, overlay.y + dy * rect.height,
            overlay.width + dw * rect.width, overlay.height + dh * rect.height,
        ]);
        changed.x = Rect.round_increment(changed.x - rect.x, rect.width) + rect.x;
        changed.y = Rect.round_increment(changed.y - rect.y, rect.height) + rect.y;
        changed.width = Math.max(rect.width, Rect.round_increment(changed.width, rect.width));
        changed.height = Math.max(rect.height, Rect.round_increment(changed.height, rect.height));
        const monitors = tile_monitors(changed);
        if (monitors.length === 0) return this;
        let min_x = null, min_y = null, max_x = null, max_y = null;
        for (const monitor of monitors) {
            if (min_x === null || monitor.x < min_x) min_x = monitor.x;
            if (min_y === null || monitor.y < min_y) min_y = monitor.y;
            if (max_x === null || monitor.x + monitor.width > max_x) max_x = monitor.x + monitor.width;
            if (max_y === null || monitor.y + monitor.height < max_y) max_y = monitor.y + monitor.height;
        }
        if (
            min_x === null || min_y === null || max_x === null || max_y === null ||
            changed.x < min_x || changed.x + changed.width > max_x ||
            changed.y < min_y || changed.y + changed.height > max_y
        ) return this;
        overlay.x = changed.x;
        overlay.y = changed.y;
        overlay.width = changed.width;
        overlay.height = changed.height;
        return this;
    }

    move(ext, window, x, y, w, h, direction, focus) {
        const win = window ? ext.windows.get(window) : null;
        if (!win) return;
        const place_pointer = () => ext.register_fn(() => win.activate(true));
        if (ext.auto_tiler && win.is_tilable(ext)) {
            if (this.queue.length === 2) return;
            this.queue.send(() => {
                const focused = ext.focus_window();
                if (!focused) return;
                const move_to = focus();
                this.moving = true;
                if (ext.auto_tiler) {
                    const s = ext.auto_tiler.find_stack(focused.entity);
                    if (s) {
                        this.move_from_stack(ext, s, focused, direction);
                        this.moving = false;
                        place_pointer();
                        return;
                    }
                }
                if (move_to !== null) move_auto(this, ext, focused, move_to, direction === Direction.Left);
                this.moving = false;
                place_pointer();
            });
        } else {
            this.swap_window = null;
            this.rect_by_active_area(ext, (_monitor, rect) => {
                this.change(ext.overlay, rect, x, y, w, h).change(ext.overlay, rect, 0, 0, 0, 0);
            });
        }
    }

    move_alongside_stack(ext, stack_ctx, focused, direction) { move_alongside_stack(this, ext, stack_ctx, focused, direction); }
    move_from_stack(ext, stack_ctx, focused, direction, force_detach = false) { move_from_stack(this, ext, stack_ctx, focused, direction, force_detach); }

    overlay_watch(ext, window) {
        ext.register_fn(() => {
            if (window) { ext.set_overlay(window.rect()); window.activate(false); }
        });
    }

    rect_by_active_area(ext, callback) {
        const monitor_id = this.window ? ext.monitors.get(this.window) : null;
        if (!monitor_id) return;
        const monitor = ext.monitor_work_area(monitor_id[0]);
        const rect = this.rect(ext, monitor);
        if (rect) callback(monitor, rect);
    }

    move_left(ext, window) { this.move(ext, window ?? this.window, -1, 0, 0, 0, Direction.Left, move_window_or_monitor(ext, ext.focus_selector.left, Meta.DisplayDirection.LEFT)); }
    move_down(ext, window) { this.move(ext, window ?? this.window, 0, 1, 0, 0, Direction.Down, move_window_or_monitor(ext, ext.focus_selector.down, Meta.DisplayDirection.DOWN)); }
    move_up(ext, window) { this.move(ext, window ?? this.window, 0, -1, 0, 0, Direction.Up, move_window_or_monitor(ext, ext.focus_selector.up, Meta.DisplayDirection.UP)); }
    move_right(ext, window) { this.move(ext, window ?? this.window, 1, 0, 0, 0, Direction.Right, move_window_or_monitor(ext, ext.focus_selector.right, Meta.DisplayDirection.RIGHT)); }

    resize(ext, direction) {
        if (!this.window) return;
        this.resizing_window = true;
        if (ext.auto_tiler && !ext.contains_tag(this.window, Ecs.Floating)) {
            resize_auto(this, ext, direction);
        } else {
            const [x, y, w, h] =
                direction === Direction.Down ? [0, 0, 0, 1]
                : direction === Direction.Left ? [0, 0, -1, 0]
                : direction === Direction.Up ? [0, 0, 0, -1]
                : [0, 0, 1, 0];
            this.swap_window = null;
            this.rect_by_active_area(ext, (_monitor, rect) => {
                this.change(ext.overlay, rect, x, y, w, h).change(ext.overlay, rect, 0, 0, 0, 0);
            });
        }
        this.resizing_window = false;
    }

    swap(ext, selector) {
        if (selector) { ext.set_overlay(selector.rect()); this.swap_window = selector.entity; }
    }

    swap_left(ext) { this._swap_dir(ext, (w) => ext.focus_selector.left(ext, w)); }
    swap_down(ext) { this._swap_dir(ext, (w) => ext.focus_selector.down(ext, w)); }
    swap_up(ext) { this._swap_dir(ext, (w) => ext.focus_selector.up(ext, w)); }
    swap_right(ext) { this._swap_dir(ext, (w) => ext.focus_selector.right(ext, w)); }

    _swap_dir(ext, select_fn) {
        if (this.swap_window) ext.windows.with(this.swap_window, (w) => this.swap(ext, select_fn(w)));
        else this.swap(ext, select_fn(null));
    }

    enter(ext) {
        if (this.window) return;
        const win = ext.focus_window();
        if (!win) return;
        this.window = win.entity;
        if (win.is_maximized()) win.unmaximize();
        ext.set_overlay(win.rect());
        ext.overlay.visible = true;
        if (!ext.auto_tiler || ext.contains_tag(win.entity, Ecs.Floating)) {
            this.rect_by_active_area(ext, (_monitor, rect) => this.change(ext.overlay, rect, 0, 0, 0, 0));
        }
        ext.keybindings.disable(ext.keybindings.window_focus).enable(this.keybindings);
    }

    accept(ext) { accept_tile(this, ext); }

    exit(ext) {
        this.queue.clear();
        if (this.window) {
            this.window = null;
            ext.overlay.visible = false;
            ext.keybindings.disable(this.keybindings).enable(ext.keybindings.window_focus);
        }
    }

    disable() { this.queue.stop(); this.window = null; this.swap_window = null; }

    snap(ext, win) {
        const mon_geom = ext.monitor_work_area(win.meta.get_monitor());
        if (mon_geom) {
            const rect = win.rect();
            const columns = Math.floor(mon_geom.width / ext.column_size);
            const rows = Math.floor(mon_geom.height / ext.row_size);
            this.change(rect, monitor_rect(mon_geom, columns, rows), 0, 0, 0, 0);
            win.move(ext, rect);
            ext.snapped.insert(win.entity, true);
        }
    }
}

function monitor_rect(monitor, columns, rows) {
    let tile_width = monitor.width / columns, tile_height = monitor.height / rows;
    if (monitor.width * 9 >= monitor.height * 21) tile_width /= 2;
    if (monitor.height * 9 >= monitor.width * 21) tile_height /= 2;
    return new Rect.Rectangle([monitor.x, monitor.y, tile_width, tile_height]);
}

function move_window_or_monitor(ext, method, direction) {
    return () => {
        let next_window = method.call(ext.focus_selector, ext, null);
        next_window = next_window?.actor_exists() ? next_window : null;
        const focus = ext.focus_window();
        if (!focus) return next_window;
        const next_monitor = locate_monitor(focus, direction);
        if (!next_window) return next_monitor ? next_monitor[0] : null;
        if (!next_monitor || focus.meta.get_monitor() === next_window.meta.get_monitor()) return next_window;
        return Rect.Rectangle.from_meta(next_monitor[1]).contains(next_window.rect()) ? next_window : next_monitor[0];
    };
}

function tile_monitors(rect) {
    const workspace = global.workspace_manager.get_active_workspace();
    return Main.layoutManager.monitors
        .map((_m, i) => workspace.get_work_area_for_monitor(i))
        .filter((m) => rect.x + rect.width > m.x && rect.y + rect.height > m.y && rect.x < m.x + m.width && rect.y < m.y + m.height)
        .sort((a, b) => a.width * a.height - b.width * b.height);
}
