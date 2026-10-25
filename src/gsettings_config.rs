// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   GSettings keybinding configurator (`configure_keybindings`), WM conflict clearer
//   (`WM_CONFLICTS`), and GNOME Shell extension activator (`enable_extension`).
// - Zero-Trust Boundary & Invariants:
//   Invokes `gsettings` and `gnome-extensions` via `std::process::Command` without a shell
//   interpreter (`sh -c`), preventing command injection across environment variables or paths.

use std::path::Path;
use std::process::Command;

use crate::embedded_assets::{EXTENSION_UUID, SCHEMA_ID};

const WM_KB: &str = "org.gnome.desktop.wm.keybindings";
const MEDIA_KB: &str = "org.gnome.settings-daemon.plugins.media-keys";
const SHELL_KB: &str = "org.gnome.shell.keybindings";

pub const WM_CONFLICTS: &[(&str, &str)] = &[
    (WM_KB, "minimize"),
    (WM_KB, "maximize"),
    (WM_KB, "unmaximize"),
    (WM_KB, "move-to-monitor-left"),
    (WM_KB, "move-to-monitor-right"),
    (WM_KB, "move-to-monitor-up"),
    (WM_KB, "move-to-monitor-down"),
    ("org.gnome.mutter.keybindings", "toggle-tiled-left"),
    ("org.gnome.mutter.keybindings", "toggle-tiled-right"),
    (SHELL_KB, "shift-overview-up"),
    (SHELL_KB, "shift-overview-down"),
];

pub const GSETTINGS_OVERRIDES: &[(&str, &str, &str)] = &[
    ("org.gnome.shell", "always-show-log-out", "true"),
    ("org.gnome.mutter", "edge-tiling", "false"),
    ("org.gnome.mutter", "workspaces-only-on-primary", "false"),
    (WM_KB, "close", "['<Super>q', '<Alt>F4']"),
    (WM_KB, "toggle-maximized", "['<Super>m']"),
    (
        WM_KB,
        "switch-to-workspace-left",
        "['<Super><Alt>Left', '<Super><Alt>h']",
    ),
    (
        WM_KB,
        "switch-to-workspace-right",
        "['<Super><Alt>Right', '<Super><Alt>l']",
    ),
    (
        WM_KB,
        "switch-to-workspace-up",
        "['<Super><Alt>Up', '<Super><Alt>k']",
    ),
    (
        WM_KB,
        "switch-to-workspace-down",
        "['<Super><Alt>Down', '<Super><Alt>j']",
    ),
    (
        WM_KB,
        "move-to-workspace-left",
        "['<Super><Alt><Shift>Left', '<Super><Alt><Shift>h']",
    ),
    (
        WM_KB,
        "move-to-workspace-right",
        "['<Super><Alt><Shift>Right', '<Super><Alt><Shift>l']",
    ),
    (
        WM_KB,
        "move-to-workspace-up",
        "['<Super><Alt><Shift>Up', '<Super><Alt><Shift>k']",
    ),
    (
        WM_KB,
        "move-to-workspace-down",
        "['<Super><Alt><Shift>Down', '<Super><Alt><Shift>j']",
    ),
    (MEDIA_KB, "www", "['<Super>b']"),
    (MEDIA_KB, "home", "['<Super>f']"),
    (MEDIA_KB, "email", "['<Super>e']"),
    (MEDIA_KB, "screensaver", "['<Super>Escape']"),
    (SHELL_KB, "toggle-message-tray", "['<Super>v']"),
    (SHELL_KB, "toggle-quick-settings", "['<Super><Control>s']"),
    (SCHEMA_ID, "tile-by-default", "true"),
    (SCHEMA_ID, "tiling-mode", "'octopus'"),
    (SCHEMA_ID, "enable-shortcuts", "true"),
    (SCHEMA_ID, "active-hint", "true"),
    (SCHEMA_ID, "active-hint-border-radius", "2"),
    (SCHEMA_ID, "hint-color-rgba", "'rgb(255,0,0)'"),
    (SCHEMA_ID, "smart-gaps", "false"),
    (SCHEMA_ID, "show-title", "false"),
    (SCHEMA_ID, "gap-inner", "6"),
    (SCHEMA_ID, "gap-outer", "6"),
    (SCHEMA_ID, "log-level", "0"),
    (SCHEMA_ID, "mouse-cursor-follows-active-window", "false"),
];

