// SPDX-License-Identifier: GPL-3.0-or-later
// Zero-dependency GJS architectural lint, Page Rule, EGO boundary, and headless behavioral test suite.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { ExtensionSettings, TILING_MODES } from '../extension/ui/settings/gsettings.js';
import { Config, DEFAULT_FLOAT_RULES, MAX_CONFIG_BYTES } from '../extension/ui/settings/float_rules.js';
import { BORDER_PRESETS } from '../extension/ui/settings/prefs_pages.js';
import { GLibExecutor, MAX_EVENTS_PER_TICK, WakeupExecutor } from '../extension/engine/ecs/executor.js';
import { Arena } from '../extension/engine/ecs/arena.js';
import * as Ecs from '../extension/engine/ecs/world.js';
import { Orientation, Rectangle } from '../extension/engine/geom/rectangle.js';
import { Fork } from '../extension/engine/octopus/fork.js';
import { Forest } from '../extension/engine/octopus/forest.js';
import { Node } from '../extension/engine/octopus/node.js';
import { cascade_otter_windows, is_full_work_area_rect, snap_otter_window } from '../extension/engine/otter/otter_tiler.js';
import { SeahorseTiler } from '../extension/engine/seahorse/seahorse_tiler.js';

const BANNED_STEMS = new Set(['util', 'utils', 'lib', 'helper', 'helpers', 'common', 'misc', 'shared', 'base', 'core', 'types', 'mod']);
const DECODER = new TextDecoder('utf-8');
const REPO_ROOT = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_path();
const EXT_ROOT = GLib.build_filenamev([REPO_ROOT, 'extension']);

function assert(cond, msg) { if (!cond) throw new Error(`Verification failed: ${msg}`); }

function read_text(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    assert(ok, `failed to read ${path}`); return DECODER.decode(bytes);
}

function walk_repo(dir_path, js_files, dirs) {
    dirs.push(dir_path);
    const enumerator = Gio.File.new_for_path(dir_path).enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
    let info;
    while ((info = enumerator.next_file(null)) !== null) {
        const name = info.get_name(), full = GLib.build_filenamev([dir_path, name]);
        if (name.startsWith('.') || name === 'dist' || name === 'target') continue;
        if (info.get_file_type() === Gio.FileType.DIRECTORY) walk_repo(full, js_files, dirs);
        else if (name.endsWith('.js')) js_files.push(full);
    }
    enumerator.close(null);
}

function verify_page_rules_and_lint(js_files, dirs) {
    assert(js_files.length >= 36, `expected >= 36 .js files, found ${js_files.length}`);
    const legacy = ['imports.gi', 'imports.ui', 'imports.misc', 'ExtensionUtils', 'Meta.LaterType', 'Clutter.Container'];
    for (const file of js_files) {
        const content = read_text(file);
        const lines = content.endsWith('\n') ? content.slice(0, -1).split('\n') : content.split('\n');
        assert(lines.length >= 16 && lines.length <= 256, `Page Rule violation: ${file} has ${lines.length} lines (16..=256)`);
        assert(lines[0] === '// SPDX-License-Identifier: GPL-3.0-or-later', `Missing SPDX header in ${file}`);
        assert(lines[1].startsWith('// ') && lines[1].length >= 12, `Missing concise module description on line 2 of ${file}`);
        if (file.startsWith(EXT_ROOT)) for (const sym of legacy) assert(!content.includes(sym), `Forbidden legacy symbol '${sym}' in ${file}`);
        for (let idx = 0; idx < lines.length; idx += 1) {
            const raw = lines[idx], ln = idx + 1, code = raw.split('//')[0];
            assert(raw.length <= 200, `Line ${ln} of ${file} exceeds 200 chars (${raw.length})`);
            if (!file.startsWith(EXT_ROOT)) continue;
            assert(!code.trimStart().startsWith('var ') && !code.includes(' var ') && !code.includes('(var '), `Forbidden var in ${file}:${ln}`);
            for (let i = 0; i < code.length - 1; i += 1) {
                const prev = i > 0 ? code[i - 1] : '';
                const prev_eq = prev === '=' || prev === '!' || prev === '<' || prev === '>';
                const next_eq = i + 2 < code.length && code[i + 2] === '=';
                assert(!(code[i] === '=' && code[i + 1] === '=' && !prev_eq && !next_eq), `Loose == in ${file}:${ln}`);
                assert(!(code[i] === '!' && code[i + 1] === '=' && !next_eq), `Loose != in ${file}:${ln}`);
            }
        }
    }
    for (const dir_path of dirs) {
        const enumerator = Gio.File.new_for_path(dir_path).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        const visible = [];
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            const name = info.get_name();
            if (!name.startsWith('.') && name !== 'dist' && name !== 'target') visible.push(name);
        }
        enumerator.close(null);
        assert(visible.length <= 8, `Directory density violation: ${dir_path} has ${visible.length} visible entries (max 8): ${visible.join(', ')}`);
        for (const name of visible) {
            const stem = (name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name).toLowerCase();
            assert(!BANNED_STEMS.has(stem), `Banned generic name '${name}' in ${dir_path}`);
        }
    }
}

