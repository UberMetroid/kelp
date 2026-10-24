use std::fs;
use std::path::Path;
use std::process::Command;

use crate::embedded_assets::{EXTENSION_UUID, LEGACY_UUID, SCHEMA_ID};

/// Constructs the list of `gsettings` commands for Hyprland-style tiling and workspace navigation.
pub fn gsettings_commands(schema_dir: Option<&Path>) -> Vec<Vec<String>> {
    let mut cmds = Vec::new();
    let mut add = |schema: &str, key: &str, val: &str, needs_ext_schema: bool| {
        let mut cmd = vec!["gsettings".to_string()];
        if needs_ext_schema {
            if let Some(dir) = schema_dir {
                cmd.push("--schemadir".to_string());
                cmd.push(dir.to_string_lossy().into_owned());
            }
        }
        cmd.extend([
            "set".to_string(),
            schema.to_string(),
            key.to_string(),
            val.to_string(),
        ]);
        cmds.push(cmd);
    };

    for (s, k, v) in [
        ("org.gnome.mutter", "auto-maximize", "false"),
        ("org.gnome.mutter", "edge-tiling", "false"),
        ("org.gnome.mutter.keybindings", "toggle-tiled-left", "[]"),
        ("org.gnome.mutter.keybindings", "toggle-tiled-right", "[]"),
        ("org.gnome.desktop.wm.preferences", "focus-mode", "'click'"),
        (
            "org.gnome.shell.keybindings",
            "toggle-quick-settings",
            "['<Super><Control>s']",
        ),
    ] {
        add(s, k, v, false);
    }

    for (k, v) in [
        ("mouse-cursor-follows-active-window", "false"),
        ("tile-by-default", "true"),
        ("active-hint", "true"),
        ("active-hint-border-radius", "2"),
        ("hint-color-rgba", "'rgb(255,0,0)'"),
        ("gap-inner", "2"),
        ("gap-outer", "2"),
        ("smart-gaps", "false"),
        ("show-title", "false"),
        ("log-level", "0"),
        (
            "tile-move-left-global",
            "['<Primary><Super>Left', '<Primary><Super>KP_Left', '<Primary><Super>h', '<Super><Shift>Left', '<Super><Shift>KP_Left', '<Super><Shift>h']",
        ),
        (
            "tile-move-right-global",
            "['<Primary><Super>Right', '<Primary><Super>KP_Right', '<Primary><Super>l', '<Super><Shift>Right', '<Super><Shift>KP_Right', '<Super><Shift>l']",
        ),
        (
            "tile-move-up-global",
            "['<Primary><Super>Up', '<Primary><Super>KP_Up', '<Primary><Super>k', '<Super><Shift>Up', '<Super><Shift>KP_Up', '<Super><Shift>k']",
        ),
        (
            "tile-move-down-global",
            "['<Primary><Super>Down', '<Primary><Super>KP_Down', '<Primary><Super>j', '<Super><Shift>Down', '<Super><Shift>KP_Down', '<Super><Shift>j']",
        ),
        (
            "pop-monitor-left",
            "['<Super><Shift><Primary>Left', '<Super><Shift><Primary>KP_Left', '<Super><Shift><Primary>h']",
        ),
        (
            "pop-monitor-right",
            "['<Super><Shift><Primary>Right', '<Super><Shift><Primary>KP_Right', '<Super><Shift><Primary>l']",
        ),
        (
            "pop-monitor-up",
            "['<Super><Shift><Primary>Up', '<Super><Shift><Primary>KP_Up', '<Super><Shift><Primary>k']",
        ),
        (
            "pop-monitor-down",
            "['<Super><Shift><Primary>Down', '<Super><Shift><Primary>KP_Down', '<Super><Shift><Primary>j']",
        ),
        (
            "pop-workspace-up",
            "['<Super><Shift>Page_Up', '<Super><Shift><Alt>Up', '<Super><Shift><Alt>k']",
        ),
        (
            "pop-workspace-down",
            "['<Super><Shift>Page_Down', '<Super><Shift><Alt>Down', '<Super><Shift><Alt>j']",
        ),
    ] {
        add(SCHEMA_ID, k, v, true);
    }

    let wm_keys = "org.gnome.desktop.wm.keybindings";
    for i in 1..=9 {
        add(
            wm_keys,
            &format!("switch-to-workspace-{i}"),
            &format!("['<Super>{i}']"),
            false,
        );
        add(
            wm_keys,
            &format!("move-to-workspace-{i}"),
            &format!("['<Super><Shift>{i}']"),
            false,
        );
    }
    for (k, v) in [
        ("switch-to-workspace-10", "['<Super>0']"),
        ("move-to-workspace-10", "['<Super><Shift>0']"),
        (
            "switch-to-workspace-left",
            "['<Super><Alt>Left', '<Super><Alt>h']",
        ),
        (
            "switch-to-workspace-right",
            "['<Super><Alt>Right', '<Super><Alt>l']",
        ),
        (
            "switch-to-workspace-up",
            "['<Super><Alt>Up', '<Super><Alt>k']",
        ),
        (
            "switch-to-workspace-down",
            "['<Super><Alt>Down', '<Super><Alt>j']",
        ),
        (
            "move-to-workspace-left",
            "['<Super><Alt><Shift>Left', '<Super><Alt><Shift>h']",
        ),
        (
            "move-to-workspace-right",
            "['<Super><Alt><Shift>Right', '<Super><Alt><Shift>l']",
        ),
    ] {
        add(wm_keys, k, v, false);
    }

    cmds
}

