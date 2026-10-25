// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Static security & EGO compliance lint suite (`tests/lint.rs`) verifying modern ES2022
//   syntax (`const`/`let` only, strict equality `===`/`!==`), Mutter 18/19 API usage,
//   process-boundary separation (`prefs.js`), and deterministic lifecycle cleanup.
// - Zero-Trust Boundary & Invariants:
//   Scans every `.js` file under `extension/` to forbid `var`, loose `==`/`!=`, legacy
//   `imports.gi` / `imports.ui`, deprecated Clutter actors, and Mutter imports in `prefs.js`.

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

use kelp::EXTENSION_FILES;

fn collect_js_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries =
        fs::read_dir(dir).map_err(|e| format!("failed to read {}: {e}", dir.display()))?;
    for entry_res in entries {
        let entry = entry_res.map_err(|e| format!("dir entry error: {e}"))?;
        let path = entry.path();
        if path.is_dir() {
            collect_js_files(&path, out)?;
        } else if path.extension().and_then(|s| s.to_str()) == Some("js") {
            out.push(path);
        }
    }
    Ok(())
}

#[test]
fn all_js_files_use_strict_es2022_and_zero_legacy_imports() -> Result<(), String> {
    let ext_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("extension");
    let mut js_files = Vec::new();
    collect_js_files(&ext_root, &mut js_files)?;
    js_files.sort();

    if js_files.len() < 30 {
        return Err(format!("expected >= 30 JS files, found {}", js_files.len()));
    }

    for file in &js_files {
        let content = fs::read_to_string(file)
            .map_err(|e| format!("failed to read {}: {e}", file.display()))?;

        for forbidden in [
            "imports.gi",
            "imports.ui",
            "imports.misc",
            "ExtensionUtils",
            "Meta.LaterType",
            "Clutter.Container",
        ] {
            if content.contains(forbidden) {
                return Err(format!(
                    "Forbidden legacy symbol '{forbidden}' in {}",
                    file.display()
                ));
            }
        }

        for (line_idx, raw_line) in content.lines().enumerate() {
            let code = raw_line.split("//").next().unwrap_or("");
            let trimmed = code.trim_start();
            if trimmed.starts_with("var ") || code.contains(" var ") || code.contains("(var ") {
                return Err(format!(
                    "Forbidden `var` declaration in {}:{} -> {raw_line}",
                    file.display(),
                    line_idx + 1
                ));
            }

            let bytes = code.as_bytes();
            for i in 0..bytes.len().saturating_sub(1) {
                if bytes[i] == b'=' && bytes[i + 1] == b'=' {
                    let prev_ok = i > 0 && matches!(bytes[i - 1], b'=' | b'!' | b'<' | b'>');
                    let next_ok = i + 2 < bytes.len() && bytes[i + 2] == b'=';
                    if !prev_ok && !next_ok {
                        return Err(format!(
                            "Loose `==` operator in {}:{} -> {raw_line}",
                            file.display(),
                            line_idx + 1
                        ));
                    }
                }
                if bytes[i] == b'!' && bytes[i + 1] == b'=' {
                    let next_ok = i + 2 < bytes.len() && bytes[i + 2] == b'=';
                    if !next_ok {
                        return Err(format!(
                            "Loose `!=` operator in {}:{} -> {raw_line}",
                            file.display(),
                            line_idx + 1
                        ));
                    }
                }
            }
        }
    }
    Ok(())
}

#[test]
fn prefs_and_shared_settings_never_import_compositor_only_typelibs() -> Result<(), String> {
    let ext_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("extension");
    let prefs_chain = [
        "prefs.js",
        "engine/geom/focus.js",
        "engine/geom/rectangle.js",
        "ui/settings/gsettings.js",
        "ui/settings/color.js",
        "ui/settings/log.js",
    ];

    for rel in prefs_chain {
        let path = ext_root.join(rel);
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
        for raw_line in content.lines() {
            let code = raw_line.split("//").next().unwrap_or("");
            for forbidden in [
                "gi://Meta",
                "gi://Clutter",
                "gi://St",
                "gi://Shell",
                "resource:///org/gnome/shell/",
            ] {
                if code.contains(forbidden) {
                    return Err(format!(
                        "Process-boundary violation: {rel} imports compositor-only '{forbidden}'"
                    ));
                }
            }
        }
    }
    Ok(())
}

#[test]
fn ego_lifecycle_and_mutter_18_19_invariants_hold() -> Result<(), String> {
    let ext_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("extension");
    let ext_js = fs::read_to_string(ext_root.join("extension.js"))
        .map_err(|e| format!("failed to read extension.js: {e}"))?;
    for required in [
        "export default class KelpExtension extends Extension",
        "enable()",
        "disable()",
        "this.unload_theme()",
        "this.ext.destroy()",
        "this.exception_dialog.close()",
    ] {
        if !ext_js.contains(required) {
            return Err(format!(
                "extension.js missing required lifecycle construct: {required}"
            ));
        }
    }

    let stack_widgets = fs::read_to_string(ext_root.join("ui/stack_widgets.js"))
        .map_err(|e| format!("failed to read ui/stack_widgets.js: {e}"))?;
    if !stack_widgets.contains("c.hint_signal")
        || !stack_widgets.contains("disconnect(c.hint_signal)")
    {
        return Err("ui/stack_widgets.js must track and disconnect c.hint_signal".to_string());
    }

    let exc_dialog = fs::read_to_string(ext_root.join("ui/exception_dialog.js"))
        .map_err(|e| format!("failed to read ui/exception_dialog.js: {e}"))?;
    if !exc_dialog.contains("destroyOnClose: true") {
        return Err("ui/exception_dialog.js must set destroyOnClose: true".to_string());
    }

    let meta_json = fs::read_to_string(ext_root.join("metadata.json"))
        .map_err(|e| format!("failed to read metadata.json: {e}"))?;
    for ver in [
        "\"45\"", "\"46\"", "\"47\"", "\"48\"", "\"49\"", "\"50\"", "\"51\"",
    ] {
        if !meta_json.contains(ver) {
            return Err(format!("metadata.json missing shell-version {ver}"));
        }
    }

    if EXTENSION_FILES.len() < 35 {
        return Err(format!(
            "expected EXTENSION_FILES to embed >= 35 files, found {}",
            EXTENSION_FILES.len()
        ));
    }
    Ok(())
}