function verify_process_boundaries_and_invariants() {
    const shared = new Set(['prefs.js', 'engine/geom/focus.js', 'engine/geom/movement.js', 'engine/geom/rectangle.js',
        'engine/octopus/forest.js', 'engine/otter/otter_tiler.js', 'engine/seahorse/seahorse_tiler.js',
        'ui/settings/gsettings.js', 'ui/settings/color.js', 'ui/settings/log.js', 'ui/settings/prefs_pages.js']);
    const queue = Array.from(shared), compositor_only = ['gi://Meta', 'gi://Clutter', 'gi://St', 'gi://Shell', 'resource:///org/gnome/shell/'];
    while (queue.length > 0) {
        const rel = queue.pop(), full = GLib.build_filenamev([EXT_ROOT, rel]), dir = Gio.File.new_for_path(full).get_parent();
        for (const raw of read_text(full).split('\n')) {
            const trimmed = raw.trimStart();
            if (trimmed.startsWith('//')) continue;
            for (const sym of compositor_only) assert(!trimmed.includes(sym), `Process-boundary violation: ${rel} imports '${sym}'`);
            const m = trimmed.match(/from\s+['"](\.[^'"]+)['"]/), target = m ? dir.resolve_relative_path(m[1]).get_path() : null;
            if (target?.startsWith(`${EXT_ROOT}/`)) {
                const target_rel = target.slice(EXT_ROOT.length + 1);
                if (!shared.has(target_rel)) { shared.add(target_rel); queue.push(target_rel); }
            }
        }
    }
    const check_files = [
        'extension.js', 'prefs.js', 'ui/settings/prefs_pages.js', 'ui/stack_widgets.js',
        'window/controller_display.js', 'ui/exception_dialog.js', 'metadata.json',
        'schemas/org.gnome.shell.extensions.kelp.gschema.xml', 'ui/panel_indicator.js',
    ];
    const combined = check_files.map((rel) => read_text(GLib.build_filenamev([EXT_ROOT, rel]))).join('\n');
    const reqs = [
        'export default class KelpExtension extends Extension', 'this.unload_theme()', 'this.ext.destroy()',
        'this.exception_dialog.close()', 'fillPreferencesWindow(window)', 'Adw.PreferencesPage', 'close-request',
        'Settings & About…', 'openPreferences', 'Star on GitHub', 'GNOME Extensions Page (extensions.gnome.org)',
        'https://extensions.gnome.org/extension/11479/kelp/', 'Default Tiling Mode &amp; Behavior',
        'Support &amp; Community', 'Tuition, Not Coffee — Help send my daughter to college',
        'https://ubermetroid.github.io/tuition-not-coffee', 'c.hint_signal', 'disconnect(c.hint_signal)',
        'notify::demands-attention', 'restore_edge_tiling', 'destroyOnClose: true', '"45"', '"50"',
        'name="tiling-mode"', 'name="enable-shortcuts"', 'name="active-hint-size"', 'name="tile-move-left-global"',
        'name="kelp-monitor-left"', 'name="kelp-workspace-up"', "'rgb(255,0,0)'", 'Octopus (2D Grid)',
        'Seahorse (Scrolling Strip)', 'Otter (Floating)', 'Keyboard Shortcuts', 'Focus Follows Mouse',
        'Retile Workspace', 'Smart Gaps', "addToStatusArea('kelp'", 'this._clickGesture.set_enabled(false)',
        'button-press-event', 'scroll-event', 'touch-event', 'icons/kelp-octopus-symbolic.svg',
        'icons/kelp-seahorse-symbolic.svg', 'icons/kelp-otter-symbolic.svg', 'Octopus (2D BSP)',
        'Seahorse (Scrolling Columns)', 'Otter (Floating & Snap)', 'Tiling Mode &amp; Window Control',
        'Toggle Maximize / Close Focused Window', 'v2.0.3', 'match_preset(', 'Three instant layout modes:',
        'Select your default layout mode and tiling behavior', 'Customize the focus border ring and 1-click color presets',
    ];
    for (const req of reqs) assert(combined.includes(req), `Missing invariant: ${req}`);
    assert(!combined.includes('Rust installer') && !combined.includes('cargo install'), 'Extension must not mention Rust installer');
    assert(!combined.toLowerCase().includes('kelp-forest') && !combined.toLowerCase().includes('kelp forest'), 'No kelp-forest theme claim');
}