pub const KEYBINDINGS: &[(&str, &str)] = &[
    (
        "focus-left",
        "['<Super>Left', '<Super>KP_Left', '<Super>h']",
    ),
    (
        "focus-down",
        "['<Super>Down', '<Super>KP_Down', '<Super>j']",
    ),
    ("focus-up", "['<Super>Up', '<Super>KP_Up', '<Super>k']"),
    (
        "focus-right",
        "['<Super>Right', '<Super>KP_Right', '<Super>l']",
    ),
    ("tile-enter", "['<Super>Return', '<Super>KP_Enter']"),
    ("tile-accept", "['Return', 'KP_Enter']"),
    ("tile-reject", "['Escape']"),
    ("toggle-tiling", "['<Super>y']"),
    ("toggle-floating", "['<Super>g']"),
    ("tile-orientation", "['<Super>o']"),
    ("toggle-stacking-global", "['<Super>s']"),
    (
        "tile-move-left-global",
        "['<Primary><Super>Left', '<Primary><Super>KP_Left', '<Primary><Super>h', '<Super><Shift>Left', '<Super><Shift>KP_Left', '<Super><Shift>h']",
    ),
    (
        "tile-move-down-global",
        "['<Primary><Super>Down', '<Primary><Super>KP_Down', '<Primary><Super>j', '<Super><Shift>Down', '<Super><Shift>KP_Down', '<Super><Shift>j']",
    ),
    (
        "tile-move-up-global",
        "['<Primary><Super>Up', '<Primary><Super>KP_Up', '<Primary><Super>k', '<Super><Shift>Up', '<Super><Shift>KP_Up', '<Super><Shift>k']",
    ),
    (
        "tile-move-right-global",
        "['<Primary><Super>Right', '<Primary><Super>KP_Right', '<Primary><Super>l', '<Super><Shift>Right', '<Super><Shift>KP_Right', '<Super><Shift>l']",
    ),
    (
        "kelp-workspace-down",
        "['<Super><Shift>Page_Down', '<Super><Shift><Alt>Down', '<Super><Shift><Alt>j']",
    ),
    (
        "kelp-workspace-up",
        "['<Super><Shift>Page_Up', '<Super><Shift><Alt>Up', '<Super><Shift><Alt>k']",
    ),
    (
        "kelp-monitor-left",
        "['<Super><Shift><Primary>Left', '<Super><Shift><Primary>KP_Left', '<Super><Shift><Primary>h']",
    ),
    (
        "kelp-monitor-right",
        "['<Super><Shift><Primary>Right', '<Super><Shift><Primary>KP_Right', '<Super><Shift><Primary>l']",
    ),
    (
        "kelp-monitor-up",
        "['<Super><Shift><Primary>Up', '<Super><Shift><Primary>KP_Up', '<Super><Shift><Primary>k']",
    ),
    (
        "kelp-monitor-down",
        "['<Super><Shift><Primary>Down', '<Super><Shift><Primary>KP_Down', '<Super><Shift><Primary>j']",
    ),
];

pub const LEGACY_DCONF_KEYS: &[&str] = &[
    "/org/gnome/shell/extensions/kelp/pop-monitor-down",
    "/org/gnome/shell/extensions/kelp/pop-monitor-left",
    "/org/gnome/shell/extensions/kelp/pop-monitor-right",
    "/org/gnome/shell/extensions/kelp/pop-monitor-up",
    "/org/gnome/shell/extensions/kelp/pop-workspace-down",
    "/org/gnome/shell/extensions/kelp/pop-workspace-up",
];

fn gsettings_set(schema_dir: &Path, schema: &str, key: &str, value: &str) {
    let _ = Command::new("gsettings")
        .args([
            "--schemadir",
            &schema_dir.display().to_string(),
            "set",
            schema,
            key,
            value,
        ])
        .status();
}

/// Applies WM conflict overrides and default Kelp keybindings in `gsettings`,
/// and purges deprecated `pop-*` dconf keys from the extension's dconf subtree.
///
/// # Errors
///
/// Returns `Ok(())` even if `gsettings` or `dconf` is unavailable in a headless build container.
pub fn configure_keybindings(ext_schema_dir: &Path) -> Result<(), String> {
    println!("  -> Configuring GNOME keybindings and tiling settings...");
    for &(schema, key) in WM_CONFLICTS {
        gsettings_set(ext_schema_dir, schema, key, "[]");
    }
    for &(schema, key, val) in GSETTINGS_OVERRIDES {
        gsettings_set(ext_schema_dir, schema, key, val);
    }
    for &(key, val) in KEYBINDINGS {
        gsettings_set(ext_schema_dir, SCHEMA_ID, key, val);
    }
    for &dconf_key in LEGACY_DCONF_KEYS {
        let _ = Command::new("dconf").args(["reset", dconf_key]).status();
    }
    Ok(())
}

/// Disables legacy `pop-shell@system76.com` if present and enables `kelp@ubermetroid.github.io`.
pub fn enable_extension() {
    println!("  -> Enabling {EXTENSION_UUID}...");
    let _ = Command::new("gnome-extensions")
        .args(["disable", "pop-shell@system76.com"])
        .status();
    let _ = Command::new("gnome-extensions")
        .args(["enable", EXTENSION_UUID])
        .status();
}
