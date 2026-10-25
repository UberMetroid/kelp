// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Mutter display, workspace-manager, overview, and grab-op signal handlers
//   (`attach_controller_signals`, `on_grab_start`, `on_grab_end`, `on_window_create`, `on_destroy`)
//   routing compositor events into the ECS event queue.
// - Zero-Trust Boundary & Invariants:
//   Stores every connected GObject signal tuple `[object, signal_id]` in `ext.signals` and
//   cancels `drag_signal` GLib timeout sources before re-registering or on `on_grab_end`,
//   guaranteeing zero leaked signal handlers or orphan GLib mainloop sources on `disable()`.

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { ExtEvent } from '../engine/ecs/events.js';
import { GrabOp, is_keyboard_op, is_move_op, is_resize_op } from '../engine/geom/movement.js';
import { Orientation } from '../engine/geom/rectangle.js';
import { cursor_placement } from '../engine/tree/auto_tiler.js';
import { set_log_level } from '../ui/settings/log.js';
import {
    load_theme,
    set_gap_inner,
    set_gap_outer,
    update_display_configuration,
    update_scale,
} from './controller_display.js';

export function cancel_drag_signal(ext) {
    if (ext.drag_signal !== null) {
        GLib.source_remove(ext.drag_signal);
        ext.drag_signal = null;
    }
    ext.grab_op = null;
}

export function on_grab_start(ext, meta_win, op) {
    const win = ext.get_window(meta_win);
    if (!win) return;
    win.grab = true;
    win.prev_rect = win.rect();
    cancel_drag_signal(ext);
    ext.grab_op = new GrabOp(win.entity, win.prev_rect);
    ext.size_signals_block(win);

    if (
        Main.overview.visible ||
        is_keyboard_op(op) ||
        is_resize_op(op) ||
        !is_move_op(op) ||
        !ext.auto_tiler ||
        !win.is_tilable(ext)
    ) {
        return;
    }

    const workspace = ext.active_workspace();
    ext.drag_signal = GLib.timeout_add(GLib.PRIORITY_LOW, 200, () => {
        ext.overlay.visible = false;
        if (!win.grab || !ext.auto_tiler || !ext.grab_op || ext.grab_op.entity !== win.entity) {
            ext.drag_signal = null;
            return GLib.SOURCE_REMOVE;
        }
        const [cursor, monitor] = ext.cursor_status();
        let attach_to = null;
        for (const found of ext.windows_at_pointer(cursor, monitor, workspace)) {
            if (found !== win && ext.auto_tiler.attached.contains(found.entity)) {
                attach_to = found;
                break;
            }
        }
        const fork = ext.auto_tiler.get_parent_fork(win.entity);
        if (!fork) return GLib.SOURCE_CONTINUE;
        const windowless = ext.auto_tiler.largest_on_workspace(ext, monitor, workspace) === null;
        if (attach_to === null && fork.left.inner.kind === 2 && fork.right?.inner.kind === 2) {
            const attaching = fork.left.is_window(win.entity)
                ? fork.right.inner.entity
                : fork.left.inner.entity;
            attach_to = ext.windows.get(attaching);
        }
        let area = null;
        let monitor_attachment = false;
        if (windowless) {
            area = ext.monitor_work_area(monitor);
            area.x += ext.gap_outer;
            area.y += ext.gap_outer;
            area.width -= ext.gap_outer * 2;
            area.height -= ext.gap_outer * 2;
            monitor_attachment = true;
        } else if (attach_to) {
            const is_sibling = ext.auto_tiler.windows_are_siblings(win.entity, attach_to.entity);
            area = win.stack === null && is_sibling ? fork.area : attach_to.meta.get_frame_rect();
        } else {
            return GLib.SOURCE_CONTINUE;
        }
        const result = monitor_attachment ? null : cursor_placement(ext, area, cursor);
        if (!result) {
            ext.set_overlay(area);
            ext.overlay.visible = true;
            return GLib.SOURCE_CONTINUE;
        }
        const { orientation, swap } = result;
        const hw = area.width / 2;
        const hh = area.height / 2;
        const [ox, oy, ow, oh] =
            orientation === Orientation.HORIZONTAL
                ? swap ? [area.x, area.y, hw, area.height] : [area.x + hw, area.y, hw, area.height]
                : swap ? [area.x, area.y, area.width, hh] : [area.x, area.y + hh, area.width, hh];
        ext.set_overlay({ x: ox, y: oy, width: ow, height: oh });
        ext.overlay.visible = true;
        return GLib.SOURCE_CONTINUE;
    });
}

