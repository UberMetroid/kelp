// SPDX-License-Identifier: GPL-3.0-or-later
// Extension tree extractor, legacy flat-file cleaner, and GSettings schema compiler.

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

use crate::default_rules::{validate_config_json, DEFAULT_CONFIG_JSON};
use crate::embedded_assets::{
    EXTENSION_FILES, ICON_FILES, KEYBINDING_FILES, LEGACY_DIRS, LEGACY_FLAT_FILES,
    LEGACY_KEYBINDING_FILES, SCHEMA_FILENAME, SCHEMA_XML,
};

fn write_verified_rel_path(base_dir: &Path, rel_path: &str, contents: &str) -> Result<(), String> {
    let rel = Path::new(rel_path);
    for comp in rel.components() {
        if matches!(
            comp,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        ) {
            return Err(format!("refusing unsafe relative asset path: {rel_path}"));
        }
    }
    let full_path = base_dir.join(rel);
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create directory {}: {e}", parent.display()))?;
    }
    fs::write(&full_path, contents)
        .map_err(|e| format!("failed to write {}: {e}", full_path.display()))
}

fn purge_legacy_flat_files(ext_dir: &Path) {
    for &legacy in LEGACY_FLAT_FILES {
        let candidate = ext_dir.join(legacy);
        if candidate.is_file() {
            let _ = fs::remove_file(candidate);
        }
    }
    for &legacy_dir in LEGACY_DIRS {
        let candidate = ext_dir.join(legacy_dir);
        if candidate.is_dir() {
            let _ = fs::remove_dir_all(candidate);
        }
    }
}

/// Extracts all embedded extension `.js`, `.css`, `metadata.json`, and `.svg` icon files
/// into `ext_dir`, removing any obsolete flat `.js`/`.css` files from older installations.
///
/// # Errors
///
/// Returns an `Err(String)` if any directory or file cannot be created.
pub fn install_extension_files(ext_dir: &Path) -> Result<(), String> {
    println!(
        "  -> Installing extension files to {}...",
        ext_dir.display()
    );
    fs::create_dir_all(ext_dir)
        .map_err(|e| format!("failed to create {}: {e}", ext_dir.display()))?;

    purge_legacy_flat_files(ext_dir);

    for &(rel_path, contents) in EXTENSION_FILES {
        write_verified_rel_path(ext_dir, rel_path, contents)?;
    }
    for &(rel_path, contents) in ICON_FILES {
        write_verified_rel_path(ext_dir, rel_path, contents)?;
    }
    Ok(())
}

/// Writes `org.gnome.shell.extensions.kelp.gschema.xml` to both the extension schema directory
/// and the user's XDG `glib-2.0/schemas` directory.
///
/// # Errors
///
/// Returns an `Err(String)` if either schema file cannot be written.
pub fn install_schema_files(
    ext_schema_dir: &Path,
    user_schema_dir: &Path,
) -> Result<Vec<PathBuf>, String> {
    println!("  -> Installing GSettings schema {SCHEMA_FILENAME}...");
    let dirs = vec![ext_schema_dir.to_path_buf(), user_schema_dir.to_path_buf()];
    for dir in &dirs {
        write_verified_rel_path(dir, SCHEMA_FILENAME, SCHEMA_XML)?;
    }
    Ok(dirs)
}

/// Installs GNOME Control Center keybinding XML definitions into
/// `<data_dir>/gnome-control-center/keybindings`.
///
/// # Errors
///
/// Returns an `Err(String)` if the keybinding files cannot be written.
pub fn install_keybinding_files(data_dir: &Path) -> Result<(), String> {
    let kb_dir = data_dir.join("gnome-control-center").join("keybindings");
    println!(
        "  -> Installing GNOME Control Center keybinding definitions to {}...",
        kb_dir.display()
    );
    for &legacy in LEGACY_KEYBINDING_FILES {
        let candidate = kb_dir.join(legacy);
        if candidate.is_file() {
            let _ = fs::remove_file(candidate);
        }
    }
    for &(filename, contents) in KEYBINDING_FILES {
        write_verified_rel_path(&kb_dir, filename, contents)?;
    }
    Ok(())
}

/// Ensures a valid `~/.config/kelp/config.json` exists, validating any existing file via
/// [`validate_config_json`] and writing [`DEFAULT_CONFIG_JSON`] when absent.
///
/// # Errors
///
/// Returns an `Err(String)` if the configuration directory or file cannot be written or
/// if the embedded default config fails validation.
pub fn install_default_config(config_dir: &Path) -> Result<(), String> {
    validate_config_json(DEFAULT_CONFIG_JSON)?;
    let kelp_cfg_dir = config_dir.join("kelp");
    let cfg_file = kelp_cfg_dir.join("config.json");

    if let Ok(existing) = fs::read_to_string(&cfg_file) {
        if validate_config_json(&existing).is_ok() {
            if existing.contains("\"pop-shell-example\"") {
                let migrated = existing.replace("\"pop-shell-example\"", "\"kelp-example\"");
                write_verified_rel_path(&kelp_cfg_dir, "config.json", &migrated)?;
            }
            return Ok(());
        }
        println!(
            "  -> Existing config.json was invalid; backing up to config.json.bak and restoring default..."
        );
        let _ = write_verified_rel_path(&kelp_cfg_dir, "config.json.bak", &existing);
    }

    write_verified_rel_path(&kelp_cfg_dir, "config.json", DEFAULT_CONFIG_JSON)
}

/// Compiles `GSettings` schemas in each directory in `schema_dirs` via `glib-compile-schemas`.
///
/// # Errors
///
/// Returns an `Err(String)` if `glib-compile-schemas` cannot be executed or exits non-zero.
pub fn compile_schemas(schema_dirs: &[PathBuf]) -> Result<(), String> {
    for dir in schema_dirs {
        println!("  -> Compiling schemas in {}...", dir.display());
        let status = Command::new("glib-compile-schemas")
            .arg(dir)
            .status()
            .map_err(|e| {
                format!(
                    "failed to run glib-compile-schemas on {}: {e}",
                    dir.display()
                )
            })?;
        if !status.success() {
            return Err(format!(
                "glib-compile-schemas failed with status {status} on {}",
                dir.display()
            ));
        }
    }
    Ok(())
}
