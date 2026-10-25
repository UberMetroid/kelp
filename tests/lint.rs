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

fn check_contains(label: &str, text: &str, reqs: &[&str]) -> Result<(), String> {
    for req in reqs {
        if !text.contains(req) {
            return Err(format!("{label} missing: {req}"));
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

    let legacy = [
        "imports.gi",
        "imports.ui",
        "imports.misc",
        "ExtensionUtils",
        "Meta.LaterType",
        "Clutter.Container",
    ];
    for file in &js_files {
        let disp = file.display();
        let content = fs::read_to_string(file).map_err(|e| format!("read {disp}: {e}"))?;
        for sym in legacy {
            if content.contains(sym) {
                return Err(format!("Forbidden legacy symbol '{sym}' in {disp}"));
            }
        }
        for (idx, raw) in content.lines().enumerate() {
            let ln = idx + 1;
            let code = raw.split("//").next().unwrap_or("");
            if code.trim_start().starts_with("var ")
                || code.contains(" var ")
                || code.contains("(var ")
            {
                return Err(format!("Forbidden `var` in {disp}:{ln} -> {raw}"));
            }
            let b = code.as_bytes();
            for i in 0..b.len().saturating_sub(1) {
                let prev_eq = i > 0 && matches!(b[i - 1], b'=' | b'!' | b'<' | b'>');
                let next_eq = i + 2 < b.len() && b[i + 2] == b'=';
                if b[i] == b'=' && b[i + 1] == b'=' && !prev_eq && !next_eq {
                    return Err(format!("Loose `==` in {disp}:{ln} -> {raw}"));
                }
                if b[i] == b'!' && b[i + 1] == b'=' && !next_eq {
                    return Err(format!("Loose `!=` in {disp}:{ln} -> {raw}"));
                }
            }
        }
    }
    Ok(())
}

#[test]
fn prefs_and_shared_settings_never_import_compositor_only_typelibs() -> Result<(), String> {
    let ext_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("extension");
    let shared = [
        "prefs.js",
        "engine/geom/focus.js",
        "engine/geom/rectangle.js",
        "engine/otter/otter_tiler.js",
        "engine/seahorse/seahorse_tiler.js",
        "ui/settings/gsettings.js",
        "ui/settings/color.js",
        "ui/settings/log.js",
    ];
    let compositor_only = [
        "gi://Meta",
        "gi://Clutter",
        "gi://St",
        "gi://Shell",
        "resource:///org/gnome/shell/",
    ];
    for rel in shared {
        let content = fs::read_to_string(ext_root.join(rel)).map_err(|e| e.to_string())?;
        for raw_line in content.lines() {
            let code = raw_line.split("//").next().unwrap_or("");
            for sym in compositor_only {
                if code.contains(sym) {
                    return Err(format!("Process-boundary violation: {rel} imports '{sym}'"));
                }
            }
        }
    }
    Ok(())
}

#[test]
fn ego_lifecycle_and_mutter_18_19_invariants_hold() -> Result<(), String> {
    let ext_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("extension");
    let read = |rel: &str| fs::read_to_string(ext_root.join(rel)).map_err(|e| e.to_string());

    check_contains(
        "extension.js",
        &read("extension.js")?,
        &[
            "export default class KelpExtension extends Extension",
            "enable()",
            "disable()",
            "this.unload_theme()",
            "this.ext.destroy()",
            "this.exception_dialog.close()",
        ],
    )?;
    check_contains(
        "ui/stack_widgets.js",
        &read("ui/stack_widgets.js")?,
        &["c.hint_signal", "disconnect(c.hint_signal)"],
    )?;
    if !read("ui/exception_dialog.js")?.contains("destroyOnClose: true")
        || EXTENSION_FILES.len() < 36
    {
        return Err("exception_dialog or EXTENSION_FILES invariant failed".to_string());
    }
    check_contains(
        "metadata.json",
        &read("metadata.json")?,
        &[
            "\"45\"", "\"46\"", "\"47\"", "\"48\"", "\"49\"", "\"50\"", "\"51\"",
        ],
    )?;
    check_contains(
        "schema XML",
        &read("schemas/org.gnome.shell.extensions.kelp.gschema.xml")?,
        &[
            "name=\"tiling-mode\"",
            "'octopus'",
            "name=\"enable-shortcuts\"",
            "name=\"tile-move-left-global\"",
            "name=\"kelp-monitor-left\"",
            "name=\"kelp-workspace-up\"",
            "'rgb(255,0,0)'",
        ],
    )?;
    check_contains(
        "ui/panel_indicator.js",
        &read("ui/panel_indicator.js")?,
        &[
            "Octopus (2D Grid)",
            "Seahorse (Scrolling Strip)",
            "Otter (Floating)",
            "Keyboard Shortcuts",
            "Focus Follows Mouse",
            "Retile Workspace",
            "Smart Gaps",
            "addToStatusArea('kelp'",
            "icons/kelp-octopus-symbolic.svg",
            "icons/kelp-seahorse-symbolic.svg",
            "icons/kelp-otter-symbolic.svg",
        ],
    )?;
    run_gjs_runtime_smoke_test(&ext_root)
}

fn run_gjs_runtime_smoke_test(ext_root: &Path) -> Result<(), String> {
    let dir = std::env::temp_dir().join(format!("kelp-gjs-schema-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let schema = "org.gnome.shell.extensions.kelp.gschema.xml";
    fs::copy(ext_root.join("schemas").join(schema), dir.join(schema)).map_err(|e| e.to_string())?;
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
        "import Gio from 'gi://Gio'; import {{ ExtensionSettings, TILING_MODES }} from 'file://{ext}/ui/settings/gsettings.js'; import {{ Config, DEFAULT_FLOAT_RULES }} from 'file://{ext}/ui/settings/float_rules.js';\n\
         import {{ ExtEvent, GlobalEvent }} from 'file://{ext}/engine/ecs/events.js'; import {{ WakeupExecutor }} from 'file://{ext}/engine/ecs/executor.js'; import {{ Arena }} from 'file://{ext}/engine/ecs/arena.js'; import * as Ecs from 'file://{ext}/engine/ecs/world.js';\n\
         import {{ Orientation, Rectangle }} from 'file://{ext}/engine/geom/rectangle.js'; import {{ Fork }} from 'file://{ext}/engine/octopus/fork.js'; import {{ Node }} from 'file://{ext}/engine/octopus/node.js'; import {{ cascade_otter_windows, snap_otter_window }} from 'file://{ext}/engine/otter/otter_tiler.js'; import {{ SeahorseTiler }} from 'file://{ext}/engine/seahorse/seahorse_tiler.js';\n\
         const src = Gio.SettingsSchemaSource.new_from_directory('{schema}', Gio.SettingsSchemaSource.get_default(), false);\n\
         const s = new ExtensionSettings(new Gio.Settings({{ settings_schema: src.lookup('org.gnome.shell.extensions.kelp', true), backend: Gio.memory_settings_backend_new() }}));\n\
         if (s.tiling_mode() !== 'octopus' || TILING_MODES.length !== 3) throw new Error('mode default');\n\
         s.set_tiling_mode('seahorse'); if (s.tiling_mode() !== 'seahorse' || !s.tile_by_default()) throw new Error('seahorse mode');\n\
         s.set_tiling_mode('otter'); if (s.tiling_mode() !== 'otter' || s.tile_by_default()) throw new Error('otter mode');\n\
         s.set_tile_by_default(true); if (s.tiling_mode() !== 'octopus') throw new Error('restore octopus');\n\
         if (!s.enable_shortcuts() || !s.stacking_with_mouse() || typeof s.focus_follows_mouse() !== 'boolean') throw new Error('settings'); if (DEFAULT_FLOAT_RULES.length < 5 || !new Config().window_shall_float('steam', 'Steam')) throw new Error('float');\n\
         const w = new Ecs.World(); const e_old = w.create_entity(); w.delete_entity(e_old); const e_reused = w.create_entity(); if (e_old === e_reused || e_old[1] !== 0 || e_reused[1] !== 1) throw new Error('entity tuple immutability');\n\
         const ar = new Arena(); const a0 = ar.insert('x'), a1 = ar.insert('y'); ar.remove(a1); ar.truncate(1); if (ar.unused.length !== 0 || ar.get(a0) !== 'x') throw new Error('arena truncate');\n\
         const fk = new Fork(e_reused, Node.window(e_reused), Node.window(e_old), new Rectangle([100, 200, 800, 600]), 0, 0, Orientation.HORIZONTAL); const r_right = fk.area_of_right({{ gap_inner_half: 2, gap_inner: 4 }}); if (r_right.x !== 502 || r_right.width !== 398 || r_right.y !== 200) throw new Error('fork area_of_right math');\n\
         const st = w.register_storage(); const sh = new SeahorseTiler(st); const e1 = w.create_entity(), e2 = w.create_entity(), e3 = w.create_entity();\n\
         const mk = (ent) => ({{ entity: ent, ws: [0, 0], rects: [], shown: true, meta: {{ minimized: false, get_monitor: () => 0, get_compositor_private: () => ({{ show: () => {{ w.windows.get(ent).shown = true; }}, hide: () => {{ w.windows.get(ent).shown = false; }} }}) }}, workspace_id: () => w.windows.get(ent).ws[1], is_tilable: () => true, move: (_x, r) => {{ w.windows.get(ent).rects.push(r); }}, activate: () => {{}} }});\n\
         w.windows = w.register_storage(); w.windows.insert(e1, mk(e1)); w.windows.insert(e2, mk(e2)); w.windows.insert(e3, mk(e3)); let f = w.windows.get(e1); let cur_x = 100, active_ws = 0; const tags = new Set();\n\
         const fake_ext = {{ windows: w.windows, gap_outer: 2, gap_inner: 2, settings: {{ smart_gaps: () => false }}, conf: {{ window_shall_float: (c) => c === 'steam' }}, cursor_status: () => [{{ x: cur_x, y: 100 }}, 0], active_workspace: () => active_ws, should_ignore_workspace: () => false, workspace_id: (win) => win?.ws ?? [0, active_ws], monitor_work_area: () => new Rectangle([0, 0, 1000, 500]), focus_window: () => f, on_focused: (nw) => {{ f = nw; }}, show_border_on_focused: () => {{}}, register_fn: (cb) => cb(), contains_tag: (e, t) => tags.has(`${{e[0]}}:${{t}}`), add_tag: (e, t) => tags.add(`${{e[0]}}:${{t}}`), delete_tag: (e, t) => tags.delete(`${{e[0]}}:${{t}}`) }};\n\
         sh.auto_tile(fake_ext, w.windows.get(e1), false); sh.auto_tile(fake_ext, w.windows.get(e2), false); sh.auto_tile(fake_ext, w.windows.get(e3), false); if (w.windows.get(e1).shown || !w.windows.get(e2).shown || !w.windows.get(e3).shown) throw new Error('seahorse viewport hide/show');\n\
         f = w.windows.get(e2); sh.focus_step(fake_ext, -1); if (!w.windows.get(e1).shown || !w.windows.get(e2).shown || w.windows.get(e3).shown) throw new Error('seahorse scroll left');\n\
         sh.toggle_orientation(fake_ext, w.windows.get(e1)); if (!w.windows.get(e1).shown || w.windows.get(e2).shown) throw new Error('seahorse full-width toggle');\n\
         sh.toggle_orientation(fake_ext, w.windows.get(e1)); f = w.windows.get(e2); sh.move_step(fake_ext, -1); if (sh._strip([0, 0]).cols[0] !== e2) throw new Error('seahorse move_step');\n\
         cur_x = 900; sh.on_drop(fake_ext, w.windows.get(e2)); if (sh._strip([0, 0]).cols[1] !== e2) throw new Error('seahorse on_drop');\n\
         w.windows.get(e3).ws = [0, 1]; w.windows.get(e3).shown = false; sh.overview_show(fake_ext, true); if (w.windows.get(e3).shown) throw new Error('inactive ws shown in overview'); sh.overview_show(fake_ext, false);\n\
         sh.destroy(fake_ext); cascade_otter_windows(fake_ext); snap_otter_window(fake_ext, 0); if (!w.windows.get(e1).floating_rect || w.windows.get(e3).shown) throw new Error('otter cascade/snap'); new WakeupExecutor().stop();\n",
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
    status
        .success()
        .then_some(())
        .ok_or_else(|| format!("gjs -m smoke test failed: {status}"))
}
