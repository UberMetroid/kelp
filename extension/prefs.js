// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   GTK4 / Libadwaita Preferences UI (`KelpPreferences extends ExtensionPreferences`)
//   rendering tiling, active-hint, gap, cursor-warp, and logging controls in `gnome-extensions-app`.
// - Zero-Trust Boundary & Invariants:
//   Runs in the separate GTK4 `gnome-extensions-app` process. Imports ONLY GTK4 (`gi://Gtk`,
//   `gi://Gdk`), `ExtensionPreferences`, and process-agnostic modules (`FocusPosition`,
//   `ExtensionSettings`, `LOG_LEVELS`). Never imports `gi://Meta`, `gi://Clutter`, or `gi://St`.

import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { FocusPosition } from './engine/geom/focus.js';
import { ExtensionSettings } from './ui/settings/gsettings.js';
import { LOG_LEVELS } from './ui/settings/log.js';

function add_toggle_row(grid, row, label_text, active, on_toggle) {
    const label = new Gtk.Label({
        label: label_text,
        halign: Gtk.Align.START,
        hexpand: true,
    });
    const toggle = new Gtk.Switch({
        active: Boolean(active),
        halign: Gtk.Align.END,
        valign: Gtk.Align.CENTER,
    });
    toggle.connect('notify::active', () => on_toggle(toggle.active));
    grid.attach(label, 0, row, 1, 1);
    grid.attach(toggle, 1, row, 1, 1);
    return toggle;
}

function add_spin_row(grid, row, label_text, value, min, max, step, on_change) {
    const label = new Gtk.Label({
        label: label_text,
        halign: Gtk.Align.START,
        hexpand: true,
    });
    const spin = Gtk.SpinButton.new_with_range(min, max, step);
    spin.set_value(value);
    spin.set_halign(Gtk.Align.END);
    spin.connect('value-changed', () => on_change(spin.get_value_as_int()));
    grid.attach(label, 0, row, 1, 1);
    grid.attach(spin, 1, row, 1, 1);
    return spin;
}

function add_combo_row(grid, row, label_text, items, active_idx, on_change) {
    const label = new Gtk.Label({
        label: label_text,
        halign: Gtk.Align.START,
        hexpand: true,
    });
    const combo = new Gtk.ComboBoxText({ halign: Gtk.Align.END });
    for (const item of items) {
        combo.append_text(item);
    }
    combo.set_active(active_idx);
    combo.connect('changed', () => on_change(combo.get_active()));
    grid.attach(label, 0, row, 1, 1);
    grid.attach(combo, 1, row, 1, 1);
    return combo;
}

function build_settings_widget(ext_settings) {
    const settings = new ExtensionSettings(ext_settings);
    const grid = new Gtk.Grid({
        column_spacing: 16,
        row_spacing: 12,
        margin_top: 24,
        margin_bottom: 24,
        margin_start: 24,
        margin_end: 24,
    });

    let row = 0;
    add_toggle_row(grid, row++, 'Tile Windows by Default', settings.tile_by_default(), (v) =>
        settings.set_tile_by_default(v),
    );
    add_toggle_row(grid, row++, 'Keyboard Shortcuts', settings.enable_shortcuts(), (v) =>
        settings.set_enable_shortcuts(v),
    );
    add_toggle_row(grid, row++, 'Focus Follows Mouse', settings.focus_follows_mouse(), (v) =>
        settings.set_focus_follows_mouse(v),
    );
    add_toggle_row(grid, row++, 'Smart Gaps', settings.smart_gaps(), (v) =>
        settings.set_smart_gaps(v),
    );
    add_toggle_row(grid, row++, 'Snap to Grid (Adjustment Mode)', settings.snap_to_grid(), (v) =>
        settings.set_snap_to_grid(v),
    );
    add_toggle_row(grid, row++, 'Show Active Hint Border', settings.active_hint(), (v) =>
        settings.set_active_hint(v),
    );

    const color_label = new Gtk.Label({
        label: 'Active Hint Color',
        halign: Gtk.Align.START,
        hexpand: true,
    });
    const rgba = new Gdk.RGBA();
    if (!rgba.parse(settings.hint_color_rgba())) {
        rgba.parse('rgba(106, 215, 225, 1)');
    }
    const color_button = new Gtk.ColorButton({
        rgba,
        use_alpha: true,
        halign: Gtk.Align.END,
    });
    color_button.connect('color-set', () => {
        settings.set_hint_color_rgba(color_button.get_rgba().to_string());
    });
    grid.attach(color_label, 0, row, 1, 1);
    grid.attach(color_button, 1, row++, 1, 1);

    add_toggle_row(grid, row++, 'Allow Stacking with Mouse', settings.stacking_with_mouse(), (v) =>
        settings.set_stacking_with_mouse(v),
    );
    add_toggle_row(grid, row++, 'Show Minimize to Tray Windows', settings.show_skip_taskbar(), (v) =>
        settings.set_show_skip_taskbar(v),
    );
    add_spin_row(
        grid, row++, 'Active Hint Border Radius (px)',
        settings.active_hint_border_radius(), 0, 30, 1,
        (v) => settings.set_active_hint_border_radius(v),
    );
    add_spin_row(
        grid, row++, 'Inner Window Gap (px)',
        settings.gap_inner(), 0, 64, 2,
        (v) => settings.set_gap_inner(v),
    );
    add_spin_row(
        grid, row++, 'Outer Workspace Gap (px)',
        settings.gap_outer(), 0, 64, 2,
        (v) => settings.set_gap_outer(v),
    );
    add_spin_row(
        grid, row++, 'Max Window Width (px, 0 = disabled)',
        settings.max_window_width(), 0, 7680, 64,
        (v) => settings.set_max_window_width(v),
    );
    add_toggle_row(
        grid, row++, 'Mouse Cursor Follows Active Window',
        settings.mouse_cursor_follows_active_window(),
        (v) => settings.set_mouse_cursor_follows_active_window(v),
    );

    const focus_positions = [
        FocusPosition.TopLeft,
        FocusPosition.TopRight,
        FocusPosition.BottomLeft,
        FocusPosition.BottomRight,
        FocusPosition.Center,
    ];
    add_combo_row(
        grid, row++, 'Mouse Cursor Focus Position',
        focus_positions, settings.mouse_cursor_focus_location(),
        (idx) => {
            if (idx >= 0) settings.set_mouse_cursor_focus_location(idx);
        },
    );

    const log_names = Object.keys(LOG_LEVELS);
    add_combo_row(
        grid, row++, 'Log Level',
        log_names, settings.log_level(),
        (idx) => {
            if (idx >= 0) settings.set_log_level(idx);
        },
    );

    return grid;
}

export default class KelpPreferences extends ExtensionPreferences {
    getPreferencesWidget() {
        return build_settings_widget(this.getSettings());
    }
}
