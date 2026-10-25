// SPDX-License-Identifier: GPL-3.0-or-later
// Crate root re-exporting CLI parsing, embedded extension assets, GSettings setup, and EGO packing.

#![forbid(unsafe_code)]
#![deny(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::todo,
    clippy::unimplemented,
    clippy::dbg_macro
)]

pub mod cli_options;
pub mod default_rules;
pub mod embedded_assets;
pub mod gsettings_config;
pub mod install_files;
pub mod pack_bundle;

use std::env;
use std::path::PathBuf;

pub use cli_options::{parse_cli_args, CliAction};
pub use default_rules::{validate_config_json, DEFAULT_CONFIG_JSON, MAX_CONFIG_BYTES};
pub use embedded_assets::{
    EXTENSION_FILES, EXTENSION_SUBDIRS, EXTENSION_UUID, ICON_FILES, KEYBINDING_FILES,
    LEGACY_FLAT_FILES, SCHEMA_FILENAME, SCHEMA_ID, SCHEMA_XML,
};
pub use gsettings_config::{
    configure_keybindings, enable_extension, GSETTINGS_OVERRIDES, KEYBINDINGS, WM_CONFLICTS,
};
pub use install_files::{
    compile_schemas, install_default_config, install_extension_files, install_keybinding_files,
    install_schema_files,
};
pub use pack_bundle::{pack_extension_bundle, write_staging_tree};

/// Resolves an XDG base directory from `env_var`, falling back to `$HOME/<fallback_rel>`.
///
/// # Errors
///
/// Returns an `Err(String)` if neither `env_var` nor `HOME` is set to a non-empty path.
pub fn resolve_xdg_dir(env_var: &str, fallback_rel: &str) -> Result<PathBuf, String> {
    if let Ok(val) = env::var(env_var) {
        let trimmed = val.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }
    let home = env::var("HOME").map_err(|_| "HOME environment variable is not set".to_string())?;
    let trimmed_home = home.trim();
    if trimmed_home.is_empty() {
        return Err("HOME environment variable is empty".to_string());
    }
    Ok(PathBuf::from(trimmed_home).join(fallback_rel))
}
