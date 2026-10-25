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
                    "Forbidden `var` in {}:{} -> {raw_line}",
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
                            "Loose `==` in {}:{} -> {raw_line}",
                            file.display(),
                            line_idx + 1
                        ));
                    }
                }
                if bytes[i] == b'!'
                    && bytes[i + 1] == b'='
                    && (i + 2 >= bytes.len() || bytes[i + 2] != b'=')
                {
                    return Err(format!(
                        "Loose `!=` in {}:{} -> {raw_line}",
                        file.display(),
                        line_idx + 1
                    ));
                }
            }
        }
    }
    Ok(())
}

#[test]
fn prefs_and_shared_settings_never_import_compositor_only_typelibs() -> Result<(), String> {
    let ext_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("extension");
    for rel in [
        "prefs.js",
        "engine/geom/focus.js",
        "engine/geom/rectangle.js",
        "ui/settings/gsettings.js",
        "ui/settings/color.js",
        "ui/settings/log.js",
    ] {
        let path = ext_root.join(rel);
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
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
                        "Process-boundary violation: {rel} imports '{forbidden}'"
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
    let ext_js = fs::read_to_string(ext_root.join("extension.js")).map_err(|e| e.to_string())?;
    for req in [
        "export default class KelpExtension extends Extension",
        "enable()",
        "disable()",
        "this.unload_theme()",
        "this.ext.destroy()",
        "this.exception_dialog.close()",
    ] {
        if !ext_js.contains(req) {
            return Err(format!("extension.js missing: {req}"));
        }
    }

    let sw = fs::read_to_string(ext_root.join("ui/stack_widgets.js")).map_err(|e| e.to_string())?;
    if !sw.contains("c.hint_signal") || !sw.contains("disconnect(c.hint_signal)") {
        return Err("ui/stack_widgets.js must disconnect c.hint_signal".to_string());
    }
    let ed =
        fs::read_to_string(ext_root.join("ui/exception_dialog.js")).map_err(|e| e.to_string())?;
    if !ed.contains("destroyOnClose: true") || EXTENSION_FILES.len() < 35 {
        return Err("exception_dialog or EXTENSION_FILES invariant failed".to_string());
    }
    let meta = fs::read_to_string(ext_root.join("metadata.json")).map_err(|e| e.to_string())?;
    for ver in [
        "\"45\"", "\"46\"", "\"47\"", "\"48\"", "\"49\"", "\"50\"", "\"51\"",
    ] {
        if !meta.contains(ver) {
            return Err(format!("metadata.json missing {ver}"));
        }
    }
    let schema =
        fs::read_to_string(ext_root.join("schemas/org.gnome.shell.extensions.kelp.gschema.xml"))
            .map_err(|e| e.to_string())?;
    for req in [
        "name=\"enable-shortcuts\"",
        "name=\"tile-move-left-global\"",
        "name=\"kelp-monitor-left\"",
        "name=\"kelp-workspace-up\"",
        "'rgb(255,0,0)'",
    ] {
        if !schema.contains(req) {
            return Err(format!("schema XML missing {req}"));
        }
    }
    let ind =
        fs::read_to_string(ext_root.join("ui/panel_indicator.js")).map_err(|e| e.to_string())?;
    for req in [
        "Keyboard Shortcuts",
        "Focus Follows Mouse",
        "Retile Workspace",
        "Smart Gaps",
        "addToStatusArea('kelp'",
        "icons/kelp-auto-on-symbolic.svg",
    ] {
        if !ind.contains(req) {
            return Err(format!("ui/panel_indicator.js missing {req}"));
        }
    }
    run_gjs_runtime_smoke_test(&ext_root)
}

fn run_gjs_runtime_smoke_test(ext_root: &Path) -> Result<(), String> {
    let dir = std::env::temp_dir().join(format!("kelp-gjs-schema-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::copy(
        ext_root.join("schemas/org.gnome.shell.extensions.kelp.gschema.xml"),
        dir.join("org.gnome.shell.extensions.kelp.gschema.xml"),
    )
    .map_err(|e| e.to_string())?;
    if !std::process::Command::new("glib-compile-schemas")
        .arg(&dir)
        .status()
        .map_err(|e| e.to_string())?
        .success()
    {
        return Err("glib-compile-schemas failed".to_string());
    }
    let script_path = dir.join("smoke.js");
    let script = format!(
        "import Gio from 'gi://Gio';\n\
         import {{ ExtensionSettings }} from 'file://{ext}/ui/settings/gsettings.js';\n\
         import {{ Config, DEFAULT_FLOAT_RULES }} from 'file://{ext}/ui/settings/float_rules.js';\n\
         import {{ ExtEvent, GlobalEvent }} from 'file://{ext}/engine/ecs/events.js';\n\
         import {{ WakeupExecutor }} from 'file://{ext}/engine/ecs/executor.js';\n\
         import * as Ecs from 'file://{ext}/engine/ecs/world.js';\n\
         const src = Gio.SettingsSchemaSource.new_from_directory('{schema}', Gio.SettingsSchemaSource.get_default(), false);\n\
         const s = new ExtensionSettings(new Gio.Settings({{ settings_schema: src.lookup('org.gnome.shell.extensions.kelp', true) }}));\n\
         if (!s.enable_shortcuts() || !s.stacking_with_mouse() || typeof s.focus_follows_mouse() !== 'boolean') throw new Error('settings');\n\
         if (DEFAULT_FLOAT_RULES.length < 5 || !new Config().window_shall_float('steam', 'Steam')) throw new Error('float');\n\
         const w = new Ecs.World(); const st = w.register_storage(); st.insert(w.create_entity(), 42);\n\
         if ([...st.drain()].length !== 1 || ExtEvent.Changes().kind !== GlobalEvent.Changes) throw new Error('ecs');\n\
         new WakeupExecutor().stop();\n",
        ext = ext_root.display(),
        schema = dir.display()
    );
    fs::write(&script_path, script).map_err(|e| e.to_string())?;
    let status = std::process::Command::new("gjs")
        .arg("-m")
        .arg(&script_path)
        .status()
        .map_err(|e| e.to_string())?;
    let _ = fs::remove_dir_all(&dir);
    if !status.success() {
        return Err(format!("gjs -m smoke test failed: {status}"));
    }
    Ok(())
}
