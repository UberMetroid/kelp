// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Severity-filtered structured logging (`LOG_LEVELS`, `error`, `warn`, `info`, `debug`)
//   routing messages to the GJS / systemd journal via `console.log()` / `console.error()`.
// - Zero-Trust Boundary & Invariants:
//   Process-agnostic pure JS module with zero `gi://` or `resource://` imports so both the
//   GNOME Shell compositor process (`extension.js`) and the GTK4 preferences process
//   (`prefs.js`) can import `LOG_LEVELS` safely. Performs zero string interpolation when a
//   log severity level is disabled, eliminating string allocation churn in hot tiling paths.

export const LOG_LEVELS = Object.freeze({
    OFF: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4,
});

// Mutable module-scoped severity threshold updated by `ExtensionSettings` or `KelpExtension`.
// Defaults to `ERROR` until configured by GSettings.
let current_log_level = LOG_LEVELS.ERROR;

/**
 * Sets the active runtime log severity threshold (`LOG_LEVELS.OFF` .. `LOG_LEVELS.DEBUG`).
 */
export function set_log_level(level) {
    if (typeof level === 'number' && level >= LOG_LEVELS.OFF && level <= LOG_LEVELS.DEBUG) {
        current_log_level = level;
    }
}

/**
 * Returns the active runtime log severity threshold.
 */
export function get_log_level() {
    return current_log_level;
}

export function error(text) {
    console.error(`[Kelp] [ERROR] ${text}`);
}

export function warn(text) {
    if (current_log_level >= LOG_LEVELS.WARN) {
        console.warn(`[Kelp] [WARN] ${text}`);
    }
}

export function info(text) {
    if (current_log_level >= LOG_LEVELS.INFO) {
        console.log(`[Kelp] [INFO] ${text}`);
    }
}

export function debug(text) {
    if (current_log_level >= LOG_LEVELS.DEBUG) {
        console.log(`[Kelp] [DEBUG] ${text}`);
    }
}