export function on_grab_end(ext, meta_win, op) {
    cancel_drag_signal(ext);
    ext.overlay.visible = false;

    const win = ext.get_window(meta_win);
    if (!win) return;
    win.grab = false;
    ext.size_signals_unblock(win);

    if (!ext.auto_tiler || !win.is_tilable(ext)) return;

    if (is_move_op(op)) {
        ext.auto_tiler.on_drop(ext, win, false);
        win.prev_rect = null;
        return;
    }

    if (win.prev_rect) {
        const entity = ext.auto_tiler.attached.get(win.entity);
        const fork = entity ? ext.auto_tiler.forest.forks.get(entity) : null;
        if (entity && fork) {
            const grab_op = new GrabOp(win.entity, win.prev_rect);
            const crect = win.rect();
            ext.auto_tiler.forest.resize(ext, entity, fork, win.entity, grab_op.operation(crect), crect);
            ext.auto_tiler.forest.arrange(ext, win.workspace_id());
        }
        win.prev_rect = null;
    }
}

export function attach_controller_signals(ext) {
    const connect = (obj, sig, cb) => {
        if (!obj) return;
        ext.signals.push([obj, obj.connect(sig, cb)]);
    };

    const display = global.display;
    const wsm = global.workspace_manager;
    const stage_ctx = St.ThemeContext.get_for_stage(global.stage);

    connect(stage_ctx, 'notify::scale-factor', () => update_scale(ext));

    connect(display, 'window-created', (_d, win) => {
        ext.register(ExtEvent.WindowCreate(win));
    });

    // Mutter 18/19 (GNOME 45–51) passes (display, window, op) on grab-op-begin / grab-op-end
    connect(display, 'grab-op-begin', (_d, win, op) => on_grab_start(ext, win, op));
    connect(display, 'grab-op-end', (_d, win, op) => on_grab_end(ext, win, op));

    connect(display, 'notify::focus-window', () => {
        ext.register_fn(() => {
            const win = ext.focus_window();
            if (win) ext.on_focused(win);
        });
    });

    connect(display, 'workareas-changed', () => update_display_configuration(ext, true));

    if (Main.layoutManager) {
        connect(Main.layoutManager, 'monitors-changed', () => {
            update_display_configuration(ext, false);
        });
    }

    connect(wsm, 'active-workspace-changed', () => {
        ext.hide_all_borders();
        const win = ext.focus_window();
        if (win) ext.on_focused(win);
    });

    if (Main.overview) {
        connect(Main.overview, 'showing', () => {
            ext.exit_modes();
            ext.hide_all_borders();
            ext.auto_tiler?.overview_show?.(ext, true);
        });
        connect(Main.overview, 'hiding', () => {
            ext.auto_tiler?.overview_show?.(ext, false);
            const win = ext.focus_window();
            if (win) ext.on_focused(win);
        });
    }

    if (Main.sessionMode) {
        connect(Main.sessionMode, 'updated', () => {
            if (Main.sessionMode.isLocked) ext.exit_modes();
        });
    }

    attach_settings_signals(ext, connect);
}

function attach_settings_signals(ext, connect) {
    const s = ext.settings.ext;
    connect(s, 'changed::enable-shortcuts', () => {
        ext.keybindings.sync(ext);
        if (ext.indicator?.shortcuts) {
            ext.indicator.shortcuts.setToggleState(ext.settings.enable_shortcuts());
        }
    });
    if (s.settings_schema.has_key('tiling-mode')) {
        connect(s, 'changed::tiling-mode', () => ext.set_mode(ext.settings.tiling_mode()));
    }
    connect(s, 'changed::tile-by-default', () => {
        if (ext.settings.tile_by_default()) {
            if (ext.mode === 'otter') ext.set_mode('octopus');
        } else if (ext.mode !== 'otter') {
            ext.set_mode('otter');
        }
    });
    connect(s, 'changed::gap-inner', () => {
        set_gap_inner(ext, ext.settings.gap_inner());
        ext.retile_workspace();
    });
    connect(s, 'changed::gap-outer', () => {
        set_gap_outer(ext, ext.settings.gap_outer());
        ext.retile_workspace();
    });
    connect(s, 'changed::smart-gaps', () => {
        if (ext.indicator?.smart_gaps) {
            ext.indicator.smart_gaps.setToggleState(ext.settings.smart_gaps());
        }
        ext.retile_workspace();
    });
    for (const key of ['active-hint', 'active-hint-border-radius', 'hint-color-rgba']) {
        connect(s, `changed::${key}`, () => ext.focus_window()?.update_border_layout());
    }
    connect(s, 'changed::log-level', () => set_log_level(ext.settings.log_level()));
    if (ext.settings.int) {
        connect(ext.settings.int, 'changed::gtk-theme', () => load_theme(ext));
        if (ext.settings.int.settings_schema.has_key('color-scheme')) {
            connect(ext.settings.int, 'changed::color-scheme', () => load_theme(ext));
        }
    }
}
