// SPDX-License-Identifier: GPL-3.0-or-later
// Active window border actor (`WindowBorder`) and cursor warp helper (`place_cursor_on_rect`).

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';
import { FocusPosition } from '../engine/geom/focus.js';

export class WindowBorder {
    constructor(win) {
        this.win = win;
        this.border = null;
    }

    hide() {
        if (this.border) {
            this.border.hide();
        }
    }

    show(ext) {
        if (!ext.settings.active_hint()) {
            this.hide();
            return;
        }
        const meta = this.win.meta;
        const title = meta.get_title() ?? '';
        if (
            meta.minimized ||
            meta.is_fullscreen() ||
            meta.is_attached_dialog?.() ||
            meta.get_window_type() !== Meta.WindowType.NORMAL ||
            title.startsWith('Desktop Icons ') ||
            title.includes('@!') ||
            this.win.is_maximized() ||
            (this.win.smart_gapped && ext.settings.smart_gaps())
        ) {
            this.hide();
            return;
        }
        const actor = meta.get_compositor_private();
        if (!actor || !actor.visible) {
            this.hide();
            return;
        }
        if (!this.border) {
            this.border = new St.Bin({
                style_class: 'kelp-active-hint kelp-border-normal',
                reactive: false,
                can_focus: false,
            });
        }
        if (global.window_group && !this.border.get_parent()) {
            global.window_group.add_child(this.border);
        }

        const scale = ext.dpi || St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
        const css_w = ext.settings.active_hint_size();
        const css_r = ext.settings.active_hint_border_radius();
        const width = css_w * scale;
        const color = ext.settings.hint_color_rgba();
        const rect = this.win.target_rect ?? this.win.rect();

        this.border.style =
            `border-width: ${css_w}px; border-color: ${color}; border-radius: ${css_r}px;`;
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
