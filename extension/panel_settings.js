import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import { PopupMenuItem, PopupSwitchMenuItem, PopupSeparatorMenuItem } from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Button } from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { get_current_path } from './paths.js';

export class Indicator {
    constructor(ext) {
        this.button = new Button(0.0, _('Pop Shell Settings'));
        const path = get_current_path();
        ext.button = this.button;
        ext.button_gio_icon_auto_on = Gio.icon_new_for_string(`${path}/icons/pop-shell-auto-on-symbolic.svg`);
        ext.button_gio_icon_auto_off = Gio.icon_new_for_string(`${path}/icons/pop-shell-auto-off-symbolic.svg`);
        let button_icon_auto_on = new St.Icon({
            gicon: ext.button_gio_icon_auto_on,
            style_class: 'system-status-icon',
        });
        let button_icon_auto_off = new St.Icon({
            gicon: ext.button_gio_icon_auto_off,
            style_class: 'system-status-icon',
        });
        if (ext.settings.tile_by_default()) {
            this.button.icon = button_icon_auto_on;
        }
        else {
            this.button.icon = button_icon_auto_off;
        }
        this.button.add_child(this.button.icon);
        let bm = this.button.menu;
        this.toggle_tiled = tiled(ext);
        this.toggle_active = toggle(_('Show Active Hint'), ext.settings.active_hint(), (toggle) => {
            ext.settings.set_active_hint(toggle.state);
        });
        this.entry_gaps = number_entry(_('Gaps'), ext.settings.gap_inner(), (value) => {
            ext.settings.set_gap_inner(value);
            ext.settings.set_gap_outer(value);
        });
        this.border_radius = number_entry(_('Active Border Radius'), {
            value: ext.settings.active_hint_border_radius(),
            min: 0,
            max: 30,
        }, (value) => {
            ext.settings.set_active_hint_border_radius(value);
        });
        bm.addMenuItem(this.toggle_tiled);
        bm.addMenuItem(menu_separator(''));
        bm.addMenuItem(this.toggle_active);
        bm.addMenuItem(this.border_radius);
        bm.addMenuItem(this.entry_gaps);
    }
    destroy() {
        this.button.destroy();
    }
}

function menu_separator(text) {
    return new PopupSeparatorMenuItem(text);
}

function clamp(input, min = 0, max = 128) {
    return Math.min(Math.max(min, input), max);
}

function number_entry(label, valueOrOptions, callback) {
    let value = valueOrOptions, min, max;
    if (typeof valueOrOptions !== 'number')
        ({ value, min, max } = valueOrOptions);
    const entry = new St.Entry({
        text: String(value),
        input_purpose: Clutter.InputContentPurpose.NUMBER,
        x_align: Clutter.ActorAlign.CENTER,
        x_expand: false,
    });
    entry.set_style('width: 5em');
    entry.connect('button-release-event', () => {
        return true;
    });
    const text = entry.clutter_text;
    text.set_max_length(2);
    entry.connect('key-release-event', (_, event) => {
        const symbol = event.get_key_symbol();
        const number = symbol == 65293
            ? parse_number(text.text)
            : symbol == 65361
                ? clamp(parse_number(text.text) - 1, min, max)
                : symbol == 65363
                    ? clamp(parse_number(text.text) + 1, min, max)
                    : null;
        if (number !== null) {
            text.set_text(String(number));
        }
    });
    const create_icon = (icon_name) => {
        return new St.Icon({ icon_name, icon_size: 16 });
    };
    entry.set_primary_icon(create_icon('value-decrease'));
    entry.connect('primary-icon-clicked', () => {
        text.set_text(String(clamp(parseInt(text.get_text()) - 1, min, max)));
    });
    entry.set_secondary_icon(create_icon('value-increase'));
    entry.connect('secondary-icon-clicked', () => {
        text.set_text(String(clamp(parseInt(text.get_text()) + 1, min, max)));
    });
    text.connect('text-changed', () => {
        const input = text.get_text();
        let parsed = parseInt(input);
        if (isNaN(parsed)) {
            text.set_text(input.substr(0, input.length - 1));
            parsed = 0;
        }
        callback(parsed);
    });
    const item = new PopupMenuItem(label);
    item.label.get_clutter_text().set_x_expand(true);
    item.label.set_y_align(Clutter.ActorAlign.CENTER);
    item.add_child(entry);
    return item;
}

function parse_number(text) {
    let number = parseInt(text, 10);
    if (isNaN(number)) {
        number = 0;
    }
    return number;
}

function toggle(desc, active, connect) {
    let toggle = new PopupSwitchMenuItem(desc, active);
    toggle.label.set_y_align(Clutter.ActorAlign.CENTER);
    toggle.connect('toggled', (_, state) => {
        connect(toggle, state);
        return true;
    });
    return toggle;
}

function tiled(ext) {
    let t = toggle(_('Tile Windows'), null != ext.auto_tiler, (_, shouldTile) => {
        if (shouldTile) {
            ext.auto_tile_on();
        }
        else {
            ext.auto_tile_off();
        }
    });
    return t;
}
