// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Typed wrapper (`ExtensionSettings`) around `org.gnome.shell.extensions.kelp` and
//   desktop/mutter GSettings schemas for both GNOME Shell (`extension.js`) and GTK4 (`prefs.js`).
// - Zero-Trust Boundary & Invariants:
//   Imports ONLY `gi://Gio` (process-agnostic) and never imports `gi://Meta`, `gi://St`, or
//   `resource:///org/gnome/shell/*`. Probes external system schemas (`interface`, `wm.preferences`,
//   `mutter`) defensively via `SettingsSchemaSource` before instantiating `Gio.Settings`.

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
    'fullscreen-launcher',
    'gap-inner-even',
    'gap-outer-even',
    'mouse-cursor-follows-active-window',
    'show-skip-taskbar',
    'show-title',
    'smart-gaps',
    'snap-to-grid',
    'tile-by-default',
]);

const UINT_KEYS = Object.freeze([
    'active-hint-border-radius',
    'active-hint-size',
    'column-size',
    'gap-inner',
    'gap-inner-horizontal',
    'gap-inner-vertical',
    'gap-outer',
    'gap-outer-horizontal',
    'gap-outer-vertical',
    'log-level',
    'mouse-cursor-focus-location',
    'row-size',
    'stacking-with-mouse',
]);

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
        return this.mutter ? this.mutter.get_boolean(WORKSPACES_ONLY_ON_PRIMARY) : true;
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
        this.ext.set_uint('gap-inner-horizontal', v);
        this.ext.set_uint('gap-inner-vertical', v);
    }

    set_gap_outer(gap) {
        const v = Math.max(0, Number(gap) | 0);
        this.ext.set_uint('gap-outer', v);
        this.ext.set_uint('gap-outer-horizontal', v);
        this.ext.set_uint('gap-outer-vertical', v);
    }
}
