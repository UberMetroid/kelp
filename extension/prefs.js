// SPDX-License-Identifier: GPL-3.0-or-later
// Multi-tab GTK4 / Libadwaita preferences UI for Kelp tiling modes, borders, and shortcuts.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { FocusPosition } from './engine/geom/focus.js';
import { format_rgba, parse_rgba, sync_color_across_suite } from './ui/settings/color.js';
import { ExtensionSettings } from './ui/settings/gsettings.js';
import { LOG_LEVELS } from './ui/settings/log.js';
import { BORDER_PRESETS, build_about_page, build_shortcuts_page } from './ui/settings/prefs_pages.js';

function make_switch_row(title, subtitle, active, on_toggle) {
    const row = new Adw.ActionRow({ title, subtitle });
    const sw = new Gtk.Switch({ active: Boolean(active), valign: Gtk.Align.CENTER });
    sw.connect('notify::active', () => on_toggle(sw.active));
    row.add_suffix(sw);
    row.activatable_widget = sw;
    return [row, sw];
}

function make_spin_row(title, subtitle, value, min, max, step, on_change) {
    const row = new Adw.ActionRow({ title, subtitle });
    const spin = Gtk.SpinButton.new_with_range(min, max, step);
    spin.set_value(value);
    spin.set_valign(Gtk.Align.CENTER);
    spin.connect('value-changed', () => on_change(spin.get_value_as_int()));
    row.add_suffix(spin);
    row.activatable_widget = spin;
    return [row, spin];
}

function make_combo_row(title, subtitle, items, active_idx, on_change) {
    const row = new Adw.ActionRow({ title, subtitle });
    const combo = new Gtk.ComboBoxText({ valign: Gtk.Align.CENTER });
    for (const item of items) combo.append_text(item);
    combo.set_active(Math.max(0, active_idx));
    combo.connect('changed', () => on_change(combo.get_active()));
    row.add_suffix(combo);
    row.activatable_widget = combo;
    return [row, combo];
}

