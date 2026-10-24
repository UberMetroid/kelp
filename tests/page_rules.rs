//! Enforces the Page Rule (`16..=256` lines per `.rs` file, `<= 8` `.rs` files per directory,
//! no generic drawer filenames) and zero-dependency / safety attributes across the workspace.

use std::fs;
use std::path::{Path, PathBuf};

const MIN_LINES: usize = 16;
const MAX_LINES: usize = 256;
const MAX_FILES_PER_DIR: usize = 8;

const BANNED_FILENAMES: &[&str] = &[
    "util.rs",
    "utils.rs",
    "helper.rs",
    "helpers.rs",
    "common.rs",
    "misc.rs",
    "shared.rs",
    "base.rs",
    "core.rs",
];

fn collect_rs_dirs_and_files(
    dir: &Path,
    files: &mut Vec<PathBuf>,
    dirs: &mut Vec<(PathBuf, usize)>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut rs_count = 0usize;
    let mut subdirs = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if name != "target" && !name.starts_with('.') {
                subdirs.push(path);
            }
        } else if path.extension().and_then(|s| s.to_str()) == Some("rs") {
            rs_count += 1;
            files.push(path);
        }
    }
    if rs_count > 0 {
        dirs.push((dir.to_path_buf(), rs_count));
    }
    for sub in subdirs {
        collect_rs_dirs_and_files(&sub, files, dirs);
    }
}

fn is_pure_shim(content: &str) -> bool {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty()
            || trimmed.starts_with("//")
            || trimmed.starts_with("#![")
            || trimmed.starts_with("#[")
        {
            continue;
        }
        if !(trimmed.starts_with("pub mod ")
            || trimmed.starts_with("mod ")
            || trimmed.starts_with("pub use ")
            || trimmed.starts_with("use "))
        {
            return false;
        }
    }
    true
}

#[test]
fn page_rule_line_bounds_and_directory_width() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut files = Vec::new();
    let mut dirs = Vec::new();
    collect_rs_dirs_and_files(root, &mut files, &mut dirs);

    assert!(!files.is_empty(), "No .rs files found in workspace");

    for (dir, count) in dirs {
        assert!(
            count <= MAX_FILES_PER_DIR,
            "Directory {} has {count} .rs files (maximum allowed is {MAX_FILES_PER_DIR})",
            dir.display()
        );
    }

    for file in files {
        let file_name = file.file_name().and_then(|s| s.to_str()).unwrap_or("");
        assert!(
            !BANNED_FILENAMES.contains(&file_name),
            "Banned drawer filename detected: {}",
            file.display()
        );

        let content = fs::read_to_string(&file).unwrap_or_default();
        let line_count = content.lines().count();
        assert!(
            line_count <= MAX_LINES,
            "File {} has {line_count} lines (exceeds Page Rule ceiling of {MAX_LINES})",
            file.display()
        );
        if !is_pure_shim(&content) {
            assert!(
                line_count >= MIN_LINES,
                "File {} has {line_count} lines (below Page Rule floor of {MIN_LINES})",
                file.display()
            );
        }
    }
}

#[test]
fn zero_external_dependencies_in_cargo_toml_and_lock() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let cargo_toml = fs::read_to_string(root.join("Cargo.toml")).unwrap_or_default();
    for line in cargo_toml.lines() {
        let t = line.trim();
        assert!(
            !t.starts_with("[dependencies")
                && !t.starts_with("[dev-dependencies")
                && !t.starts_with("[build-dependencies"),
            "External dependency section `{t}` is forbidden in Cargo.toml"
        );
    }

    let lock_path = root.join("Cargo.lock");
    if lock_path.exists() {
        let cargo_lock = fs::read_to_string(lock_path).unwrap_or_default();
        let pkg_count = cargo_lock.matches("[[package]]").count();
        assert_eq!(
            pkg_count, 1,
            "Cargo.lock must contain exactly 1 [[package]] (the workspace crate), found {pkg_count}"
        );
    }
}

#[test]
fn crate_roots_enforce_forbid_unsafe_and_deny_panics() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    for rel in ["src/lib.rs", "src/main.rs"] {
        let content = fs::read_to_string(root.join(rel)).unwrap_or_default();
        assert!(
            content.contains("#![forbid(unsafe_code)]"),
            "{rel} is missing `#![forbid(unsafe_code)]`"
        );
        assert!(
            content.contains("clippy::unwrap_used")
                && content.contains("clippy::expect_used")
                && content.contains("clippy::panic"),
            "{rel} is missing `#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]`"
        );
    }
}
