// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Tab bar button builder (`create_stack_tab`) and active-tab CSS styling (`style_active_tab`,
//   `INACTIVE_TAB_STYLE`, `URGENT_TAB_STYLE`) for stacked window containers (`Stack`).
// - Zero-Trust Boundary & Invariants:
//   Connects every GSettings `changed::hint-color-rgba` signal handler onto `c.hint_signal`
//   and disconnects it deterministically in `disconnect_stack_tab(ext, c)` so closing a stacked
//   window or disabling the extension leaves zero dangling signal handlers on `ext.settings.ext`.

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { text_color_for_css } from './settings/color.js';

export const INACTIVE_TAB_STYLE = null;
export const URGENT_TAB_STYLE = 'background: #712600; color: white;';

/**
 * Computes the inline CSS style for the active stack tab from the user's configured
 * active-hint color, choosing white or black text via WCAG relative luminance.
 */
export function active_tab_style(ext) {
    const color = ext.settings.hint_color_rgba();
    const text = text_color_for_css(color);
    return `background: ${color}; color: ${text};`;
}

/**
 * Disconnects all window and GSettings signals registered for a single stack tab entry `c`.
 */
export function disconnect_stack_tab(ext, c) {
    const window = ext.windows.get(c.entity);
    if (window) {
        if (c.window_changed) {
            window.meta.disconnect(c.window_changed);
            c.window_changed = null;
        }
        if (c.urgency_changed) {
            window.meta.disconnect(c.urgency_changed);
            c.urgency_changed = null;
        }
    }
    if (c.hint_signal && ext.settings && ext.settings.ext) {
        ext.settings.ext.disconnect(c.hint_signal);
        c.hint_signal = null;
    }
}

/**
 * Constructs a clickable `St.Button` tab widget for `window` inside `stack` and binds
 * title-change, urgency/attention, and hint-color update signals.
 */
export function create_stack_tab(stack, window, active_style) {
    const ext = stack.ext;
    const entity = window.entity;
    const title_text = window.title() || window.name(ext) || 'Window';
    const label = new St.Label({
        text: title_text,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const button = new St.Button({
        reactive: true,
        can_focus: true,
        track_hover: true,
        x_expand: true,
        style_class: 'pop-shell-tab',
        style: active_style,
        child: label,
    });

    const entry = {
        active: true,
        entity,
        button,
        signals: [],
        window_changed: null,
        urgency_changed: null,
        hint_signal: null,
    };

    entry.signals.push(
        button.connect('clicked', () => {
            stack.activate(entity);
            const win = ext.windows.get(entity);
            if (win) {
                win.activate(ext, false);
                ext.on_focused(win);
            }
        }),
    );

    entry.window_changed = window.meta.connect('notify::title', () => {
        label.set_text(window.title() || window.name(ext) || 'Window');
    });

    const on_urgency = () => {
        if (window.meta.demands_attention || window.meta.urgent) {
            button.style_class = 'pop-shell-tab pop-shell-tab-urgent';
            button.style = URGENT_TAB_STYLE;
        } else if (entry.active) {
            button.style_class = 'pop-shell-tab pop-shell-tab-active';
            button.style = stack.active_style;
        } else {
            button.style_class = 'pop-shell-tab pop-shell-tab-inactive';
            button.style = INACTIVE_TAB_STYLE;
        }
    };

    entry.urgency_changed = window.meta.connect('notify::urgent', on_urgency);

    entry.hint_signal = ext.settings.ext.connect('changed::hint-color-rgba', () => {
        stack.active_style = active_tab_style(ext);
        if (entry.active) {
            button.style = stack.active_style;
        }
    });

    return entry;
}
