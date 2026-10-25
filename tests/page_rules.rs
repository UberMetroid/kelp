// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Global Page Rule, Directory Density, Banned Filename, and First-Principles & Zero-Trust
//   Header enforcement suite across the entire repository (`src/`, `tests/`, `extension/`).
// - Zero-Trust Boundary & Invariants:
//   Verifies at test time that every `.rs` and `.js` file is `16..=256` lines, starts with
//   `// SPDX-License-Identifier: GPL-3.0-or-later` on line 1, includes the mandatory
//   `// First-Principles & Zero-Trust Page Header`, uses zero banned generic filenames,
//   and that every directory in the repository contains at most 8 visible entries (`<= 8`).

#![forbid(unsafe_code)]
#![deny(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::todo,
    clippy::unimplemented,
    clippy::dbg_macro
)]

use std::fs;
use std::path::{Path, PathBuf};

const BANNED_STEMS: &[&str] = &[
    "util", "utils", "lib", "helper", "helpers", "common", "misc", "shared", "base", "core",
    "types", "mod",
];

fn collect_code_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries =
        fs::read_dir(dir).map_err(|e| format!("failed to read {}: {e}", dir.display()))?;
    for entry_res in entries {
        let entry = entry_res.map_err(|e| format!("dir entry error: {e}"))?;
        let path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.starts_with('.') || name_str == "target" {
            continue;
        }
        if path.is_dir() {
            collect_code_files(&path, out)?;
        } else if matches!(path.extension().and_then(|s| s.to_str()), Some("rs" | "js")) {
            out.push(path);
        }
    }
    Ok(())
}

fn collect_directories(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    out.push(dir.to_path_buf());
    let entries =
        fs::read_dir(dir).map_err(|e| format!("failed to read {}: {e}", dir.display()))?;
    for entry_res in entries {
        let entry = entry_res.map_err(|e| format!("dir entry error: {e}"))?;
        let path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.starts_with('.') || name_str == "target" {
            continue;
        }
        if path.is_dir() {
            collect_directories(&path, out)?;
        }
    }
    Ok(())
}

#[test]
fn every_rs_and_js_file_obeys_page_size_spdx_and_header_invariants() -> Result<(), String> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut files = Vec::new();
    collect_code_files(root, &mut files)?;
    files.sort();

    if files.len() < 40 {
        return Err(format!(
            "expected at least 40 code files (.rs + .js), found {}",
            files.len()
        ));
    }

    for file in &files {
        let content = fs::read_to_string(file)
            .map_err(|e| format!("failed to read {}: {e}", file.display()))?;
        let lines: Vec<&str> = content.lines().collect();
        let count = lines.len();
        if !(16..=256).contains(&count) {
            return Err(format!(
                "Page Rule violation: {} has {count} lines (must be 16..=256)",
                file.display()
            ));
        }

        let first_line = lines.first().copied().unwrap_or("");
        if first_line != "// SPDX-License-Identifier: GPL-3.0-or-later" {
            return Err(format!(
                "Missing SPDX header on line 1 of {}: found '{first_line}'",
                file.display()
            ));
        }

        let header_block: String = lines
            .iter()
            .take(15)
            .copied()
            .collect::<Vec<_>>()
            .join("\n");
        for required_marker in [
            "// First-Principles & Zero-Trust Page Header",
            "- Page Responsibility / Functional Domain:",
            "- Zero-Trust Boundary & Invariants:",
        ] {
            if !header_block.contains(required_marker) {
                return Err(format!(
                    "Missing '{required_marker}' in first 15 lines of {}",
                    file.display()
                ));
            }
        }
    }
    Ok(())
}

#[test]
fn every_directory_has_at_most_eight_entries_and_no_banned_names() -> Result<(), String> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut dirs = Vec::new();
    collect_directories(root, &mut dirs)?;
    dirs.sort();

    for dir in &dirs {
        let entries =
            fs::read_dir(dir).map_err(|e| format!("failed to read {}: {e}", dir.display()))?;
        let mut visible_names = Vec::new();
        for entry_res in entries {
            let entry = entry_res.map_err(|e| format!("dir entry error: {e}"))?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || (dir == root && name == "target") {
                continue;
            }
            visible_names.push(name);
        }

        if visible_names.len() > 8 {
            return Err(format!(
                "Directory density violation: {} has {} entries (max 8): {:?}",
                dir.display(),
                visible_names.len(),
                visible_names
            ));
        }

        for name in &visible_names {
            let entry_path = dir.join(name);
            let stem = entry_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            // Cargo requires `src/lib.rs` as the library crate root; all other banned stems are forbidden
            let is_cargo_lib_root = dir.ends_with("src") && name == "lib.rs";
            if !is_cargo_lib_root && BANNED_STEMS.contains(&stem.as_str()) {
                return Err(format!(
                    "Banned generic filename/directory '{}' found in {}",
                    name,
                    dir.display()
                ));
            }
        }
    }
    Ok(())
}
