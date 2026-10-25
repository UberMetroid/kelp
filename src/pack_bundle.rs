// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   EGO bundle staging and packaging (`write_staging_tree`, `pack_extension_bundle`) invoking
//   `gnome-extensions pack` with all modular `--extra-source` directories.
// - Zero-Trust Boundary & Invariants:
//   Stages embedded files into a dedicated temporary directory, passes `--extra-source` for
//   every subdirectory in `EXTENSION_SUBDIRS` (`engine`, `window`, `ui`, `icons`), and cleans
//   up the temporary staging directory whether `gnome-extensions pack` succeeds or fails.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{id, Command};

use crate::embedded_assets::{EXTENSION_SUBDIRS, EXTENSION_UUID, SCHEMA_FILENAME, SCHEMA_XML};
use crate::install_files::install_extension_files;

/// Writes the complete extension tree (excluding compiled `gschemas.compiled`) into `staging_dir`.
///
/// # Errors
///
/// Returns an `Err(String)` if any staged file or directory cannot be created.
pub fn write_staging_tree(staging_dir: &Path) -> Result<(), String> {
    install_extension_files(staging_dir)?;
    let schema_dir = staging_dir.join("schemas");
    fs::create_dir_all(&schema_dir)
        .map_err(|e| format!("failed to create {}: {e}", schema_dir.display()))?;
    let schema_path = schema_dir.join(SCHEMA_FILENAME);
    fs::write(&schema_path, SCHEMA_XML)
        .map_err(|e| format!("failed to write {}: {e}", schema_path.display()))?;
    Ok(())
}

/// Packages an EGO-compliant `<UUID>.shell-extension.zip` bundle into `out_dir` using
/// `gnome-extensions pack`.
///
/// # Errors
///
/// Returns an `Err(String)` if staging fails, `gnome-extensions pack` fails, or the resulting
/// `.shell-extension.zip` archive is missing.
pub fn pack_extension_bundle(out_dir: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(out_dir).map_err(|e| {
        format!(
            "failed to create output directory {}: {e}",
            out_dir.display()
        )
    })?;

    let staging_dir = env::temp_dir().join(format!("kelp-ego-stage-{}", id()));
    if staging_dir.exists() {
        let _ = fs::remove_dir_all(&staging_dir);
    }

    let stage_res = write_staging_tree(&staging_dir);
    if let Err(err) = stage_res {
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(err);
    }

    let mut cmd = Command::new("gnome-extensions");
    cmd.arg("pack")
        .arg(&staging_dir)
        .arg("--force")
        .arg(format!("--out-dir={}", out_dir.display()))
        .arg(format!(
            "--schema={}",
            staging_dir.join("schemas").join(SCHEMA_FILENAME).display()
        ));

    for &subdir in EXTENSION_SUBDIRS {
        cmd.arg(format!("--extra-source={subdir}"));
    }

    let status_res = cmd.status();
    let _ = fs::remove_dir_all(&staging_dir);

    let status = status_res.map_err(|e| format!("failed to execute gnome-extensions pack: {e}"))?;
    if !status.success() {
        return Err(format!("gnome-extensions pack exited with status {status}"));
    }

    let bundle_path = out_dir.join(format!("{EXTENSION_UUID}.shell-extension.zip"));
    if !bundle_path.is_file() {
        return Err(format!(
            "expected bundle {} was not created by gnome-extensions pack",
            bundle_path.display()
        ));
    }
    Ok(bundle_path)
}
