// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Active window border actor (`WindowBorder`) and cursor warp helper (`place_cursor_on_window`)
//   for `ShellWindow` wrappers.
// - Zero-Trust Boundary & Invariants:
//   Attaches the active border `St.Bin` to `global.window_group`, hides it during fullscreen or
//   maximized states, and destroys the actor deterministically on window removal or `ext.destroy()`.
//   Uses Clutter's virtual input device (`Clutter.get_default_backend().get_default_seat()`)
//   defensively when warping the pointer so Wayland cursor moves never throw if unavailable.

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';
import { FocusPosition } from '../engine/geom/focus.js';

export class WindowBorder {
    constructor(win) {
        this.win = win;
        this.border = new St.Bin({
            style_class: 'kelp-active-hint kelp-border-normal',
            reactive: false,
            can_focus: false,
        });
        if (global.window_group) {
            global.window_group.add_child(this.border);
        }
        this.hide();
    }

    hide() {
        if (this.border) {
            this.border.hide();
        }
    }

    show(ext) {
        if (!this.border || !ext.settings.active_hint()) {
            this.hide();
            return;
        }
        const meta = this.win.meta;
        if (
            meta.minimized ||
            meta.is_fullscreen() ||
            meta.customJS_ding ||
            meta.get_window_type() !== Meta.WindowType.NORMAL ||
            meta.get_title()?.startsWith('Desktop Icons ') ||
            (this.win.is_maximized() && ext.settings.smart_gaps())
        ) {
            this.hide();
            return;
        }
        const actor = meta.get_compositor_private();
        if (!actor || !actor.visible) {
            this.hide();
            return;
        }

        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
        const width = ext.settings.active_hint_size() * scale;
        const radius = ext.settings.active_hint_border_radius() * scale;
        const color = ext.settings.hint_color_rgba();
        const rect = this.win.target_rect ?? this.win.rect();

        this.border.style =
            `border-width: ${width}px; border-color: ${color}; border-radius: ${radius}px;`;
        this.border.set_position(rect.x - width, rect.y - width);
        this.border.set_size(rect.width + width * 2, rect.height + width * 2);

        const group = global.window_group;
        if (group && this.border.get_parent() === group && actor.get_parent() === group) {
            group.set_child_above_sibling(this.border, actor);
        }
        this.border.show();
    }

    destroy() {
        if (this.border) {
            this.border.destroy();
            this.border = null;
        }
    }
}

/**
 * Warps the mouse pointer to the user's configured `FocusPosition` anchor inside `rect`.
 */
export function place_cursor_on_rect(rect, focus_position) {
    let x = rect.x + rect.width / 2;
    let y = rect.y + rect.height / 2;
    const pad = 16;
    const keys = Object.keys(FocusPosition);
    const resolved = typeof focus_position === 'number'
        ? FocusPosition[keys[focus_position]]
        : focus_position;

    if (resolved === FocusPosition.TopLeft) {
        x = rect.x + pad;
        y = rect.y + pad;
    } else if (resolved === FocusPosition.TopRight) {
        x = rect.x + Math.max(pad, rect.width - pad);
        y = rect.y + pad;
    } else if (resolved === FocusPosition.BottomLeft) {
        x = rect.x + pad;
        y = rect.y + Math.max(pad, rect.height - pad);
    } else if (resolved === FocusPosition.BottomRight) {
        x = rect.x + Math.max(pad, rect.width - pad);
        y = rect.y + Math.max(pad, rect.height - pad);
    }

    try {
        const seat =
            global.stage?.get_context?.()?.get_backend?.()?.get_default_seat?.() ??
            Clutter.get_default_backend?.()?.get_default_seat?.();
        if (seat && typeof seat.warp_pointer === 'function') {
            seat.warp_pointer(Math.round(x), Math.round(y));
        }
    } catch (_e) {
        // Wayland seat pointer warp may be restricted during modal grab
    }
}
