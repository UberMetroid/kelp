// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Integration test suite (`tests/installer.rs`) exercising CLI parsing, config JSON
//   validation, extension tree extraction, legacy flat-file purging, schema compilation,
//   and EGO `.shell-extension.zip` bundle creation.
// - Zero-Trust Boundary & Invariants:
//   Uses isolated per-test directories under `std::env::temp_dir()` and cleans them up
//   deterministically so tests never mutate the user's real `~/.local/share` or `~/.config`.

#![forbid(unsafe_code)]
#![deny(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::todo,
    clippy::unimplemented,
    clippy::dbg_macro
)]

use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::id;

use kelp::{
    compile_schemas, install_default_config, install_extension_files, install_keybinding_files,
    install_schema_files, pack_extension_bundle, parse_cli_args, validate_config_json,
    write_staging_tree, CliAction, DEFAULT_CONFIG_JSON, EXTENSION_FILES, EXTENSION_UUID,
    ICON_FILES, KEYBINDING_FILES, LEGACY_FLAT_FILES, MAX_CONFIG_BYTES, SCHEMA_FILENAME,
};

fn temp_test_dir(tag: &str) -> Result<PathBuf, String> {
    let dir = env::temp_dir().join(format!("kelp-test-{tag}-{}", id()));
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("failed to clean {}: {e}", dir.display()))?;
    }
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create {}: {e}", dir.display()))?;
    Ok(dir)
}

#[test]
fn cli_parser_handles_valid_and_invalid_arguments() -> Result<(), String> {
    if parse_cli_args(&[])? != CliAction::Install {
        return Err("empty args should map to CliAction::Install".to_string());
    }
    if parse_cli_args(&["--help".to_string()])? != CliAction::Help {
        return Err("--help should map to CliAction::Help".to_string());
    }
    if parse_cli_args(&["--version".to_string()])? != CliAction::Version {
        return Err("--version should map to CliAction::Version".to_string());
    }
    if parse_cli_args(&["--pack".to_string()])? != CliAction::Pack(PathBuf::from(".")) {
        return Err("--pack without dir should default to '.'".to_string());
    }
    if parse_cli_args(&["--pack".to_string(), "/tmp/out".to_string()])?
        != CliAction::Pack(PathBuf::from("/tmp/out"))
    {
        return Err("--pack /tmp/out failed".to_string());
    }
    if parse_cli_args(&["--pack".to_string(), String::new()]).is_ok() {
        return Err("empty --pack directory must be rejected".to_string());
    }
    if parse_cli_args(&["--unknown-flag".to_string()]).is_ok() {
        return Err("unknown flag must be rejected".to_string());
    }
    Ok(())
}

