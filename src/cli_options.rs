// SPDX-License-Identifier: GPL-3.0-or-later
// Zero-dependency CLI argument parser (CliAction, parse_cli_args) for install and --pack modes.

use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CliAction {
    Install,
    Pack(PathBuf),
    Help,
    Version,
}

/// Parses command-line arguments (excluding `argv[0]`) into a validated [`CliAction`].
///
/// # Errors
///
/// Returns an `Err(String)` if an unrecognized flag is passed.
pub fn parse_cli_args(args: &[String]) -> Result<CliAction, String> {
    if args.is_empty() || (args.len() == 1 && matches!(args[0].as_str(), "install" | "--install")) {
        return Ok(CliAction::Install);
    }

    match args[0].as_str() {
        "-h" | "--help" => Ok(CliAction::Help),
        "-V" | "--version" => Ok(CliAction::Version),
        "-p" | "--pack" => {
            if args.len() > 2 {
                return Err(
                    "too many arguments for --pack (expected at most one output directory)"
                        .to_string(),
                );
            }
            let out_dir = if args.len() == 2 {
                let raw = args[1].trim();
                if raw.is_empty() {
                    return Err("--pack output directory cannot be empty".to_string());
                }
                PathBuf::from(raw)
            } else {
                PathBuf::from(".")
            };
            Ok(CliAction::Pack(out_dir))
        }
        other => Err(format!(
            "unrecognized argument '{other}' (try --help for usage)"
        )),
    }
}
