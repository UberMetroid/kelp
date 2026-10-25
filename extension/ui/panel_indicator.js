// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   GNOME Shell top-bar status area menu (`Indicator`) providing quick toggles for auto-tiling,
//   active window border hints, window titlebars, smart gaps, gap spinners, and float exceptions.
// - Zero-Trust Boundary & Invariants:
//   Wraps the indicator button inside a `PanelMenu.Button` added to `Main.panel.statusArea` and
//   removes/destroys all menu actors and GSettings signal handlers cleanly on `destroy()`.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

function number_entry(label, value_or_options, callback) {
    let value = value_or_options;
    let min = 0;
    let max = 128;
    if (typeof value_or_options === 'object' && value_or_options !== null) {
        value = value_or_options.value;
        min = value_or_options.min ?? 0;
        max = value_or_options.max ?? 128;
    }

    const entry = new St.Entry({
        text: String(value),
        input_purpose: Clutter.InputContentPurpose.NUMBER,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'pop-shell-entry',
    });

    const clamp_value = (raw) => {
        const parsed = parseInt(raw, 10);
        if (Number.isNaN(parsed)) return min;
        return Math.max(min, Math.min(max, parsed));
    };

    const emit_change = () => {
        const v = clamp_value(entry.get_text());
        entry.set_text(String(v));
        callback(v);
    };

    const text = entry.clutter_text;
    text.set_max_length(3);
    entry.connect('key-release-event', (_actor, event) => {
        const code = event.get_key_code();
        if (code === 36 || code === 104) {
            emit_change();
        }
    });
    text.connect('key-focus-out', emit_change);

    const adjust = (delta) => {
        const v = clamp_value(parseInt(entry.get_text(), 10) + delta);
        entry.set_text(String(v));
        callback(v);
    };

    entry.connect('scroll-event', (_actor, event) => {
        const dir = event.get_scroll_direction();
        if (dir === Clutter.ScrollDirection.UP) adjust(1);
        else if (dir === Clutter.ScrollDirection.DOWN) adjust(-1);
    });

    const dec = new St.Button({
        label: '-',
        style_class: 'button pop-shell-button',
        y_align: Clutter.ActorAlign.CENTER,
    });
    const inc = new St.Button({
        label: '+',
        style_class: 'button pop-shell-button',
        y_align: Clutter.ActorAlign.CENTER,
    });
    dec.connect('clicked', () => adjust(-1));
    inc.connect('clicked', () => adjust(1));

    const item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
    const lbl = new St.Label({
        text: label,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    item.add_child(lbl);
    item.add_child(dec);
    item.add_child(entry);
    item.add_child(inc);
    return [item, entry];
}

function toggle_item(label, active, connect) {
    const toggle = new PopupMenu.PopupSwitchMenuItem(label, active);
    toggle.label.set_y_align(Clutter.ActorAlign.CENTER);
    toggle.connect('toggled', (_item, state) => connect(state));
    return toggle;
}

const KelpButton = GObject.registerClass(
    class KelpButton extends PanelMenu.Button {
        _init(ext) {
            super._init(0.0, 'Kelp Auto-Tiler', false);
            this.ext = ext;
            this.icon = new St.Icon({
                gicon: Gio.icon_new_for_string(`${ext.path}/icons/pop-shell-auto-on-symbolic.svg`),
                style_class: 'system-status-icon',
            });
            this.add_child(this.icon);
        }
    },
);

export class Indicator {
    constructor(ext) {
        this.ext = ext;
        this.button = new KelpButton(ext);

        this.tiled = toggle_item('Tile Windows', ext.auto_tiler !== null, (enable) => {
            if (enable) ext.auto_tile_on();
            else ext.auto_tile_off();
        });

        this.titlebars = toggle_item('Show Window Titles', ext.settings.show_title(), (enable) => {
            ext.settings.set_show_title(enable);
        });

        this.active_hint = toggle_item('Show Active Hint', ext.settings.active_hint(), (enable) => {
            ext.settings.set_active_hint(enable);
        });

        this.smart_gaps = toggle_item('Smart Gaps', ext.settings.smart_gaps(), (enable) => {
            ext.settings.set_smart_gaps(enable);
        });

        const [gap_item, gap_entry] = number_entry(
            'Gaps',
            { value: ext.settings.gap_inner(), min: 0, max: 64 },
            (value) => {
                ext.settings.set_gap_inner(value);
                ext.settings.set_gap_outer(value);
            },
        );
        this.entry_gaps = gap_entry;

        const [border_item, border_entry] = number_entry(
            'Active Hint Border Radius',
            { value: ext.settings.active_hint_border_radius(), min: 0, max: 32 },
            (value) => ext.settings.set_active_hint_border_radius(value),
        );
        this.border_radius = border_entry;

        const menu = this.button.menu;
        menu.addMenuItem(this.tiled);

        const float_item = new PopupMenu.PopupMenuItem('Floating Window Exceptions');
        float_item.connect('activate', () => {
            menu.close(true);
            ext.exception_drawer();
        });
        menu.addMenuItem(float_item);

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        menu.addMenuItem(this.titlebars);
        menu.addMenuItem(this.active_hint);
        menu.addMenuItem(this.smart_gaps);
        menu.addMenuItem(border_item);
        menu.addMenuItem(gap_item);

        Main.panel.addToStatusArea('pop-shell', this.button);
    }

    get switch_workspace_mode() {
        return this.tiled;
    }

    destroy() {
        if (this.button) {
            this.button.destroy();
            this.button = null;
        }
    }
}