function build_tiling_page(ext_settings, settings, signals) {
    const page = new Adw.PreferencesPage({ title: 'Tiling & Modes', icon_name: 'view-grid-symbolic' });
    const mode_group = new Adw.PreferencesGroup({
        title: 'Default Tiling Mode &amp; Behavior',
        description: 'Select your default layout mode and tiling behavior',
    });
    const mode_labels = ['Octopus (2D BSP)', 'Seahorse (Scrolling Columns)', 'Otter (Floating & Snap)'];
    const mode_ids = ['octopus', 'seahorse', 'otter'];
    const [mode_row, mode_combo] = make_combo_row(
        'Default Tiling Mode', 'Left-click the top-bar icon or press Super+Y to cycle modes anytime',
        mode_labels, Math.max(0, mode_ids.indexOf(settings.tiling_mode())),
        (idx) => { if (idx >= 0 && idx < mode_ids.length) settings.set_tiling_mode(mode_ids[idx]); },
    );
    const [tile_row, tile_sw] = make_switch_row(
        'Tile Windows by Default', 'Automatically tile newly launched normal windows',
        settings.tile_by_default(), (v) => settings.set_tile_by_default(v),
    );
    const [sc_row, sc_sw] = make_switch_row('Enable Keyboard Shortcuts', 'Master toggle for all Kelp shortcuts',
        settings.enable_shortcuts(), (v) => settings.set_enable_shortcuts(v));
    const [sg_row, sg_sw] = make_switch_row('Smart Gaps', 'Hide outer workspace gaps when only 1 window is visible',
        settings.smart_gaps(), (v) => settings.set_smart_gaps(v));
    const [sn_row, sn_sw] = make_switch_row('Snap to Grid', 'Snap floating windows to grid in adjustment mode',
        settings.snap_to_grid(), (v) => settings.set_snap_to_grid(v));
    const [st_row, st_sw] = make_switch_row('Mouse-Driven Stacking', 'Allow dropping a window onto a stack header with the mouse',
        settings.stacking_with_mouse(), (v) => settings.set_stacking_with_mouse(v));
    const [sk_row, sk_sw] = make_switch_row('Include Minimize-to-Tray Windows', 'Tile windows that set the skip-taskbar hint',
        settings.show_skip_taskbar(), (v) => settings.set_show_skip_taskbar(v));
    const [mw_row, mw_spin] = make_spin_row('Max Window Columns / Width (px)', 'Maximum width of tiled windows (0 = unlimited)',
        settings.max_window_width(), 0, 7680, 64, (v) => settings.set_max_window_width(v));
    for (const r of [mode_row, tile_row, sc_row, sg_row, sn_row, st_row, sk_row, mw_row]) mode_group.add(r);
    page.add(mode_group);

    const focus_group = new Adw.PreferencesGroup({
        title: 'Pointer &amp; Focus Navigation',
        description: 'Configure mouse focus tracking and cursor warping on keyboard navigation',
    });
    const [ffm_row, ffm_sw] = make_switch_row('Focus Follows Mouse', 'Focus windows automatically when the pointer enters them',
        settings.focus_follows_mouse(), (v) => settings.set_focus_follows_mouse(v));
    const [mcf_row, mcf_sw] = make_switch_row('Pointer Follows Active Window', 'Warp cursor into the newly focused window on keyboard navigation',
        settings.mouse_cursor_follows_active_window(), (v) => settings.set_mouse_cursor_follows_active_window(v));
    const focus_positions = [
        FocusPosition.TopLeft, FocusPosition.TopRight,
        FocusPosition.BottomLeft, FocusPosition.BottomRight, FocusPosition.Center,
    ];
    const [fl_row, fl_combo] = make_combo_row('Focus Cursor Position', 'Target anchor when warping pointer to the active window',
        focus_positions, settings.mouse_cursor_focus_location(),
        (idx) => { if (idx >= 0) settings.set_mouse_cursor_focus_location(idx); });
    const [ll_row, ll_combo] = make_combo_row('Diagnostic Log Level', 'Verbosity for journalctl / GNOME Shell logs',
        Object.keys(LOG_LEVELS), settings.log_level(),
        (idx) => { if (idx >= 0) settings.set_log_level(idx); });

    const reset_row = new Adw.ActionRow({
        title: 'Reset to Kelp Defaults (border=2, space=6)',
        subtitle: 'Restore v2.2.0 default tiling mode, 2px Coral Red border, 6px gaps, and behavior settings',
    });
    const reset_btn = new Gtk.Button({
        label: 'Reset Defaults', valign: Gtk.Align.CENTER, css_classes: ['destructive-action', 'pill'],
    });
    reset_btn.connect('clicked', () => settings.reset_defaults());
    reset_row.add_suffix(reset_btn);
    reset_row.activatable_widget = reset_btn;
    for (const r of [ffm_row, mcf_row, fl_row, ll_row, reset_row]) focus_group.add(r);
    page.add(focus_group);

    const sync_tiling = () => {
        const next_idx = Math.max(0, mode_ids.indexOf(settings.tiling_mode()));
        if (mode_combo.get_active() !== next_idx) mode_combo.set_active(next_idx);
        if (tile_sw.active !== settings.tile_by_default()) tile_sw.active = settings.tile_by_default();
        if (sc_sw.active !== settings.enable_shortcuts()) sc_sw.active = settings.enable_shortcuts();
        if (sg_sw.active !== settings.smart_gaps()) sg_sw.active = settings.smart_gaps();
        if (sn_sw.active !== settings.snap_to_grid()) sn_sw.active = settings.snap_to_grid();
        if (st_sw.active !== settings.stacking_with_mouse()) st_sw.active = settings.stacking_with_mouse();
        if (sk_sw.active !== settings.show_skip_taskbar()) sk_sw.active = settings.show_skip_taskbar();
        if (mw_spin.get_value_as_int() !== settings.max_window_width()) mw_spin.set_value(settings.max_window_width());
        if (ffm_sw.active !== settings.focus_follows_mouse()) ffm_sw.active = settings.focus_follows_mouse();
        if (mcf_sw.active !== settings.mouse_cursor_follows_active_window()) mcf_sw.active = settings.mouse_cursor_follows_active_window();
        if (fl_combo.get_active() !== settings.mouse_cursor_focus_location()) fl_combo.set_active(settings.mouse_cursor_focus_location());
        if (ll_combo.get_active() !== settings.log_level()) ll_combo.set_active(settings.log_level());
    };
    const t_keys = [
        'tiling-mode', 'tile-by-default', 'enable-shortcuts', 'smart-gaps', 'snap-to-grid',
        'stacking-with-mouse', 'show-skip-taskbar', 'max-window-width',
        'mouse-cursor-follows-active-window', 'mouse-cursor-focus-location', 'log-level',
    ];
    for (const k of t_keys) {
        if (ext_settings.settings_schema?.has_key(k)) signals.push([ext_settings, ext_settings.connect(`changed::${k}`, sync_tiling)]);
    }
    return page;
}