#[test]
fn config_validator_enforces_size_and_structure() -> Result<(), String> {
    validate_config_json(DEFAULT_CONFIG_JSON)?;
    if validate_config_json("not json").is_ok() {
        return Err("non-object JSON should fail validation".to_string());
    }
    if validate_config_json(r#"{"other": []}"#).is_ok() {
        return Err("JSON missing 'float' field should fail validation".to_string());
    }
    if validate_config_json(r#"{"float": [{"class": "A"}]"#).is_ok() {
        return Err("unbalanced JSON braces should fail validation".to_string());
    }
    let oversized = format!(r#"{{"float": ["{}"]}}"#, "a".repeat(MAX_CONFIG_BYTES + 10));
    if validate_config_json(&oversized).is_ok() {
        return Err("oversized config.json must fail OWASP size check".to_string());
    }
    Ok(())
}

#[test]
fn installer_extracts_modular_tree_purges_legacy_and_compiles_schemas() -> Result<(), String> {
    let root = temp_test_dir("install")?;
    let ext_dir = root
        .join("share")
        .join("gnome-shell")
        .join("extensions")
        .join(EXTENSION_UUID);
    fs::create_dir_all(&ext_dir).map_err(|e| e.to_string())?;

    // Plant legacy flat files and legacy icons to verify they get purged during upgrade
    let stale_file = ext_dir.join(LEGACY_FLAT_FILES[0]);
    fs::write(&stale_file, "// stale").map_err(|e| e.to_string())?;
    let stale_icon = ext_dir.join("icons").join("pop-shell-auto-on-symbolic.svg");
    fs::create_dir_all(ext_dir.join("icons")).map_err(|e| e.to_string())?;
    fs::write(&stale_icon, "<svg/>").map_err(|e| e.to_string())?;

    install_extension_files(&ext_dir)?;
    if stale_file.exists() || stale_icon.exists() {
        return Err(
            "legacy flat file or icon was not purged by install_extension_files".to_string(),
        );
    }

    for &(rel_path, _) in EXTENSION_FILES {
        if !ext_dir.join(rel_path).is_file() {
            return Err(format!("missing installed file: {rel_path}"));
        }
    }
    for &(rel_path, _) in ICON_FILES {
        if !ext_dir.join(rel_path).is_file() {
            return Err(format!("missing installed icon: {rel_path}"));
        }
    }

    let ext_schema_dir = ext_dir.join("schemas");
    let user_schema_dir = root.join("share").join("glib-2.0").join("schemas");
    let dirs = install_schema_files(&ext_schema_dir, &user_schema_dir)?;
    compile_schemas(&dirs)?;
    if !ext_schema_dir.join("gschemas.compiled").is_file() {
        return Err("gschemas.compiled was not generated".to_string());
    }

    install_keybinding_files(&root.join("share"))?;
    for &(kb_file, _) in KEYBINDING_FILES {
        let p = root
            .join("share")
            .join("gnome-control-center")
            .join("keybindings")
            .join(kb_file);
        if !p.is_file() {
            return Err(format!("missing keybinding XML: {}", p.display()));
        }
    }

    let cfg_dir = root.join("config");
    install_default_config(&cfg_dir)?;
    let cfg_path = cfg_dir.join("kelp").join("config.json");
    if !cfg_path.is_file() {
        return Err("default config.json was not written".to_string());
    }
    // Verify legacy pop-shell-example placeholder in existing valid config.json is migrated
    fs::write(
        &cfg_path,
        r#"{"float":[{"class":"pop-shell-example","title":"pop-shell-example"}]}"#,
    )
    .map_err(|e| e.to_string())?;
    install_default_config(&cfg_dir)?;
    let migrated_cfg = fs::read_to_string(&cfg_path).map_err(|e| e.to_string())?;
    if migrated_cfg.contains("pop-shell-example") || !migrated_cfg.contains("kelp-example") {
        return Err("install_default_config did not migrate pop-shell-example".to_string());
    }
    // Verify invalid config.json is backed up to config.json.bak before restoring default
    fs::write(&cfg_path, "corrupted-json").map_err(|e| e.to_string())?;
    install_default_config(&cfg_dir)?;
    if fs::read_to_string(cfg_dir.join("kelp").join("config.json.bak"))
        .map_err(|e| e.to_string())?
        != "corrupted-json"
    {
        return Err("invalid config.json was not backed up to config.json.bak".to_string());
    }

    let _ = fs::remove_dir_all(&root);
    Ok(())
}

#[test]
fn staging_and_ego_bundle_pack_include_modular_subdirectories() -> Result<(), String> {
    let root = temp_test_dir("pack")?;
    let stage = root.join("stage");
    write_staging_tree(&stage)?;

    if !stage.join("schemas").join(SCHEMA_FILENAME).is_file() {
        return Err("staged schema XML missing".to_string());
    }
    if stage.join("schemas").join("gschemas.compiled").exists() {
        return Err("EGO staging tree must not contain binary gschemas.compiled".to_string());
    }

    let out_dir = root.join("out");
    let bundle = pack_extension_bundle(&out_dir)?;
    if !bundle.is_file() {
        return Err(format!("bundle {} not created", bundle.display()));
    }

    let _ = fs::remove_dir_all(&root);
    Ok(())
}
