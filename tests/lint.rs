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
        "ui/settings/prefs_pages.js",
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
    let combined = [
        "extension.js",
        "prefs.js",
        "ui/settings/prefs_pages.js",
        "ui/stack_widgets.js",
        "window/controller_display.js",
        "ui/exception_dialog.js",
        "metadata.json",
        "schemas/org.gnome.shell.extensions.kelp.gschema.xml",
        "ui/panel_indicator.js",
    ]
    .into_iter()
    .map(read)
    .collect::<Result<Vec<_>, _>>()?
    .join("\n");
    if EXTENSION_FILES.len() < 37 {
        return Err("EXTENSION_FILES invariant failed".to_string());
    }
    #[rustfmt::skip]
    check_contains(
        "EGO lifecycle & Mutter 18/19 invariants",
        &combined,
        &[
            "export default class KelpExtension extends Extension",
            "this.unload_theme()", "this.ext.destroy()", "this.exception_dialog.close()",
            "fillPreferencesWindow(window)", "Adw.PreferencesPage", "close-request",
            "Settings & About…", "openPreferences", "Star on GitHub", "Donate / Sponsor",
            "c.hint_signal", "disconnect(c.hint_signal)", "notify::demands-attention",
            "restore_edge_tiling", "destroyOnClose: true", "\"45\"", "\"51\"",
            "name=\"tiling-mode\"", "name=\"enable-shortcuts\"", "name=\"active-hint-size\"",
            "name=\"tile-move-left-global\"", "name=\"kelp-monitor-left\"", "name=\"kelp-workspace-up\"",
            "'rgb(255,0,0)'", "Octopus (2D Grid)", "Seahorse (Scrolling Strip)", "Otter (Floating)",
            "Keyboard Shortcuts", "Focus Follows Mouse", "Retile Workspace", "Smart Gaps",
            "addToStatusArea('kelp'", "this._clickGesture.set_enabled(false)",
            "button-press-event", "scroll-event", "touch-event",
            "icons/kelp-octopus-symbolic.svg", "icons/kelp-seahorse-symbolic.svg", "icons/kelp-otter-symbolic.svg",
        ],
    )?;
    if read("ui/panel_indicator.js")?.contains("vfunc_event") {
        return Err("panel_indicator.js must not override or call vfunc_event".to_string());
    }
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
        "import Gio from 'gi://Gio'; import {{ ExtensionSettings, TILING_MODES }} from 'file://{ext}/ui/settings/gsettings.js'; import {{ Config, DEFAULT_FLOAT_RULES }} from 'file://{ext}/ui/settings/float_rules.js'; import {{ BORDER_PRESETS }} from 'file://{ext}/ui/settings/prefs_pages.js';\n\
         import {{ ExtEvent, GlobalEvent }} from 'file://{ext}/engine/ecs/events.js'; import {{ WakeupExecutor }} from 'file://{ext}/engine/ecs/executor.js'; import {{ Arena }} from 'file://{ext}/engine/ecs/arena.js'; import * as Ecs from 'file://{ext}/engine/ecs/world.js';\n\
         import {{ Orientation, Rectangle }} from 'file://{ext}/engine/geom/rectangle.js'; import {{ Fork }} from 'file://{ext}/engine/octopus/fork.js'; import {{ Node }} from 'file://{ext}/engine/octopus/node.js'; import {{ cascade_otter_windows, is_full_work_area_rect, snap_otter_window }} from 'file://{ext}/engine/otter/otter_tiler.js'; import {{ SeahorseTiler }} from 'file://{ext}/engine/seahorse/seahorse_tiler.js';\n\
         const src = Gio.SettingsSchemaSource.new_from_directory('{schema}', Gio.SettingsSchemaSource.get_default(), false);\n\
         const s = new ExtensionSettings(new Gio.Settings({{ settings_schema: src.lookup('org.gnome.shell.extensions.kelp', true), backend: Gio.memory_settings_backend_new() }}));\n\
         if (s.tiling_mode() !== 'octopus' || TILING_MODES.length !== 3 || BORDER_PRESETS.length !== 4) throw new Error('mode default');\n\
         s.set_tiling_mode('seahorse'); if (s.tiling_mode() !== 'seahorse' || !s.tile_by_default()) throw new Error('seahorse mode');\n\
         s.set_tiling_mode('otter'); if (s.tiling_mode() !== 'otter' || s.tile_by_default()) throw new Error('otter mode');\n\
         s.set_tile_by_default(true); if (s.tiling_mode() !== 'octopus') throw new Error('restore octopus');\n\
         s.set_active_hint_size(5); if (s.active_hint_size() !== 5) throw new Error('active_hint_size'); s.set_active_hint_size(2);\n\
         const cfg_res = Config.from_json('{{\"__proto__\":{{\"polluted\":true}},\"float\":[{{\"class\":\"test\"}}]}}'); if (cfg_res.kind !== 1 || ({{}}).polluted || cfg_res.value.float.length !== 1) throw new Error('config proto guard');\n\
         if (!s.enable_shortcuts() || !s.stacking_with_mouse() || typeof s.focus_follows_mouse() !== 'boolean' || s.gap_inner() !== 6 || s.gap_outer() !== 6 || s.active_hint_border_radius() !== 2 || s.active_hint_size() !== 2) throw new Error('settings'); if (DEFAULT_FLOAT_RULES.length < 5 || !new Config().window_shall_float('steam', 'Steam') || !new Config().window_shall_float('com.rastersoft.ding', 'Desktop Icons 1')) throw new Error('float');\n\
         const w = new Ecs.World(); const e_old = w.create_entity(); w.delete_entity(e_old); w.delete_entity(e_old); if (w.free !== 1) throw new Error('double-free guard'); const e_reused = w.create_entity(); if (e_old === e_reused || e_old[1] !== 0 || e_reused[1] !== 1) throw new Error('entity tuple immutability');\n\
         const ar = new Arena(); const a0 = ar.insert('x'), a1 = ar.insert('y'); ar.remove(a1); ar.truncate(1); if (ar.unused.length !== 0 || ar.get(a0) !== 'x') throw new Error('arena truncate');\n\
         const fk = new Fork(e_reused, Node.window(e_reused), Node.window(e_old), new Rectangle([100, 200, 800, 600]), 0, 0, Orientation.HORIZONTAL); const r_right = fk.area_of_right({{ gap_inner_half: 2, gap_inner: 4 }}); if (r_right.x !== 502 || r_right.width !== 398 || r_right.y !== 200) throw new Error('fork area_of_right math');\n\
         const fk_small = new Fork(e_reused, Node.window(e_reused), Node.window(e_old), new Rectangle([15, 0, 128, 128]), 0, 0, Orientation.HORIZONTAL); fk_small.set_ratio(96); const recs = []; fk_small.measure({{ forks: new Map() }}, {{ grab_op: null, tiler: {{ resizing_window: false }}, gap_inner_half: 0 }}, fk_small.area, (_e, _p, r) => recs.push(r)); if (recs[1].width < 32) throw new Error('fork snap right sibling degenerate');\n\
         const st = w.register_storage(); const sh = new SeahorseTiler(st); const e1 = w.create_entity(), e2 = w.create_entity(), e3 = w.create_entity(), e4 = w.create_entity(), e5 = w.create_entity(); let blocked_moves = 0, last_peeks = null;\n\
         const mk = (ent) => ({{ entity: ent, ws: [0, 0], rects: [], shown: true, actor_ok: true, dying: false, actor_exists: function() {{ return this.actor_ok && !this.dying; }}, rect: function() {{ return this.rects[this.rects.length - 1] ?? new Rectangle([0, 0, 500, 500]); }}, meta: {{ minimized: false, in_destruction: function() {{ return w.windows.get(ent).dying; }}, get_monitor: () => 0, get_compositor_private: () => ({{ show: () => {{ w.windows.get(ent).shown = true; }}, hide: () => {{ w.windows.get(ent).shown = false; }} }}) }}, workspace_id: () => w.windows.get(ent).ws[1], is_tilable: () => true, move: (_x, r, cb) => {{ w.windows.get(ent).rects.push(r); if (cb) cb(); }}, activate: () => {{ f = w.windows.get(ent); }} }});\n\
         w.windows = w.register_storage(); w.windows.insert(e1, mk(e1)); w.windows.insert(e2, mk(e2)); w.windows.insert(e3, mk(e3)); w.windows.insert(e4, mk(e4)); w.windows.insert(e5, mk(e5)); let f = w.windows.get(e1); let cur_x = 100, active_ws = 0; const tags = new Set();\n\
         const fake_ext = {{ windows: w.windows, gap_outer: 2, gap_inner: 2, settings: {{ smart_gaps: () => false }}, conf: {{ window_shall_float: (c) => c === 'steam' }}, cursor_status: () => [{{ x: cur_x, y: 100 }}, 0], active_workspace: () => active_ws, should_ignore_workspace: () => false, workspace_id: (win) => win?.ws ?? [0, active_ws], monitor_work_area: () => new Rectangle([0, 0, 1000, 500]), focus_window: () => f, on_focused: (nw) => {{ f = nw; }}, show_border_on_focused: () => {{}}, size_signals_block: () => {{ blocked_moves += 1; }}, size_signals_unblock: () => {{}}, sync_seahorse_peeks: (_id, p) => {{ last_peeks = p; }}, clear_seahorse_peeks: () => {{ last_peeks = null; }}, register_fn: (cb) => cb(), contains_tag: (e, t) => tags.has(`${{e[0]}}:${{t}}`), add_tag: (e, t) => tags.add(`${{e[0]}}:${{t}}`), delete_tag: (e, t) => tags.delete(`${{e[0]}}:${{t}}`) }};\n\
         sh.auto_tile(fake_ext, w.windows.get(e1), false); if (w.windows.get(e1).rect().width !== 996) throw new Error('seahorse 1/1 full width');\n\
         sh.auto_tile(fake_ext, w.windows.get(e2), false); if (w.windows.get(e1).rect().width !== 497 || w.windows.get(e2).rect().width !== 497) throw new Error('seahorse 1/2 width');\n\
         sh.auto_tile(fake_ext, w.windows.get(e3), false); if (!w.windows.get(e1).shown || !w.windows.get(e2).shown || !w.windows.get(e3).shown || w.windows.get(e1).rect().width !== 330 || last_peeks?.left || last_peeks?.right) throw new Error('seahorse 1/3 width for 3 windows');\n\
         sh.auto_tile(fake_ext, w.windows.get(e4), false); if (w.windows.get(e1).shown || !w.windows.get(e2).shown || !w.windows.get(e3).shown || !w.windows.get(e4).shown || blocked_moves === 0 || !last_peeks?.left || last_peeks?.right) throw new Error('seahorse 4th window slides strip left & shows left peek');\n\
         f = w.windows.get(e4); sh.focus_step(fake_ext, -1, true); if (f !== w.windows.get(e1) || sh._strip([0, 0]).scroll !== 0) throw new Error('seahorse left peek jumps directly to off-screen left window');\n\
         f = w.windows.get(e1); sh.focus_step(fake_ext, 1, true); if (f !== w.windows.get(e4) || sh._strip([0, 0]).scroll !== 1) throw new Error('seahorse right peek jumps directly to off-screen right window');\n\
         sh.auto_tile(fake_ext, w.windows.get(e5), false); f = w.windows.get(e5); w.windows.get(e3).dying = true; sh.on_focused(fake_ext, w.windows.get(e5)); if (sh._strip([0, 0]).scroll !== 1 || !w.windows.get(e2).shown || !w.windows.get(e4).shown || !w.windows.get(e5).shown || f !== w.windows.get(e5) || sh._strip([0, 0]).active !== 3) throw new Error('seahorse closing non-active window preserves active focus while sliding left');\n\
         sh.detach_window(fake_ext, e5, true); w.windows.get(e3).dying = false; sh.auto_tile(fake_ext, w.windows.get(e3), true);\n\
         f = w.windows.get(e2); sh.focus_step(fake_ext, -1); if (!w.windows.get(e1).shown || !w.windows.get(e2).shown || !w.windows.get(e4).shown || w.windows.get(e3).shown || last_peeks?.left || !last_peeks?.right) throw new Error('seahorse scroll left & right peek');\n\
         sh.detach_window(fake_ext, e1, true); if (sh._strip([0, 0]).cols[0] !== e2 || !w.windows.get(e2).shown || !w.windows.get(e4).shown || !w.windows.get(e3).shown || f !== w.windows.get(e2)) throw new Error('seahorse close left active window slides right windows left');\n\
         sh.auto_tile(fake_ext, w.windows.get(e1), true); sh.focus_step(fake_ext, -2);\n\
         const w0_before = w.windows.get(e2).rect().width; sh.resize_column(fake_ext, 1, w.windows.get(e2)); if (w.windows.get(e2).rect().width <= w0_before) throw new Error('seahorse resize_column');\n\
         w.windows.get(e2).rects.push(new Rectangle([0, 0, 600, 500])); sh.on_resize(fake_ext, w.windows.get(e2)); if (w.windows.get(e2).rect().width <= 500) throw new Error('seahorse on_resize');\n\
         sh.toggle_orientation(fake_ext, w.windows.get(e2)); if (!w.windows.get(e2).shown || w.windows.get(e4).shown) throw new Error('seahorse full-width toggle');\n\
         sh.toggle_orientation(fake_ext, w.windows.get(e2)); f = w.windows.get(e4); sh.move_step(fake_ext, -1); if (sh._strip([0, 0]).cols[0] !== e4) throw new Error('seahorse move_step');\n\
         sh.ratios.set(sh._entity_key(e4), 1.75); cur_x = 900; sh.on_drop(fake_ext, w.windows.get(e4)); if (sh._strip([0, 0]).cols[2] !== e4 || sh._weight(e4) !== 1.75) throw new Error('seahorse on_drop 3rd column & ratio preservation');\n\
         w.windows.get(e3).ws = [0, 1]; w.windows.get(e3).shown = false; sh.overview_show(fake_ext, true); if (!w.windows.get(e3).shown || !w.windows.get(e2).shown) throw new Error('all unminimized windows must be shown in overview for ClutterClone'); sh.overview_show(fake_ext, false); if (w.windows.get(e3).shown) throw new Error('inactive ws must be hidden on overview hide');\n\
         sh.destroy(fake_ext); if (w.windows.get(e3).shown || !w.windows.get(e2).shown || !w.windows.get(e4).shown) throw new Error('seahorse destroy must only show active workspace windows');\n\
         w.windows.get(e1).floating_rect = new Rectangle([0, 0, 1000, 500]); w.windows.get(e2).floating_rect = new Rectangle([2, 2, 996, 496]); cascade_otter_windows(fake_ext); if (!is_full_work_area_rect(new Rectangle([2, 2, 996, 496]), new Rectangle([0, 0, 1000, 500]), 2) || w.windows.get(e1).floating_rect.width >= 900 || w.windows.get(e1).floating_rect.x === w.windows.get(e2).floating_rect.x) throw new Error('otter cascade must replace full-screen rects and stagger siblings'); snap_otter_window(fake_ext, 0); new WakeupExecutor().stop();\n",
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
