// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   User-configurable and built-in floating window exception matcher (`Config`, `DEFAULT_RULES`)
//   storing per-WM_CLASS / per-title float overrides at `~/.config/kelp/config.json`.
// - Zero-Trust Boundary & Invariants:
//   Enforces OWASP input size cap (`MAX_CONFIG_BYTES = 65536`) before parsing JSON from disk,
//   validates every rule element's schema (`class` and `title` strings, bounded rule count),
//   and catches regex syntax errors so a malformed user rule can never crash GNOME Shell.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { Ok, Err } from '../../engine/ecs/events.js';
import * as log from './log.js';

const CONF_DIR = `${GLib.get_user_config_dir()}/kelp`;
const CONF_FILE = `${CONF_DIR}/config.json`;
const MAX_CONFIG_BYTES = 65536;
const MAX_RULE_COUNT = 512;

export const DEFAULT_RULES = Object.freeze([
    { class: 'Arandr' },
    { class: 'Bitwarden' },
    { class: 'Blueman-manager' },
    { class: 'Enpass' },
    { class: 'File-roller' },
    { class: 'Firstrun' },
    { class: 'Gdm-settings' },
    { class: 'Gnome-abrt' },
    { class: 'Gnome-calculator' },
    { class: 'Gnome-calendar' },
    { class: 'Gnome-characters' },
    { class: 'Gnome-clocks' },
    { class: 'Gnome-Custom-Shortcut-Dialog' },
    { class: 'Gnome-disks' },
    { class: 'Gnome-font-viewer' },
    { class: 'Gnome-initial-setup' },
    { class: 'Gnome-logs' },
    { class: 'Gnome-network-displays' },
    { class: 'Gnome-power-statistics' },
    { class: 'Gnome-screenshot' },
    { class: 'Gnome-session-properties' },
    { class: 'Gnome-Shell-Extension-Prefs' },
    { class: 'Gnome-software' },
    { class: 'Gnome-system-monitor' },
    { class: 'Gnome-terminal', title: 'Preferences – General' },
    { class: 'Gnome-tweaks' },
    { class: 'Gucharmap' },
    { class: 'Io.elementary.sideload' },
    { class: 'KotatogramDesktop', title: 'Media viewer' },
    { class: 'KeePassXC' },
    { class: 'Lutris' },
    { class: 'Nm-connection-editor' },
    { class: 'org.gnome.Calculator' },
    { class: 'org.gnome.Calendar' },
    { class: 'org.gnome.Characters' },
    { class: 'org.gnome.Clocks' },
    { class: 'org.gnome.FileRoller' },
    { class: 'org.gnome.FontViewer' },
    { class: 'org.gnome.Loupe' },
    { class: 'org.gnome.NautilusPreviewer' },
    { class: 'org.gnome.Screenshot' },
    { class: 'org.gnome.Settings' },
    { class: 'org.gnome.Shell.Extensions' },
    { class: 'org.gnome.Snapshot' },
    { class: 'org.gnome.SystemMonitor' },
    { class: 'org.gnome.Tweaks' },
    { class: 'org.gnome.Weather' },
    { class: 'Pavucontrol' },
    { class: 'Pinentry' },
    { class: 'Polkit-gnome-authentication-agent-1' },
    { class: ' ProtonUp-Qt' },
    { class: ' Seahorse' },
    { class: 'Signal', title: '^$' },
    { class: ' Simple-scan' },
    { class: 'Solaar' },
    { class: 'Spotify', title: 'Spotify Free' },
    { class: 'Steam', title: '^(?!Steam$).*$' },
    { class: 'System-config-printer' },
    { class: 'TelegramDesktop', title: 'Media viewer' },
    { class: 'Totem' },
    { class: 'Transmission-gtk' },
    { class: 'Update-manager' },
    { class: 'VirtualBox Manager' },
    { class: 'Wine' },
    { class: 'Winetricks' },
    { class: 'Xdg-desktop-portal-gtk' },
    { class: 'Zenity' },
    { title: '^.*(Bitwarden|KeePassXC).*Password.*$' },
    { title: '^(?:Open|Save|Select|Choose) (?:File|Folder|Directory|Image|As).*$' },
    { title: '^Picture-in-Picture$' },
]);

function safe_regex_match(pattern, target) {
    if (typeof pattern !== 'string' || typeof target !== 'string') return false;
    if (pattern === target) return true;
    try {
        return new RegExp(pattern, 'i').test(target);
    } catch (_e) {
        return false;
    }
}

