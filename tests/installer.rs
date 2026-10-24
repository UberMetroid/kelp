//! Integration tests for CLI argument parsing, `gsettings` command generation,
//! file tree installation, and `gnome-extensions pack` EGO zip bundle creation.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use kelp::cli_options::parse_args;
use kelp::embedded_assets::{EXTENSION_UUID, SCHEMA_FILENAME, SCHEMA_ID};
use kelp::gsettings_config::gsettings_commands;
use kelp::install_files::{install_config_json, install_extension_tree};
use kelp::pack_bundle::pack_extension_bundle;

fn unique_temp_dir(prefix: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    env::temp_dir().join(format!("{prefix}-{}-{nanos}", std::process::id()))
}

#[test]
fn test_parse_args_defaults_and_flags() -> Result<(), String> {
    let opts = parse_args(Vec::<String>::new())?;
    assert!(!opts.system);
    assert!(!opts.dry_run);
    assert!(!opts.skip_gsettings);
    assert!(opts.target_dir.is_none());
    assert!(opts.pack_dir.is_none());
    assert!(!opts.help);

    let opts = parse_args(vec![
        "--system".to_string(),
        "--dry-run".to_string(),
        "--skip-gsettings".to_string(),
        "--target-dir".to_string(),
        "/tmp/test-kelp".to_string(),
        "--pack".to_string(),
        "/tmp/pack-out".to_string(),
    ])?;
    assert!(opts.system);
    assert!(opts.dry_run);
    assert!(opts.skip_gsettings);
    assert_eq!(opts.target_dir, Some(PathBuf::from("/tmp/test-kelp")));
    assert_eq!(opts.pack_dir, Some(PathBuf::from("/tmp/pack-out")));

    // --pack with no directory argument defaults to "."
    let opts_pack_default = parse_args(vec!["--pack".to_string(), "--dry-run".to_string()])?;
    assert_eq!(opts_pack_default.pack_dir, Some(PathBuf::from(".")));
    assert!(opts_pack_default.dry_run);
    Ok(())
}

#[test]
fn test_parse_args_rejects_invalid_inputs() {
    assert!(parse_args(vec!["--unknown-flag".to_string()]).is_err());
    assert!(parse_args(vec!["--target-dir".to_string()]).is_err());
    assert!(parse_args(vec!["--target-dir".to_string(), String::new()]).is_err());
    assert!(parse_args(vec!["--pack".to_string(), String::new()]).is_err());
}

#[test]
fn test_gsettings_commands_target_kelp_schema() {
    let cmds = gsettings_commands(Some(Path::new("/tmp/schemas")));
    let joined: Vec<String> = cmds.iter().map(|c| c.join(" ")).collect();

    assert!(joined
        .iter()
        .any(|c| c.contains("org.gnome.mutter auto-maximize false")));
    assert!(joined
        .iter()
        .any(|c| c.contains("org.gnome.mutter edge-tiling false")));
    assert!(joined
        .iter()
        .any(|c| c.contains("org.gnome.desktop.wm.preferences focus-mode 'click'")));
    assert!(joined
        .iter()
        .any(|c| c.contains(&format!("{SCHEMA_ID} hint-color-rgba 'rgb(255,0,0)'"))));
    assert!(joined
        .iter()
        .any(|c| c.contains(&format!("{SCHEMA_ID} active-hint-border-radius 2"))));
    assert!(joined
        .iter()
        .any(|c| c.contains(&format!("{SCHEMA_ID} tile-move-left-global"))));
    assert!(joined
        .iter()
        .any(|c| c.contains("switch-to-workspace-10 ['<Super>0']")));
    assert!(joined
        .iter()
        .any(|c| c.contains("move-to-workspace-10 ['<Super><Shift>0']")));
    assert!(joined
        .iter()
        .any(|c| c.contains("toggle-quick-settings ['<Super><Control>s']")));
}

#[test]
fn test_install_extension_tree_and_config_json() -> Result<(), String> {
    let temp_dir = unique_temp_dir("kelp-install-test");
    fs::create_dir_all(temp_dir.join("color_dialog")).map_err(|e| e.to_string())?;
    fs::write(temp_dir.join("launcher.js"), b"stale").map_err(|e| e.to_string())?;
    fs::write(temp_dir.join("paths.js"), b"stale").map_err(|e| e.to_string())?;

    install_extension_tree(&temp_dir, false)?;

    assert!(temp_dir.join("extension.js").exists());
    assert!(temp_dir.join("prefs.js").exists());
    assert!(temp_dir.join("metadata.json").exists());
    assert!(temp_dir.join("schemas/gschemas.compiled").exists());
    assert!(temp_dir.join("schemas").join(SCHEMA_FILENAME).exists());
    assert!(temp_dir
        .join("icons/pop-shell-auto-on-symbolic.svg")
        .exists());
    assert!(!temp_dir.join("launcher.js").exists());
    assert!(!temp_dir.join("paths.js").exists());
    assert!(!temp_dir.join("color_dialog").exists());

    let cfg_path = install_config_json(&temp_dir, false)?;
    assert_eq!(cfg_path, temp_dir.join(".config/kelp/config.json"));
    assert!(cfg_path.exists());

    fs::remove_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    Ok(())
}

#[test]
fn test_pack_extension_bundle_creates_valid_ego_zip() -> Result<(), String> {
    let temp_dir = unique_temp_dir("kelp-pack-test");
    let zip_path = pack_extension_bundle(&temp_dir, false)?;
    assert_eq!(
        zip_path,
        temp_dir.join(format!("{EXTENSION_UUID}.shell-extension.zip"))
    );
    assert!(zip_path.exists(), "Packed zip file must exist");

    let output = Command::new("unzip")
        .arg("-l")
        .arg(&zip_path)
        .output()
        .map_err(|e| e.to_string())?;
    assert!(output.status.success());
    let listing = String::from_utf8_lossy(&output.stdout);
    for required in [
        "extension.js",
        "prefs.js",
        "metadata.json",
        "dark.css",
        "light.css",
        "highcontrast.css",
        "window.js",
        "auto_tiler.js",
        "icons/pop-shell-auto-on-symbolic.svg",
        &format!("schemas/{SCHEMA_FILENAME}"),
    ] {
        assert!(
            listing.contains(required),
            "EGO zip bundle is missing `{required}`:\n{listing}"
        );
    }

    fs::remove_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    Ok(())
}