function verify_behavioral_suite() {
    const tmp_dir = GLib.dir_make_tmp('kelp-verify-XXXXXX');
    const schema_xml = 'org.gnome.shell.extensions.kelp.gschema.xml';
    const dst_xml = Gio.File.new_for_path(GLib.build_filenamev([tmp_dir, schema_xml]));
    Gio.File.new_for_path(GLib.build_filenamev([EXT_ROOT, 'schemas', schema_xml])).copy(dst_xml, Gio.FileCopyFlags.OVERWRITE, null, null);
    assert(Gio.Subprocess.new(['glib-compile-schemas', tmp_dir], Gio.SubprocessFlags.NONE).wait_check(null), 'glib-compile-schemas');
    const src = Gio.SettingsSchemaSource.new_from_directory(tmp_dir, Gio.SettingsSchemaSource.get_default(), false);
    const raw_gs = new Gio.Settings({ settings_schema: src.lookup('org.gnome.shell.extensions.kelp', true), backend: Gio.memory_settings_backend_new() });
    raw_gs.set_strv('focus-right', ['<Super>Right', '<Super>KP_Right', '<Super>l']); const s = new ExtensionSettings(raw_gs);
    assert(s.tiling_mode() === 'octopus' && TILING_MODES.length === 3 && BORDER_PRESETS.length === 4, 'mode default');
    s.set_tiling_mode('seahorse'); assert(s.tiling_mode() === 'seahorse' && s.tile_by_default(), 'seahorse mode');
    s.set_tiling_mode('otter'); assert(s.tiling_mode() === 'otter' && !s.tile_by_default(), 'otter mode');
    s.set_tile_by_default(true); assert(s.tiling_mode() === 'octopus', 'restore octopus');
    s.set_active_hint_size(5); assert(s.active_hint_size() === 5, 'active_hint_size'); s.set_active_hint_size(2);
    const cfg_res = Config.from_json('{"__proto__":{"polluted":true},"float":[{"class":"test","__proto__":{"x":1}}]}');
    assert(cfg_res.kind === 1 && MAX_CONFIG_BYTES === 65_536 && Config.from_json('x'.repeat(MAX_CONFIG_BYTES + 1)).kind === 2 && !({}).polluted && cfg_res.value.float.length === 1, 'proto guard');
    assert(s.enable_shortcuts() && s.stacking_with_mouse() && typeof s.focus_follows_mouse() === 'boolean' &&
        s.gap_inner() === 6 && s.gap_outer() === 6 && s.active_hint_border_radius() === 2 && s.active_hint_size() === 2 &&
        !s.ext.get_strv('focus-right').includes('<Super>l') && !s.ext.get_default_value('focus-right').deepUnpack().includes('<Super>l'), 'settings');
    assert(DEFAULT_FLOAT_RULES.length >= 5 && new Config().window_shall_float('steam', 'Steam') && new Config().window_shall_float('com.rastersoft.ding', 'Desktop Icons 1'), 'float rules');

    const w = new Ecs.World(), e_old = w.create_entity();
    w.delete_entity(e_old); w.delete_entity(e_old);
    assert(w.free === 1, 'ECS double-free guard');
    const e_reused = w.create_entity();
    assert(e_old !== e_reused && e_old[1] === 0 && e_reused[1] === 1, 'entity tuple immutability');
    const ar = new Arena(), a0 = ar.insert('x'), a1 = ar.insert('y');
    ar.remove(a1); ar.truncate(1);
    assert(ar.unused.length === 0 && ar.get(a0) === 'x', 'arena truncate');

    const fk = new Fork(e_reused, Node.window(e_reused), Node.window(e_old), new Rectangle([100, 200, 800, 600]), 0, 0, Orientation.HORIZONTAL);
    const r_right = fk.area_of_right({ gap_inner_half: 2, gap_inner: 4 });
    assert(r_right.x === 502 && r_right.width === 398 && r_right.y === 200, 'fork area_of_right math');
    const fk_small = new Fork(e_reused, Node.window(e_reused), Node.window(e_old), new Rectangle([15, 0, 128, 128]), 0, 0, Orientation.HORIZONTAL);
    fk_small.set_ratio(96);
    const recs = [];
    fk_small.measure({ forks: new Map() }, { grab_op: null, tiler: { resizing_window: false }, gap_inner_half: 0 }, fk_small.area, (_e, _p, r) => recs.push(r));
    assert(recs[1].width >= 32, 'fork snap right sibling degenerate');

    const sh = new SeahorseTiler(w.register_storage());
    const e1 = w.create_entity(), e2 = w.create_entity(), e3 = w.create_entity(), e4 = w.create_entity(), e5 = w.create_entity();
    let blocked_moves = 0, last_peeks = null, f = null, cur_x = 100, active_ws = 0;
    const tags = new Set();
    const mk = (ent) => ({
        entity: ent, ws: [0, 0], rects: [], shown: true, actor_ok: true, dying: false,
        actor_exists() { return this.actor_ok && !this.dying; },
        rect() { return this.rects[this.rects.length - 1] ?? new Rectangle([0, 0, 500, 500]); },
        meta: {
            minimized: false, in_destruction() { return w.windows.get(ent).dying; }, get_monitor: () => 0,
            get_compositor_private: () => ({ show: () => { w.windows.get(ent).shown = true; }, hide: () => { w.windows.get(ent).shown = false; } }),
        },
        workspace_id: () => w.windows.get(ent).ws[1], is_tilable: () => true,
        move: (_x, r, cb) => { w.windows.get(ent).rects.push(r); if (cb) cb(); }, activate: () => { f = w.windows.get(ent); },
    });
    w.windows = w.register_storage(); w.monitors = w.register_storage();
    for (const ent of [e1, e2, e3, e4, e5]) { w.windows.insert(ent, mk(ent)); w.monitors.insert(ent, [0, 0]); }
    f = w.windows.get(e1);
    const fake_ext = {
        windows: w.windows, monitors: w.monitors, grab_op: null, tiler: { window: null, resizing_window: false },
        gap_outer: 2, gap_inner: 2, gap_inner_half: 1, settings: { smart_gaps: () => false },
        conf: { window_shall_float: (c) => c === 'steam' }, cursor_status: () => [{ x: cur_x, y: 100 }, 0],
        active_workspace: () => active_ws, should_ignore_workspace: () => false, workspace_id: (win) => win?.ws ?? [0, active_ws],
        monitor_work_area: () => new Rectangle([0, 0, 1000, 500]), focus_window: () => f, on_focused: (nw) => { f = nw; },
        show_border_on_focused: () => {}, size_signals_block: () => { blocked_moves += 1; }, size_signals_unblock: () => {},
        sync_seahorse_peeks: (_id, p) => { last_peeks = p; }, clear_seahorse_peeks: () => { last_peeks = null; },
        register_fn: (cb) => cb(), contains_tag: (e, t) => tags.has(`${e[0]}:${t}`),
        add_tag: (e, t) => tags.add(`${e[0]}:${t}`), delete_tag: (e, t) => tags.delete(`${e[0]}:${t}`),
    };
    const g = (ent) => w.windows.get(ent);
    sh.auto_tile(fake_ext, g(e1), false); assert(g(e1).rect().width === 996, 'seahorse 1/1 full width');
    sh.auto_tile(fake_ext, g(e2), false); assert(g(e1).rect().width === 497 && g(e2).rect().width === 497, 'seahorse 1/2 width');
    sh.auto_tile(fake_ext, g(e3), false);
    assert(g(e1).shown && g(e2).shown && g(e3).shown && g(e1).rect().width === 330 && !last_peeks?.left && !last_peeks?.right, 'seahorse 1/3 width');
    sh.auto_tile(fake_ext, g(e4), false);
    assert(!g(e1).shown && g(e2).shown && g(e3).shown && g(e4).shown && blocked_moves > 0 && last_peeks?.left && !last_peeks?.right, 'seahorse 4th window');
    f = g(e4); sh.focus_step(fake_ext, -1, true); assert(f === g(e1) && sh._strip([0, 0]).scroll === 0, 'seahorse left peek jump');
    f = g(e1); sh.focus_step(fake_ext, 1, true); assert(f === g(e4) && sh._strip([0, 0]).scroll === 1, 'seahorse right peek jump');
    sh.auto_tile(fake_ext, g(e5), false); f = g(e5); g(e3).dying = true; sh.on_focused(fake_ext, g(e5));
    assert(sh._strip([0, 0]).scroll === 1 && g(e2).shown && g(e4).shown && g(e5).shown && f === g(e5) && sh._strip([0, 0]).active === 3, 'seahorse non-active close');
    sh.detach_window(fake_ext, e5, true); g(e3).dying = false; sh.auto_tile(fake_ext, g(e3), true);
    f = g(e2); sh.focus_step(fake_ext, -1); sh.detach_window(fake_ext, e1, true);
    assert(sh._strip([0, 0]).cols[0] === e2 && g(e2).shown && g(e4).shown && g(e3).shown && f === g(e2), 'seahorse close left active slides right windows left');
    sh.destroy(fake_ext);

    g(e1).floating_rect = new Rectangle([0, 0, 1000, 500]); g(e2).floating_rect = new Rectangle([2, 2, 996, 496]);
    w.delete_entity(e5); g(e4).meta.minimized = true; f = g(e2); g(e3).ws = [0, 2]; sh.auto_tile(fake_ext, g(e3), false); sh.destroy(fake_ext);
    assert(!g(e3).shown, 'seahorse destroy does not show off-workspace actors'); g(e3).ws = [0, 0]; cascade_otter_windows(fake_ext, f);
    assert(is_full_work_area_rect(new Rectangle([2, 2, 996, 496]), new Rectangle([0, 0, 1000, 500]), 2) && f.rect().x > g(e1).rect().x, 'otter cascade focused on top');
    snap_otter_window(fake_ext, 0);
    const att = w.register_storage(), forest = new Forest().connect_on_attach((p, c) => att.insert(c, p)).connect_on_detach((c) => att.remove(c));
    const ord = [g(e1), g(e2), g(e3), g(e4)].filter((win) => !win.meta.minimized); ord.splice(ord.indexOf(f), 1); ord.unshift(f);
    const [tl_e, tl_fk] = forest.create_toplevel(ord[0].entity, new Rectangle([2, 2, 996, 496]), [0, 0]);
    assert(!('string_reps' in forest) && forest.toplevel.has('0:0') && Ecs.entity_eq(forest.find_toplevel([0, 0]), tl_e), 'forest O(1) toplevel key');
    forest.on_attach(tl_e, ord[0].entity); forest.tile(fake_ext, tl_fk, tl_fk.area);
    for (const win of ord.slice(1, 2)) {
        const onto = forest.largest_window_on(fake_ext, tl_e);
        const [, pfk] = forest.attach_window(fake_ext, onto.entity, win.entity, { auto: 0 }, true);
        forest.tile(fake_ext, pfk, pfk.area.clone());
    }
    assert(f.rect().x === fake_ext.gap_outer && f.rect().height === 496 && g(e1).rect().x > fake_ext.gap_outer && fake_ext.focus_window() === f, 'octopus focused main left window');
    fake_ext.auto_tiler = {
        forest, detach_window: (x, we) => att.take_with(we, (pf) => forest.detach(x, pf, we)),
        attach_to_workspace: (x, win, id) => {
            const [, pfk] = forest.attach_window(x, forest.largest_window_on(x, forest.find_toplevel(id)).entity, win.entity, { auto: 0 }, true);
            forest.tile(x, pfk, pfk.area.clone());
        },
        update_toplevel: (x, fk) => forest.tile(x, fk, fk.area), update_stack: () => {},
    };
    const [tl_ws_e, tl_ws_fk] = forest.create_toplevel(ord[2].entity, new Rectangle([0, 0, 500, 500]), [1, 3]);
    const st_idx = forest.stacks.insert({ monitor: 1, workspace: 3, destroyed: false, destroy() { this.destroyed = true; } });
    forest.on_attach(tl_ws_e, ord[2].entity); tl_ws_fk.left = Node.stacked(ord[2].entity, st_idx); ord[2].stack = st_idx;
    forest.remap_toplevels(fake_ext, 2, 2, true);
    assert(tl_ws_fk.workspace === 1 && forest.stacks.get(st_idx).workspace === 1 && Ecs.entity_eq(forest.find_toplevel([1, 1]), tl_ws_e), 'workareas_only clamps workspace');
    forest.remap_toplevels(fake_ext, 1, 1, false);
    assert(!forest.forks.get(tl_ws_e) && !forest.stacks.get(st_idx) && Ecs.entity_eq(forest.find_toplevel([0, 0]), tl_e) && att.get(ord[2].entity) !== null, 'unplug merges stack');
    const loop = GLib.MainLoop.new(null, false), exec = new GLibExecutor(), total = MAX_EVENTS_PER_TICK + 44;
    let count = 0;
    for (let i = 0; i < total; i += 1) exec.send({ idx: i }, () => { count += 1; if (count === total) loop.quit(); });
    loop.run(); exec.stop(); exec.send({ idx: 999 }, () => { count += 1; }); new WakeupExecutor().stop();
    assert(count === total, `GLibExecutor multi-tick drain & terminal stop expected ${total}, got ${count}`);
    for (const p of [dst_xml.get_path(), GLib.build_filenamev([tmp_dir, 'gschemas.compiled']), tmp_dir]) Gio.File.new_for_path(p).delete(null);
}
const js_files = [], dirs = [];
walk_repo(REPO_ROOT, js_files, dirs); verify_page_rules_and_lint(js_files, dirs); verify_process_boundaries_and_invariants(); verify_behavioral_suite();
print(`OK: verified ${js_files.length} JS pages across ${dirs.length} directories and all headless behavioral suites.`);
