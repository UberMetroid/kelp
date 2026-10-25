// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   GNOME Shell top-bar status area menu (`Indicator`) providing quick toggles for auto-tiling,
//   keyboard shortcuts, focus-follows-mouse, active border hints, window titlebars, smart gaps,
//   workspace retiling, gap spinners, and floating exceptions.
// - Zero-Trust Boundary & Invariants:
//   Wraps the indicator button inside a `PanelMenu.Button` added to `Main.panel.statusArea` and
//   removes/destroys all menu actors and GSettings signal handlers cleanly on `destroy()`.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

function number_entry(label, value_or_options, callback) {
    const is_obj = typeof value_or_options === 'object' && value_or_options !== null;
    const value = is_obj ? value_or_options.value : value_or_options;
    const min = is_obj ? (value_or_options.min ?? 0) : 0;
    const max = is_obj ? (value_or_options.max ?? 128) : 128;

    const entry = new St.Entry({
        text: String(value),
        input_purpose: Clutter.InputContentPurpose.NUMBER,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'kelp-entry',
    });

    const clamp_value = (raw) => {
        const parsed = parseInt(raw, 10);
        return Number.isNaN(parsed) ? min : Math.max(min, Math.min(max, parsed));
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
        if (code === 36 || code === 104) emit_change();
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

    const dec = new St.Button({ label: '-', style_class: 'button kelp-button', y_align: Clutter.ActorAlign.CENTER });
    const inc = new St.Button({ label: '+', style_class: 'button kelp-button', y_align: Clutter.ActorAlign.CENTER });
    dec.connect('clicked', () => adjust(-1));
    inc.connect('clicked', () => adjust(1));

    const item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
    item.add_child(new St.Label({ text: label, x_expand: true, y_align: Clutter.ActorAlign.CENTER }));
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
            super._init(0.0, _('Kelp Auto-Tiler'), false);
            this.ext = ext;
            this._disable_click_gesture();
            this.icon_octopus = Gio.icon_new_for_string(`${ext.path}/icons/kelp-octopus-symbolic.svg`);
            this.icon_seahorse = Gio.icon_new_for_string(`${ext.path}/icons/kelp-seahorse-symbolic.svg`);
            this.icon_otter = Gio.icon_new_for_string(`${ext.path}/icons/kelp-otter-symbolic.svg`);
            this.icon = new St.Icon({ gicon: this._icon_for_mode(ext.mode), style_class: 'system-status-icon' });
            this.add_child(this.icon);
            this.connect('button-press-event', (_actor, event) => this._on_button_press(event));
            this.connect('touch-event', (_actor, event) => this._on_touch_event(event));
            this.connect('scroll-event', (_actor, event) => this._on_scroll_event(event));
        }

        _disable_click_gesture() {
            if (!this._clickGesture) return;
            this._clickGesture.set_enabled(false);
            if (this._clickGesture.get_actor?.() === this) this.remove_action(this._clickGesture);
        }

        setMenu(menu) { super.setMenu(menu); this._disable_click_gesture(); }

        _icon_for_mode(mode) {
            if (mode === 'seahorse') return this.icon_seahorse;
            return mode === 'otter' ? this.icon_otter : this.icon_octopus;
        }

        sync_icon(mode_or_bool) {
            if (!this.icon) return;
            const mode = typeof mode_or_bool === 'boolean' ? (mode_or_bool ? 'octopus' : 'otter') : mode_or_bool;
            this.icon.gicon = this._icon_for_mode(mode);
        }

        _on_button_press(event) {
            const btn = event.get_button();
            if (btn === Clutter.BUTTON_PRIMARY) {
                this.menu.close(true);
                this.ext.cycle_mode();
                return Clutter.EVENT_STOP;
            }
            if (btn === Clutter.BUTTON_SECONDARY) {
                this.menu.toggle();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }

        _on_touch_event(event) {
            if (event.type() === Clutter.EventType.TOUCH_BEGIN) { this.menu.toggle(); return Clutter.EVENT_STOP; }
            return Clutter.EVENT_PROPAGATE;
        }

        _on_scroll_event(event) {
            if (!this.ext.auto_tiler?.is_seahorse) return Clutter.EVENT_PROPAGATE;
            const dir = event.get_scroll_direction();
            if (dir === Clutter.ScrollDirection.UP || dir === Clutter.ScrollDirection.LEFT) {
                this.ext.focus_left();
                return Clutter.EVENT_STOP;
            }
            if (dir === Clutter.ScrollDirection.DOWN || dir === Clutter.ScrollDirection.RIGHT) {
                this.ext.focus_right();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }
    },
);

const MODE_LABELS = Object.freeze([
    ['octopus', 'Octopus (2D Grid)'],
    ['seahorse', 'Seahorse (Scrolling Strip)'],
    ['otter', 'Otter (Floating)'],
]);

export class Indicator {
    constructor(ext) {
        this.ext = ext;
        this.button = new KelpButton(ext);
        this.wm_prefs = new Gio.Settings({ schema_id: 'org.gnome.desktop.wm.preferences' });
        this._signals = [];
        this.mode_items = new Map();

        const menu = this.button.menu;
        for (const [mode_id, title] of MODE_LABELS) {
            const item = new PopupMenu.PopupMenuItem(_(title));
            item.connect('activate', () => { menu.close(true); ext.set_mode(mode_id); });
            this.mode_items.set(mode_id, item);
            menu.addMenuItem(item);
        }
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this.shortcuts = toggle_item(_('Keyboard Shortcuts'), ext.settings.enable_shortcuts(), (v) =>
            ext.settings.set_enable_shortcuts(v),
        );

        const is_ffm = () => this.wm_prefs.get_string('focus-mode') !== 'click';
        this.focus_follows_mouse = toggle_item(_('Focus Follows Mouse'), is_ffm(), (state) => {
            this.wm_prefs.set_string('focus-mode', state ? 'sloppy' : 'click');
        });
        this._signals.push([
            this.wm_prefs,
            this.wm_prefs.connect('changed::focus-mode', () => this.focus_follows_mouse.setToggleState(is_ffm())),
        ]);

        this.active_hint = toggle_item(_('Show Active Hint'), ext.settings.active_hint(), (v) =>
            ext.settings.set_active_hint(v),
        );
        this.smart_gaps = toggle_item(_('Smart Gaps'), ext.settings.smart_gaps(), (v) =>
            ext.settings.set_smart_gaps(v),
        );

        const [gap_item, gap_entry] = number_entry(
            _('Gaps'),
            { value: ext.settings.gap_inner(), min: 0, max: 64 },
            (v) => { ext.settings.set_gap_inner(v); ext.settings.set_gap_outer(v); },
        );
        this.entry_gaps = gap_entry;

        const [border_item, border_entry] = number_entry(
            _('Active Hint Border Radius'),
            { value: ext.settings.active_hint_border_radius(), min: 0, max: 32 },
            (v) => ext.settings.set_active_hint_border_radius(v),
        );
        this.border_radius = border_entry;

        menu.addMenuItem(this.shortcuts);
        menu.addMenuItem(this.focus_follows_mouse);

        const retile_item = new PopupMenu.PopupMenuItem(_('Retile Workspace'));
        retile_item.connect('activate', () => { menu.close(true); ext.retile_workspace(); });
        menu.addMenuItem(retile_item);

        const float_item = new PopupMenu.PopupMenuItem(_('Floating Window Exceptions'));
        float_item.connect('activate', () => { menu.close(true); ext.exception_drawer(); });
        menu.addMenuItem(float_item);

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        menu.addMenuItem(this.active_hint);
        menu.addMenuItem(this.smart_gaps);
        menu.addMenuItem(border_item);
        menu.addMenuItem(gap_item);

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const prefs_item = new PopupMenu.PopupMenuItem(_('Settings & About…'));
        prefs_item.connect('activate', () => {
            menu.close(true);
            this.ext.extension?.openPreferences?.();
        });
        menu.addMenuItem(prefs_item);

        this.sync_mode(ext.mode);
        Main.panel.addToStatusArea('kelp', this.button);
    }

    sync_mode(mode) {
        this.button.sync_icon(mode);
        for (const [mode_id, item] of this.mode_items.entries()) {
            item.setOrnament(mode_id === mode ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        }
    }

    destroy() {
        for (const [obj, sig] of this._signals) {
            try { obj.disconnect(sig); } catch (_e) { /* GObject already finalized */ }
        }
        this._signals = [];
        this.wm_prefs = null;
        if (this.button) { this.button.destroy(); this.button = null; }
    }
}
