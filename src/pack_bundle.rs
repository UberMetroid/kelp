use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::embedded_assets::EXTENSION_UUID;
use crate::install_files::install_extension_tree;

/// Stages the embedded extension tree and invokes `gnome-extensions pack` to produce
/// an EGO-ready `kelp@ubermetroid.github.io.shell-extension.zip` archive in `out_dir`.
pub fn pack_extension_bundle(out_dir: &Path, dry_run: bool) -> Result<PathBuf, String> {
    let zip_path = out_dir.join(format!("{EXTENSION_UUID}.shell-extension.zip"));
    if dry_run {
        println!(
            "[dry-run] Would stage extension files and pack {}",
            zip_path.display()
        );
        return Ok(zip_path);
    }

    fs::create_dir_all(out_dir).map_err(|e| {
        format!(
            "Failed to create output directory {}: {e}",
            out_dir.display()
        )
    })?;

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let stage_dir = env::temp_dir().join(format!("kelp-pack-{}-{nanos}", std::process::id()));
    install_extension_tree(&stage_dir, false)?;

    let mut cmd = Command::new("gnome-extensions");
    cmd.arg("pack")
        .arg(&stage_dir)
        .arg("--force")
        .arg("--out-dir")
        .arg(out_dir);

    for (rel_path, _) in crate::embedded_assets::EMBEDDED_EXTENSION_FILES {
        if *rel_path != "extension.js"
            && *rel_path != "prefs.js"
            && *rel_path != "metadata.json"
            && !rel_path.starts_with("schemas/")
            && !rel_path.contains('/')
        {
            cmd.arg(format!("--extra-source={rel_path}"));
        }
    }
    cmd.arg("--extra-source=icons");

    let status = cmd
        .status()
        .map_err(|e| format!("Failed to execute gnome-extensions pack: {e}"))?;
    let _ = fs::remove_dir_all(&stage_dir);

    if !status.success() {
        return Err("gnome-extensions pack returned a non-zero exit code".to_string());
    }

    Ok(zip_path)
}
