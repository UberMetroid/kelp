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
import { GrabOp } from '../engine/geom/movement.js';
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
}

export function on_grab_start(ext, meta_win, op) {
    const win = ext.get_window(meta_win);
    if (!win) return;
    win.grab = true;
    win.prev_rect = win.rect();

    cancel_drag_signal(ext);
    const is_moving =
        op === Meta.GrabOp.WINDOW_BASE ||
        op === Meta.GrabOp.MOVING ||
        op === Meta.GrabOp.KEYBOARD_MOVING ||
        op === Meta.GrabOp.MOVING_UNCONSTRAINED;

    if (is_moving && ext.auto_tiler && win.is_tilable(ext)) {
        ext.drag_signal = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            if (!win.grab || !ext.auto_tiler) {
                ext.drag_signal = null;
                return GLib.SOURCE_REMOVE;
            }
            const [changed] = ext.auto_tiler.on_drop(ext, win, true);
            if (!changed) {
                ext.overlay.visible = false;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }
}

export function on_grab_end(ext, meta_win, op) {
    cancel_drag_signal(ext);
    ext.overlay.visible = false;

    const win = ext.get_window(meta_win);
    if (!win) return;
    win.grab = false;

    if (!ext.auto_tiler || !win.is_tilable(ext)) return;

    const is_moving =
        op === Meta.GrabOp.WINDOW_BASE ||
        op === Meta.GrabOp.MOVING ||
        op === Meta.GrabOp.KEYBOARD_MOVING ||
        op === Meta.GrabOp.MOVING_UNCONSTRAINED;

    if (is_moving) {
        ext.auto_tiler.on_drop(ext, win, false);
        win.prev_rect = null;
        return;
    }

    if (win.prev_rect) {
        const entity = ext.auto_tiler.attached.get(win.entity);
        if (entity) {
            const grab_op = new GrabOp(op, win.prev_rect);
            const crect = win.rect();
            ext.auto_tiler.forest.resize(
                ext,
                entity,
                fork_for(ext, entity),
                win.entity,
                grab_op.operation(crect),
                crect,
            );
            ext.auto_tiler.forest.arrange(ext, win.workspace_id());
        }
        win.prev_rect = null;
    }
}

function fork_for(ext, entity) {
    return ext.auto_tiler.forest.forks.get(entity);
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
        const register_focus = () => {
            const win = ext.focus_window();
            if (win) ext.on_focused(win);
        };
        ext.register_fn(register_focus);
    });

    connect(display, 'workareas-changed', () => {
        update_display_configuration(ext, true);
    });

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
        });
        connect(Main.overview, 'hiding', () => {
            const win = ext.focus_window();
            if (win) ext.on_focused(win);
        });
    }

    if (Main.sessionMode) {
        connect(Main.sessionMode, 'updated', () => {
            if (Main.sessionMode.isLocked) {
                ext.exit_modes();
            }
        });
    }

    attach_settings_signals(ext, connect);
}

function attach_settings_signals(ext, connect) {
    const s = ext.settings.ext;
    connect(s, 'changed::gap-inner', () => {
        set_gap_inner(ext, ext.settings.gap_inner());
        retile_all(ext);
    });
    connect(s, 'changed::gap-outer', () => {
        set_gap_outer(ext, ext.settings.gap_outer());
        retile_all(ext);
    });
    connect(s, 'changed::smart-gaps', () => retile_all(ext));
    connect(s, 'changed::active-hint', () => {
        const win = ext.focus_window();
        if (win) win.update_border_layout();
    });
    connect(s, 'changed::active-hint-border-radius', () => {
        const win = ext.focus_window();
        if (win) win.update_border_layout();
    });
    connect(s, 'changed::hint-color-rgba', () => {
        const win = ext.focus_window();
        if (win) win.update_border_layout();
    });
    connect(s, 'changed::log-level', () => {
        set_log_level(ext.settings.log_level());
    });
    if (ext.settings.int) {
        connect(ext.settings.int, 'changed::gtk-theme', () => load_theme(ext));
        if (ext.settings.int.settings_schema.has_key('color-scheme')) {
            connect(ext.settings.int, 'changed::color-scheme', () => load_theme(ext));
        }
    }
}

function retile_all(ext) {
    if (!ext.auto_tiler) return;
    for (const [fork] of ext.auto_tiler.forest.forks.values()) {
        if (fork.is_toplevel) {
            fork.area = fork.set_area(fork.area.clone());
            ext.auto_tiler.tile(ext, fork, fork.area);
        }
    }
}
