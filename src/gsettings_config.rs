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

pub const WM_CONFLICTS: &[(&str, &str)] = &[
    ("org.gnome.desktop.wm.keybindings", "minimize"),
    ("org.gnome.desktop.wm.keybindings", "maximize"),
    ("org.gnome.desktop.wm.keybindings", "unmaximize"),
    (
        "org.gnome.desktop.wm.keybindings",
        "switch-to-workspace-left",
    ),
    (
        "org.gnome.desktop.wm.keybindings",
        "switch-to-workspace-right",
    ),
    ("org.gnome.desktop.wm.keybindings", "switch-to-workspace-up"),
    (
        "org.gnome.desktop.wm.keybindings",
        "switch-to-workspace-down",
    ),
    ("org.gnome.desktop.wm.keybindings", "move-to-workspace-left"),
    (
        "org.gnome.desktop.wm.keybindings",
        "move-to-workspace-right",
    ),
    ("org.gnome.desktop.wm.keybindings", "move-to-workspace-up"),
    ("org.gnome.desktop.wm.keybindings", "move-to-workspace-down"),
    ("org.gnome.desktop.wm.keybindings", "move-to-monitor-left"),
    ("org.gnome.desktop.wm.keybindings", "move-to-monitor-right"),
    ("org.gnome.desktop.wm.keybindings", "move-to-monitor-up"),
    ("org.gnome.desktop.wm.keybindings", "move-to-monitor-down"),
    ("org.gnome.mutter.keybindings", "toggle-tiled-left"),
    ("org.gnome.mutter.keybindings", "toggle-tiled-right"),
];

pub const GSETTINGS_OVERRIDES: &[(&str, &str, &str)] = &[
    ("org.gnome.mutter", "edge-tiling", "false"),
    ("org.gnome.mutter", "workspaces-only-on-primary", "false"),
    (SCHEMA_ID, "tile-by-default", "true"),
    (SCHEMA_ID, "active-hint", "true"),
    (SCHEMA_ID, "smart-gaps", "true"),
    (SCHEMA_ID, "gap-inner", "2"),
    (SCHEMA_ID, "gap-outer", "2"),
];

pub const KEYBINDINGS: &[(&str, &str)] = &[
    ("focus-left", "['<Super>Left', '<Super>h']"),
    ("focus-down", "['<Super>Down', '<Super>j']"),
    ("focus-up", "['<Super>Up', '<Super>k']"),
    ("focus-right", "['<Super>Right', '<Super>l']"),
    ("tile-enter", "['<Super>Return']"),
    ("tile-accept", "['Return']"),
    ("tile-reject", "['Escape']"),
    ("toggle-tiling", "['<Super>y']"),
    ("toggle-floating", "['<Super>g']"),
    ("tile-orientation", "['<Super>o']"),
    ("toggle-stacking-global", "['<Super>s']"),
    (
        "pop-workspace-down",
        "['<Super><Control>Down', '<Super><Control>j']",
    ),
    (
        "pop-workspace-up",
        "['<Super><Control>Up', '<Super><Control>k']",
    ),
    (
        "pop-monitor-left",
        "['<Super><Shift>Left', '<Super><Shift>h']",
    ),
    (
        "pop-monitor-right",
        "['<Super><Shift>Right', '<Super><Shift>l']",
    ),
    ("pop-monitor-up", "['<Super><Shift>Up', '<Super><Shift>k']"),
    (
        "pop-monitor-down",
        "['<Super><Shift>Down', '<Super><Shift>j']",
    ),
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

/// Applies WM conflict overrides and default Kelp keybindings in `gsettings`.
///
/// # Errors
///
/// Returns `Ok(())` even if `gsettings` is unavailable in a headless build container.
pub fn configure_keybindings(ext_schema_dir: &Path) -> Result<(), String> {
    println!("  -> Configuring GNOME keybindings and tiling settings...");
    for &(schema, key) in WM_CONFLICTS {
        gsettings_set(ext_schema_dir, schema, key, "['']");
    }
    for &(schema, key, val) in GSETTINGS_OVERRIDES {
        gsettings_set(ext_schema_dir, schema, key, val);
    }
    for &(key, val) in KEYBINDINGS {
        gsettings_set(ext_schema_dir, SCHEMA_ID, key, val);
    }
    Ok(())
}

/// Enables `kelp@ubermetroid.github.io` via `gnome-extensions enable`.
pub fn enable_extension() {
    println!("  -> Enabling {EXTENSION_UUID}...");
    let _ = Command::new("gnome-extensions")
        .args(["enable", EXTENSION_UUID])
        .status();
}