fn ensure_enabled_in_shell_gsettings() {
    let Ok(out) = Command::new("gsettings")
        .args(["get", "org.gnome.shell", "enabled-extensions"])
        .output()
    else {
        return;
    };
    let current = String::from_utf8_lossy(&out.stdout);
    let mut items: Vec<String> = current
        .split('\'')
        .enumerate()
        .filter_map(|(i, s)| {
            if i % 2 == 1 {
                Some(s.to_string())
            } else {
                None
            }
        })
        .filter(|u| u != LEGACY_UUID)
        .collect();
    if !items.iter().any(|u| u == EXTENSION_UUID) {
        items.push(EXTENSION_UUID.to_string());
    }
    let quoted: Vec<String> = items.iter().map(|u| format!("'{u}'")).collect();
    let val = format!("[{}]", quoted.join(", "));
    let _ = Command::new("gsettings")
        .args(["set", "org.gnome.shell", "enabled-extensions", &val])
        .status();
}

/// Applies all `gsettings` commands, disables any conflicting legacy `pop-shell@system76.com`
/// extension, and enables `kelp@ubermetroid.github.io`.
pub fn apply_gsettings_and_enable(
    schema_dir: Option<&Path>,
    home_dir: &Path,
    dry_run: bool,
) -> Result<(), String> {
    println!("==> Applying Hyprland-style GNOME & Kelp gsettings...");
    for cmd in gsettings_commands(schema_dir) {
        if dry_run {
            println!("[dry-run] {}", cmd.join(" "));
        } else {
            let status = Command::new(&cmd[0])
                .args(&cmd[1..])
                .status()
                .map_err(|e| format!("Failed to execute {}: {e}", cmd[0]))?;
            if !status.success() {
                return Err(format!("Command failed: {}", cmd.join(" ")));
            }
        }
    }

    if dry_run {
        println!("[dry-run] gnome-extensions disable {LEGACY_UUID}");
        println!("[dry-run] gnome-extensions enable {EXTENSION_UUID}");
    } else {
        let _ = Command::new("gnome-extensions")
            .args(["disable", LEGACY_UUID])
            .status();
        let legacy_user_dir = home_dir
            .join(".local/share/gnome-shell/extensions")
            .join(LEGACY_UUID);
        if legacy_user_dir.exists() {
            let _ = fs::remove_dir_all(&legacy_user_dir);
        }
        println!("==> Enabling {EXTENSION_UUID}...");
        ensure_enabled_in_shell_gsettings();
        let _ = Command::new("gnome-extensions")
            .args(["enable", EXTENSION_UUID])
            .status();
    }

    Ok(())
}
