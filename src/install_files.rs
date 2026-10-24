use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::embedded_assets::{
    EMBEDDED_CONFIG_JSON, EMBEDDED_EXTENSION_FILES, EMBEDDED_KEYBINDINGS, EMBEDDED_SCHEMA_XML,
    EXTENSION_UUID, SCHEMA_FILENAME,
};

const REMOVED_LEGACY_FILES: &[&str] = &[
    "launcher.js",
    "launcher_service.js",
    "search.js",
    "context.js",
    "scheduler.js",
    "xprop.js",
    "dbus_service.js",
    "once_cell.js",
    "paths.js",
    "shell.js",
    "shortcut_overlay.js",
    "schemas/org.gnome.shell.extensions.pop-shell.gschema.xml",
];

const REMOVED_LEGACY_DIRS: &[&str] = &["color_dialog", "floating_exceptions"];

/// Writes the embedded extension files into `dest_dir`, removes any legacy files,
/// and compiles GSettings schemas if `glib-compile-schemas` is available.
pub fn install_extension_tree(dest_dir: &Path, dry_run: bool) -> Result<(), String> {
    if dry_run {
        println!(
            "[dry-run] Would write {} hardened extension files to {}",
            EMBEDDED_EXTENSION_FILES.len(),
            dest_dir.display()
        );
        return Ok(());
    }

    if dest_dir.exists() {
        for stale_file in REMOVED_LEGACY_FILES {
            let p = dest_dir.join(stale_file);
            if p.exists() {
                let _ = fs::remove_file(p);
            }
        }
        for stale_dir in REMOVED_LEGACY_DIRS {
            let p = dest_dir.join(stale_dir);
            if p.exists() {
                let _ = fs::remove_dir_all(p);
            }
        }
    }

    for (rel_path, bytes) in EMBEDDED_EXTENSION_FILES {
        let full_path = dest_dir.join(rel_path);
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory {}: {e}", parent.display()))?;
        }
        fs::write(&full_path, bytes)
            .map_err(|e| format!("Failed to write {}: {e}", full_path.display()))?;
    }

    let schemas_dir = dest_dir.join("schemas");
    if schemas_dir.exists() {
        let _ = Command::new("glib-compile-schemas")
            .arg(&schemas_dir)
            .status();
    }

    Ok(())
}

/// Writes the default floating window exceptions `config.json` to `~/.config/kelp/config.json`.
pub fn install_config_json(home_dir: &Path, dry_run: bool) -> Result<PathBuf, String> {
    let config_path = home_dir.join(".config/kelp/config.json");
    if dry_run {
        println!("[dry-run] Would write {}", config_path.display());
        return Ok(config_path);
    }
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }
    fs::write(&config_path, EMBEDDED_CONFIG_JSON)
        .map_err(|e| format!("Failed to write {}: {e}", config_path.display()))?;
    Ok(config_path)
}

fn is_root() -> bool {
    Command::new("id")
        .arg("-u")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim() == "0")
        .unwrap_or(false)
}

/// Installs the extension, GSettings schema, and keybinding definitions into `/usr/share`.
/// If not running as root, re-executes the current binary directly via `run0` (without `sh -c`).
pub fn install_system_wide(dry_run: bool) -> Result<(), String> {
    let sys_ext_dir = Path::new("/usr/share/gnome-shell/extensions").join(EXTENSION_UUID);
    let sys_schema_dir = Path::new("/usr/share/glib-2.0/schemas");
    let sys_keybindings_dir = Path::new("/usr/share/gnome-control-center/keybindings");

    if dry_run {
        println!(
            "[dry-run] Would install extension system-wide to {}",
            sys_ext_dir.display()
        );
        println!(
            "[dry-run] Would install schema to {}/{SCHEMA_FILENAME}",
            sys_schema_dir.display()
        );
        println!(
            "[dry-run] Would install keybinding XMLs to {}",
            sys_keybindings_dir.display()
        );
        return Ok(());
    }

    if is_root() {
        let legacy_sys_dir = Path::new("/usr/share/gnome-shell/extensions")
            .join(crate::embedded_assets::LEGACY_UUID);
        if legacy_sys_dir.exists() {
            let _ = fs::remove_dir_all(&legacy_sys_dir);
        }
        install_extension_tree(&sys_ext_dir, false)?;
        if sys_schema_dir.exists() {
            let legacy_schema =
                sys_schema_dir.join("org.gnome.shell.extensions.pop-shell.gschema.xml");
            if legacy_schema.exists() {
                let _ = fs::remove_file(&legacy_schema);
            }
            let schema_path = sys_schema_dir.join(SCHEMA_FILENAME);
            fs::write(&schema_path, EMBEDDED_SCHEMA_XML)
                .map_err(|e| format!("Failed to write {}: {e}", schema_path.display()))?;
            let _ = Command::new("glib-compile-schemas")
                .arg(sys_schema_dir)
                .status();
        }
        if sys_keybindings_dir.exists() {
            for legacy_kb in [
                "10-pop-shell-move.xml",
                "10-pop-shell-navigate.xml",
                "10-pop-shell-tile.xml",
            ] {
                let p = sys_keybindings_dir.join(legacy_kb);
                if p.exists() {
                    let _ = fs::remove_file(p);
                }
            }
            for (name, bytes) in EMBEDDED_KEYBINDINGS {
                let kb_path = sys_keybindings_dir.join(name);
                fs::write(&kb_path, bytes)
                    .map_err(|e| format!("Failed to write {}: {e}", kb_path.display()))?;
            }
        }
        Ok(())
    } else {
        let exe = env::current_exe()
            .map_err(|e| format!("Failed to determine current executable path: {e}"))?;
        println!("==> Elevating via run0 to install into /usr/share...");
        let status = Command::new("run0")
            .arg(&exe)
            .args(["--system", "--skip-gsettings"])
            .status()
            .map_err(|e| format!("Failed to execute run0: {e}"))?;
        if !status.success() {
            return Err("run0 failed to install system-wide extension files".to_string());
        }
        Ok(())
    }
}
