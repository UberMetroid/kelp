// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Binary entrypoint (`main`, `run`) orchestrating CLI argument dispatch, XDG directory
//   resolution, extension file extraction, GSettings schema compilation, and shortcut setup.
// - Zero-Trust Boundary & Invariants:
//   Enforces `#![forbid(unsafe_code)]` and zero-panic error propagation via `Result<(), String>`,
//   returning exit code `1` with structured `stderr` output on any environmental failure.

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
use std::process::ExitCode;

use kelp::{
    compile_schemas, configure_keybindings, enable_extension, install_default_config,
    install_extension_files, install_keybinding_files, install_schema_files, pack_extension_bundle,
    parse_cli_args, resolve_xdg_dir, CliAction, EXTENSION_UUID,
};

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().skip(1).collect();
    let action = parse_cli_args(&args)?;

    match action {
        CliAction::Help => {
            println!("Usage: kelp [--pack [OUT_DIR]]");
            println!("  (no args)        Install and enable the Kelp GNOME Shell extension");
            println!("  --pack [OUT_DIR] Package an EGO-ready .shell-extension.zip bundle");
            return Ok(());
        }
        CliAction::Version => {
            println!("kelp {}", env!("CARGO_PKG_VERSION"));
            return Ok(());
        }
        CliAction::Pack(out_dir) => {
            let bundle = pack_extension_bundle(&out_dir)?;
            println!("Packed EGO bundle: {}", bundle.display());
            return Ok(());
        }
        CliAction::Install => {}
    }

    println!("==> Installing Kelp (Wayland Auto-Tiling GNOME Shell Extension)...");

    let data_dir = resolve_xdg_dir("XDG_DATA_HOME", ".local/share")?;
    let config_dir = resolve_xdg_dir("XDG_CONFIG_HOME", ".config")?;

    let ext_dir = data_dir
        .join("gnome-shell")
        .join("extensions")
        .join(EXTENSION_UUID);
    let ext_schema_dir = ext_dir.join("schemas");
    let user_schema_dir = data_dir.join("glib-2.0").join("schemas");

    install_extension_files(&ext_dir)?;
    let schema_dirs = install_schema_files(&ext_schema_dir, &user_schema_dir)?;
    install_keybinding_files(&data_dir)?;
    install_default_config(&config_dir)?;
    compile_schemas(&schema_dirs)?;
    configure_keybindings(&ext_schema_dir)?;
    enable_extension();

    println!("==> Kelp installation complete!");
    println!("    Extension installed to: {}", ext_dir.display());
    println!("    Note: On Wayland, log out and log back in if this is the first installation.");
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("kelp error: {err}");
            ExitCode::FAILURE
        }
    }
}
