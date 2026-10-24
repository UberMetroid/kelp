#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

pub mod cli_options;
pub mod embedded_assets;
pub mod gsettings_config;
pub mod install_files;
pub mod pack_bundle;

use std::path::PathBuf;

use crate::cli_options::{parse_args, Options};
use crate::embedded_assets::EXTENSION_UUID;
use crate::gsettings_config::apply_gsettings_and_enable;
use crate::install_files::{install_config_json, install_extension_tree, install_system_wide};
use crate::pack_bundle::pack_extension_bundle;

/// Prints the CLI usage and flags for `kelp`.
pub fn print_help() {
    println!(
        "kelp 1.0.0
Hardened, zero-subprocess Wayland auto-tiling extension for GNOME 45–51 & EGO packager

USAGE:
    kelp [OPTIONS]

OPTIONS:
    --user              Install extension into ~/.local/share/gnome-shell/extensions/{EXTENSION_UUID} (default)
    --system            Install extension system-wide in /usr/share/gnome-shell/extensions/{EXTENSION_UUID} (uses run0 if not root)
    --pack [OUT_DIR]    Build an EGO-ready {EXTENSION_UUID}.shell-extension.zip bundle in OUT_DIR (default: .)
    --target-dir <DIR>  Install extension files into a custom directory
    --skip-gsettings    Install files only; do not run gsettings or gnome-extensions
    --dry-run           Print actions without modifying the system
    -h, --help          Print this help message"
    );
}

/// Parses CLI arguments and executes the requested installer or packager workflow.
pub fn execute_cli<I>(args: I) -> Result<(), String>
where
    I: IntoIterator<Item = String>,
{
    let opts = parse_args(args)?;
    run_with_options(&opts)
}

/// Executes the `kelp` workflow for a parsed [`Options`] struct.
pub fn run_with_options(opts: &Options) -> Result<(), String> {
    if opts.help {
        print_help();
        return Ok(());
    }

    if let Some(ref out_dir) = opts.pack_dir {
        let zip_path = pack_extension_bundle(out_dir, opts.dry_run)?;
        println!("==> Packed EGO extension bundle: {}", zip_path.display());
        return Ok(());
    }

    let home = std::env::var("HOME")
        .map(PathBuf::from)
        .map_err(|_| "HOME environment variable is not set".to_string())?;

    let schema_dir = if let Some(ref custom_dir) = opts.target_dir {
        println!(
            "==> Installing Kelp ({EXTENSION_UUID}) to {}...",
            custom_dir.display()
        );
        install_extension_tree(custom_dir, opts.dry_run)?;
        Some(custom_dir.join("schemas"))
    } else if opts.system {
        println!("==> Installing Kelp ({EXTENSION_UUID}) system-wide...");
        install_system_wide(opts.dry_run)?;
        None
    } else {
        let user_ext_dir = home
            .join(".local/share/gnome-shell/extensions")
            .join(EXTENSION_UUID);
        println!(
            "==> Installing Kelp ({EXTENSION_UUID}) to {}...",
            user_ext_dir.display()
        );
        install_extension_tree(&user_ext_dir, opts.dry_run)?;
        Some(user_ext_dir.join("schemas"))
    };

    let cfg_path = install_config_json(&home, opts.dry_run)?;
    println!(
        "==> Wrote float exceptions & config to {}",
        cfg_path.display()
    );

    if !opts.skip_gsettings {
        apply_gsettings_and_enable(schema_dir.as_deref(), &home, opts.dry_run)?;
    }

    println!("==> Done! Kelp ({EXTENSION_UUID}) is installed and configured.");
    Ok(())
}