function rule_matches(rule, wm_class, wm_title) {
    if (!rule || typeof rule !== 'object') return false;
    const has_class = typeof rule.class === 'string' && rule.class.length > 0;
    const has_title = typeof rule.title === 'string' && rule.title.length > 0;
    if (!has_class && !has_title) return false;
    if (has_class && !safe_regex_match(rule.class.trim(), wm_class)) return false;
    if (has_title && !safe_regex_match(rule.title, wm_title)) return false;
    return true;
}

export class Config {
    constructor() {
        this.float = [];
        this.log_on_Change = false;
    }

    add_app_exception(wm_class) {
        if (!wm_class) return;
        for (const r of this.float) {
            if (r.class === wm_class && r.title === undefined) return;
        }
        this.float.push({ class: String(wm_class), disabled: false });
        this.sync_to_disk();
    }

    add_window_exception(wm_class, wm_title) {
        if (!wm_class || !wm_title) return;
        for (const r of this.float) {
            if (r.class === wm_class && r.title === wm_title) return;
        }
        this.float.push({ class: String(wm_class), title: String(wm_title), disabled: false });
        this.sync_to_disk();
    }

    window_shall_float(wm_class, wm_title) {
        const cls = String(wm_class ?? '');
        const title = String(wm_title ?? '');
        for (const rule of this.float) {
            if (rule_matches(rule, cls, title)) {
                return !rule.disabled;
            }
        }
        for (const rule of DEFAULT_RULES) {
            if (rule_matches(rule, cls, title)) {
                return true;
            }
        }
        return false;
    }

    rule_disabled(rule) {
        for (const value of this.float.values()) {
            if (value.disabled && rule.class === value.class && rule.title === value.title) {
                return true;
            }
        }
        return false;
    }

    toggle_system_exception(wm_class, wm_title, disabled) {
        if (disabled) {
            for (const value of this.float.values()) {
                if (value.class === wm_class && value.title === wm_title) {
                    value.disabled = disabled;
                    this.sync_to_disk();
                    return;
                }
            }
            this.float.push({ class: wm_class, title: wm_title, disabled });
            this.sync_to_disk();
            return;
        }
        const filtered = this.float.filter((v) => !(v.class === wm_class && v.title === wm_title));
        this.float = filtered;
        this.sync_to_disk();
    }

    remove_user_exception(wm_class, wm_title) {
        this.float = this.float.filter((v) => !(v.class === wm_class && v.title === wm_title));
        this.sync_to_disk();
    }

    to_json() {
        return JSON.stringify({ float: this.float, log_on_Change: this.log_on_Change }, null, 2);
    }

    static from_json(json) {
        try {
            const c = Object.assign(new Config(), JSON.parse(json));
            if (!Array.isArray(c.float)) {
                c.float = [];
            } else {
                c.float = c.float
                    .slice(0, MAX_RULE_COUNT)
                    .filter((r) => r && typeof r === 'object' &&
                        (typeof r.class === 'string' || typeof r.title === 'string'));
            }
            return Ok(c);
        } catch (error) {
            return Err(`failed to parse config JSON: ${error}`);
        }
    }

    static from_config() {
        const res = Config.read();
        if (res.kind === 1) {
            return Config.from_json(res.value);
        }
        return Err(res.value);
    }

    static read() {
        try {
            if (!GLib.file_test(CONF_FILE, GLib.FileTest.EXISTS)) {
                return Err('config.json not found');
            }
            const file = Gio.File.new_for_path(CONF_FILE);
            const info = file.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null);
            if (info.get_size() > MAX_CONFIG_BYTES) {
                return Err(`config.json exceeds maximum allowed size (${MAX_CONFIG_BYTES} bytes)`);
            }
            const [ok, data] = file.load_contents(null);
            if (ok) {
                return Ok(new TextDecoder().decode(data));
            }
            return Err('failed to read config.json');
        } catch (e) {
            return Err(`error reading config.json: ${e}`);
        }
    }

    reload() {
        const conf = Config.from_config();
        if (conf.kind === 1) {
            this.float = conf.value.float;
            this.log_on_Change = Boolean(conf.value.log_on_Change);
        } else {
            log.debug(`config reload skipped: ${conf.value}`);
        }
    }

    sync_to_disk() {
        try {
            GLib.mkdir_with_parents(CONF_DIR, 0o700);
            const file = Gio.File.new_for_path(CONF_FILE);
            const raw = new TextEncoder().encode(this.to_json());
            file.replace_contents(raw, null, false, Gio.FileCreateFlags.NONE, null);
        } catch (e) {
            log.error(`failed to write config.json: ${e}`);
        }
    }
}
