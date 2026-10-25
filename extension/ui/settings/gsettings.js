// SPDX-License-Identifier: GPL-3.0-or-later
// Typed wrapper (ExtensionSettings) around Kelp, desktop, and Mutter GSettings schemas.

import Gio from 'gi://Gio';
import { parse_rgba, format_rgba } from './color.js';

const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';
const INTERFACE_KEY = 'gtk-theme';
const WM_PREFERENCES_SCHEMA = 'org.gnome.desktop.wm.preferences';
const WM_PREFERENCES_KEY = 'titlebar-uses-system-theme';
const MUTTER_SCHEMA = 'org.gnome.mutter';
const WORKSPACES_ONLY_ON_PRIMARY = 'workspaces-only-on-primary';

function settings_new_schema(schema) {
    const source = Gio.SettingsSchemaSource.get_default();
    if (!source) return null;
    return source.lookup(schema, true) ? new Gio.Settings({ schema_id: schema }) : null;
}

const BOOL_KEYS = Object.freeze([
    'active-hint',
    'enable-shortcuts',
    'mouse-cursor-follows-active-window',
    'show-skip-taskbar',
    'show-title',
    'smart-gaps',
    'snap-to-grid',
    'stacking-with-mouse',
]);

const UINT_KEYS = Object.freeze([
    'active-hint-border-radius',
    'column-size',
    'gap-inner',
    'gap-outer',
    'log-level',
    'max-window-width',
    'mouse-cursor-focus-location',
    'row-size',
]);

export const TILING_MODES = Object.freeze(['octopus', 'seahorse', 'otter']);

export class ExtensionSettings {
    constructor(ext_settings) {
        this.ext = ext_settings;
        this.int = settings_new_schema(INTERFACE_SCHEMA);
        this.wm = settings_new_schema(WM_PREFERENCES_SCHEMA);
        this.mutter = settings_new_schema(MUTTER_SCHEMA);

        for (const key of BOOL_KEYS) {
            const prop = key.replace(/-/g, '_');
            this[prop] = () => this.ext.get_boolean(key);
            this[`set_${prop}`] = (v) => this.ext.set_boolean(key, Boolean(v));
        }

        for (const key of UINT_KEYS) {
            const prop = key.replace(/-/g, '_');
            this[prop] = () => this.ext.get_uint(key);
            this[`set_${prop}`] = (v) => this.ext.set_uint(key, Math.max(0, Number(v) | 0));
        }
    }

    tile_by_default() {
        return this.ext.get_boolean('tile-by-default');
    }

    tiling_mode() {
        if (!this.ext.settings_schema.has_key('tiling-mode')) {
            return this.tile_by_default() ? 'octopus' : 'otter';
        }
        const raw = this.ext.get_string('tiling-mode');
        return TILING_MODES.includes(raw) ? raw : 'octopus';
    }

    set_tiling_mode(mode) {
        const valid = TILING_MODES.includes(mode) ? mode : 'octopus';
        if (this.ext.settings_schema.has_key('tiling-mode') && this.ext.get_string('tiling-mode') !== valid) {
            this.ext.set_string('tiling-mode', valid);
        }
        const should_tile = valid !== 'otter';
        if (this.ext.get_boolean('tile-by-default') !== should_tile) {
            this.ext.set_boolean('tile-by-default', should_tile);
        }
    }

    set_tile_by_default(enable) {
        const b = Boolean(enable);
        if (this.ext.get_boolean('tile-by-default') !== b) {
            this.ext.set_boolean('tile-by-default', b);
        }
        if (this.ext.settings_schema.has_key('tiling-mode')) {
            const current = this.tiling_mode();
            const next = b ? (current === 'otter' ? 'octopus' : current) : 'otter';
            if (current !== next) this.ext.set_string('tiling-mode', next);
        }
    }

    active_hint_size() {
        return this.ext.settings_schema?.has_key('active-hint-size')
            ? this.ext.get_uint('active-hint-size')
            : 2;
    }

    set_active_hint_size(size) {
        if (this.ext.settings_schema?.has_key('active-hint-size')) {
            const v = Math.max(1, Math.min(16, Number(size) | 0));
            this.ext.set_uint('active-hint-size', v);
        }
    }

    focus_follows_mouse() {
        return this.wm ? this.wm.get_string('focus-mode') !== 'click' : false;
    }

    set_focus_follows_mouse(enable) {
        if (this.wm) this.wm.set_string('focus-mode', enable ? 'sloppy' : 'click');
    }

    is_high_contrast() {
        return this.int ? this.int.get_string(INTERFACE_KEY) === 'HighContrast' : false;
    }

    is_dark() {
        if (!this.int) return true;
        const theme = this.int.get_string(INTERFACE_KEY).toLowerCase();
        const color_scheme = this.int.settings_schema.has_key('color-scheme')
            ? this.int.get_string('color-scheme')
            : '';
        return theme.endsWith('dark') || theme.endsWith('inverse') || color_scheme === 'prefer-dark';
    }

    is_dark_shell() {
        return this.is_dark();
    }

    titlebar_uses_system_theme() {
        return this.wm ? this.wm.get_boolean(WM_PREFERENCES_KEY) : true;
    }

    workspaces_only_on_primary() {
        return this.mutter ? this.mutter.get_boolean(WORKSPACES_ONLY_ON_PRIMARY) : false;
    }

    hint_color_rgba() {
        const raw = this.ext.get_string('hint-color-rgba');
        return format_rgba(parse_rgba(raw));
    }

    set_hint_color_rgba(css_str) {
        this.ext.set_string('hint-color-rgba', format_rgba(parse_rgba(css_str)));
    }

    set_gap_inner(gap) {
        const v = Math.max(0, Number(gap) | 0);
        this.ext.set_uint('gap-inner', v);
    }

    set_gap_outer(gap) {
        const v = Math.max(0, Number(gap) | 0);
        this.ext.set_uint('gap-outer', v);
    }
}
