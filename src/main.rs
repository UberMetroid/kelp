//! Binary entry point for the `kelp` Wayland auto-tiling extension installer and EGO packager.
#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::env;
use std::process::ExitCode;

fn main() -> ExitCode {
    match kelp::execute_cli(env::args().skip(1)) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("Error: {e}");
            ExitCode::FAILURE
        }
    }
}