function build_appearance_page(ext_settings, settings, signals) {
    const page = new Adw.PreferencesPage({ title: 'Appearance & Borders', icon_name: 'applications-graphics-symbolic' });
    const border_group = new Adw.PreferencesGroup({
        title: 'Active Window Border &amp; Color Presets',
        description: 'Customize the focus border ring and 1-click color presets',
    });
    const [hint_row, hint_sw] = make_switch_row('Show Active Window Border',
        'Draw a high-contrast border around the focused window', settings.active_hint(), (v) => settings.set_active_hint(v));
    border_group.add(hint_row);

    const color_row = new Adw.ActionRow({
        title: 'Active Border Color',
        subtitle: 'Pick a custom RGBA color or select a color preset below',
    });
    const rgba = new Gdk.RGBA();
    if (!rgba.parse(settings.hint_color_rgba())) rgba.parse('rgb(255,0,0)');
    const color_btn = new Gtk.ColorButton({ rgba, use_alpha: true, valign: Gtk.Align.CENTER });
    color_btn.connect('color-set', () => settings.set_hint_color_rgba(color_btn.get_rgba().to_string()));
    color_row.add_suffix(color_btn);
    color_row.activatable_widget = color_btn;
    border_group.add(color_row);

    const preset_labels = [...BORDER_PRESETS.map(([label]) => label), 'Custom Color'];
    const match_preset = (color) => BORDER_PRESETS.findIndex(([, c]) => format_rgba(parse_rgba(c)) === color);
    const init_idx = match_preset(settings.hint_color_rgba());
    const [preset_row, preset_combo] = make_combo_row(
        'Quick Color Presets', 'One-click color presets for your active window border',
        preset_labels, init_idx >= 0 ? init_idx : BORDER_PRESETS.length,
        (idx) => {
            if (idx >= 0 && idx < BORDER_PRESETS.length) {
                const css_color = BORDER_PRESETS[idx][1];
                settings.set_hint_color_rgba(css_color);
                const next_rgba = new Gdk.RGBA();
                if (next_rgba.parse(css_color)) color_btn.set_rgba(next_rgba);
            }
        },
    );
    border_group.add(preset_row);

    const sync_row = new Adw.ActionRow({
        title: 'Sync Color Across Suite',
        subtitle: 'Apply this accent border color to all installed Studio 2201 extensions (Coral, Kelp, Reef, Seabed, Tide)',
    });
    const sync_btn = new Gtk.Button({ label: 'Sync Suite Color', valign: Gtk.Align.CENTER, css_classes: ['pill'] });
    sync_btn.connect('clicked', () => {
        const count = sync_color_across_suite(settings.hint_color_rgba());
        sync_btn.set_label(`Synced (${count})`);
    });
    sync_row.add_suffix(sync_btn);
    sync_row.activatable_widget = sync_btn;
    border_group.add(sync_row);

    const [size_row, size_spin] = make_spin_row('Border Width (px)',
        'Thickness of the active focus border (1–16 px)', settings.active_hint_size(), 1, 16, 1, (v) => settings.set_active_hint_size(v));
    const [rad_row, rad_spin] = make_spin_row('Border Corner Radius (px)',
        'Corner rounding of the active border (0–32 px)', settings.active_hint_border_radius(), 0, 32, 1,
        (v) => settings.set_active_hint_border_radius(v));
    border_group.add(size_row);
    border_group.add(rad_row);
    page.add(border_group);

    const gap_group = new Adw.PreferencesGroup({
        title: 'Workspace Gaps',
        description: 'Configure inner and outer tiling gaps on each workspace',
    });
    const [in_row, in_spin] = make_spin_row('Inner Gap (px)',
        'Gap between adjacent tiled windows (0–64 px)', settings.gap_inner(), 0, 64, 2, (v) => settings.set_gap_inner(v));
    const [out_row, out_spin] = make_spin_row('Outer Gap (px)',
        'Gap around the monitor work-area edges (0–64 px)', settings.gap_outer(), 0, 64, 2, (v) => settings.set_gap_outer(v));
    gap_group.add(in_row);
    gap_group.add(out_row);
    page.add(gap_group);

    const sync_ui = () => {
        if (hint_sw.active !== settings.active_hint()) hint_sw.active = settings.active_hint();
        if (size_spin.get_value_as_int() !== settings.active_hint_size()) size_spin.set_value(settings.active_hint_size());
        if (rad_spin.get_value_as_int() !== settings.active_hint_border_radius()) {
            rad_spin.set_value(settings.active_hint_border_radius());
        }
        if (in_spin.get_value_as_int() !== settings.gap_inner()) in_spin.set_value(settings.gap_inner());
        if (out_spin.get_value_as_int() !== settings.gap_outer()) out_spin.set_value(settings.gap_outer());
        const next_color = settings.hint_color_rgba();
        const next_rgba = new Gdk.RGBA();
        if (next_rgba.parse(next_color) && !color_btn.get_rgba().equal(next_rgba)) color_btn.set_rgba(next_rgba);
        const next_idx = match_preset(next_color);
        const target_idx = next_idx >= 0 ? next_idx : BORDER_PRESETS.length;
        if (preset_combo.get_active() !== target_idx) preset_combo.set_active(target_idx);
    };
    for (const k of ['active-hint', 'active-hint-size', 'active-hint-border-radius', 'gap-inner', 'gap-outer', 'hint-color-rgba']) {
        if (ext_settings.settings_schema?.has_key(k)) signals.push([ext_settings, ext_settings.connect(`changed::${k}`, sync_ui)]);
    }
    return page;
}

export default class KelpPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const ext_settings = this.getSettings();
        const settings = new ExtensionSettings(ext_settings);
        const signals = [];

        window.set_default_size(760, 680);
        window.add(build_tiling_page(ext_settings, settings, signals));
        window.add(build_appearance_page(ext_settings, settings, signals));
        window.add(build_shortcuts_page());
        window.add(build_about_page(this.metadata?.['version-name']));

        const cleanup = () => {
            for (const [obj, sig] of signals) obj.disconnect(sig);
            signals.length = 0;
        };
        window.connect('close-request', () => { cleanup(); return false; });
        window.connect('destroy', cleanup);
    }
}
