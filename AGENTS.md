# kelp — House Laws & Agent Engineering Standards

This document is the **single canonical source of truth** for all code, architecture, and system integration standards for `kelp` (hardened, zero-subprocess Wayland binary-tree auto-tiling and window stacking extension for GNOME 45–51, compliant with `extensions.gnome.org` / EGO review guidelines, and packaged inside a zero-dependency Rust installer & bundler). Every human contributor and AI agent must strictly follow these rules without exception.

**Precedence:** Where this file and CI disagree, this file wins. A rule not enforced anywhere is a bug in this file, not a suggestion to ignore.

**Rule Markers:**
- `[GATE:<tool>]` — Machine-enforced by automated compiler flags, clippy, or `cargo test`. Must pass in CI.
- `[POLICY]` — Enforced during code review. Dictates architecture, naming taste, restraint, and ergonomics.

---

## 1. The Page Rule (Code Layout & Sizing)

A **page** is one committed Rust file. Every page holds one idea, fits in one head, and carries its own weight.

- `[GATE:test]` **16–256 Lines**: Every committed `.rs` file must be between **16 and 256 lines** (`content.lines().count()`, blank lines and comments count). Enforced by `tests/page_rules.rs`.
- `[GATE:test]` **Shim Exemption (Floor Only)**: A file is a shim if every non-empty, non-comment, non-attribute line starts with `mod `, `use `, `pub mod `, or `pub use `. Shims skip the 16-line floor; the 256-line ceiling still strictly applies.
- `[GATE:test]` **Directory Density (≤ 8 files)**: At most 8 `.rs` files per directory. Crowded directories split into functional subdirectories grouped by domain.
- `[GATE:test]` **Banned Drawer Filenames**: `util.rs`, `utils.rs`, `helper.rs`, `helpers.rs`, `common.rs`, `misc.rs`, `shared.rs`, `base.rs`, `core.rs`.
- `[POLICY]` **Domain Naming Recipe**: Name pages after their concrete noun or verb:
  - Action pages: `install_files.rs`, `gsettings_config.rs`, `pack_bundle.rs`.
  - State pages: `cli_options.rs`, `embedded_assets.rs`.
- `[POLICY]` **Blobs Out**: Keep extension modules (`extension/`), schemas (`schemas/`), keybindings (`keybindings/`), and default float rules (`config/config.json`) in their dedicated directories and load them with `include_bytes!`.
- `[POLICY]` **Never Pad**: Do not add comments or blank lines to clear 16 lines. Fold small files into their single caller or nearest sibling.

---

## 2. Architecture & Zero-Dependency Discipline

- `[GATE:test]` **Zero External Dependencies**: `Cargo.toml` must declare **zero** `[dependencies]`, `[dev-dependencies]`, or `[build-dependencies]` (`std` only), and `Cargo.lock` must contain exactly 1 `[[package]]` entry (`kelp`). Enforced by `tests/page_rules.rs`.
- `[POLICY]` **Deep Modules over Speculative Traits (Rule of Two)**: Do not define traits or generic type parameters unless at least two distinct implementations exist in the repository today. Prefer concrete structs and cohesive functions.
- `[POLICY]` **Self-Contained Binary & EGO Bundler**: All GNOME Shell Extension JavaScript modules (`extension/*.js`), stylesheets (`extension/*.css`), icons (`extension/icons/*.svg`), GSettings schemas (`extension/schemas/*`), GNOME Control Center keybindings (`keybindings/*.xml`), and default floating window exceptions (`config/config.json`) are embedded at compile time via `include_bytes!`. Running `kelp --pack [OUT_DIR]` stages and packs a clean `kelp@ubermetroid.github.io.shell-extension.zip` archive via `gnome-extensions pack`.

---

## 3. Pure Rust & Crash-Resilience Standards

- `[GATE:clippy]` **Zero-Panic Invariant**: No bare `.unwrap()`, `.expect()`, or `panic!()` in production code (`#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]`). `.unwrap()` and `.expect()` are permitted **only** inside `#[cfg(test)]` modules.
- `[GATE:rustc]` **`#![forbid(unsafe_code)]`**: Unsafe code is strictly forbidden across all crate roots (`src/lib.rs`, `src/main.rs`) and test modules. Enforced by `tests/page_rules.rs`.
- `[GATE:test]` **No Shell Invocations**: Subprocesses must never invoke `sh -c`, `bash -c`, or `zsh -c`. System-wide privilege elevation invokes `run0 <current_exe> --system --skip-gsettings` directly via `std::process::Command::new("run0")`. Enforced by `tests/lint.rs`.

---

## 4. GNOME Extensions (`extensions.gnome.org` / EGO) & Wayland Hardening Invariants

- `[GATE:test]` **EGO Extension Identity & Schema (`extension/metadata.json` & `schemas/`)**:
  1. UUID is `kelp@ubermetroid.github.io`, `settings-schema` is `org.gnome.shell.extensions.kelp`, and schema path is `/org/gnome/shell/extensions/kelp/`.
  2. `metadata.json` uses `"version-name": "1.0.0"` (never the deprecated integer `"version"` field) and supports `"shell-version": ["45", "46", "47", "48", "49", "50", "51"]`.
  3. Dead launcher keys (`activate-launcher`, `fullscreen-launcher`) are absent from the schema. Enforced by `tests/lint.rs`.
- `[GATE:test]` **Strict Process Boundary Separation (`extension/*.js`)**:
  1. GNOME Shell process modules (`extension.js` and everything it imports) must **never** import `gi://Gdk`, `gi://Gtk`, or `gi://Adw`. Color parsing (`parse_rgba`), CSS color validation (`is_valid_color`), and WCAG luminance (`is_dark`) are implemented in pure JavaScript (`extension/utils.js`).
  2. Preferences process module (`extension/prefs.js`) exports `default class KelpPreferences extends ExtensionPreferences`, uses `this.getSettings()`, and must **never** import `gi://Clutter`, `gi://Meta`, `gi://Mtk`, `gi://St`, `gi://Shell`, or `resource:///org/gnome/shell/*`, nor call removed GTK3 `show_all()`. Enforced by `tests/lint.rs`.
- `[GATE:test]` **Lifecycle Hygiene (`enable()` / `disable()`)**:
  1. **Zero Import-Time Side Effects**: No GObject instances (`Gio.File`, `Gio.Settings`, `Shell.WindowTracker`), signals, or `global.*` accesses may execute at module scope before `enable()` is called.
  2. **Complete `disable()` Teardown**: `disable()` must unconditionally disconnect all GObject signals (settings, display, workspace manager, window manager, stage theme context, window actors, stack tab buttons), remove all `GLib.timeout_add` / `GLib.idle_add` main loop sources (`drag_signal`, `exception_select_id`, `restack_id`, `schedule_idle_id`, `size_requests`, `workareas_update`, `displays_updating`), stop all executors (`GLibExecutor`, `ChannelExecutor`, `OnceExecutor`), destroy all St widgets and modal dialogs (`indicator`, `ext.overlay`, `exception_dialog`, window active-hint `border`s, stack tab bars), unload extension stylesheets, restore monkey-patched GNOME Shell prototypes, and null out module state (`ext = null`, `indicator = null`).
- `[GATE:test]` **Zero Subprocesses & Modern GJS / Mutter 16–19 APIs**:
  1. Zero `Gio.Subprocess`, `GLib.spawn_*`, `xprop`, `/proc`, or `dbus-send` calls anywhere in `extension/`.
  2. Standard `console.log` / `console.warn` / `console.error` / `console.debug` instead of deprecated `globalThis.log()`.
  3. Native ES2022 private class fields (`#field`) instead of TypeScript `__classPrivateField*` WeakMap helpers.
  4. GNOME 48–51 / Mutter 16–19 compatibility: `global.stage.get_context().get_backend().get_default_seat().warp_pointer(...)`, `Meta.DisplayDirection`, and `meta.is_maximized?.() ?? (meta.get_maximized?.() !== 0)`.

---

## 5. Verification Ladder

Order matters. Each step must pass completely before running the next:

1. `cargo test --workspace --all-targets` — All unit, integration, EGO lint, installer, packager, and Page Rule tests pass.
2. `cargo clippy --workspace --all-targets -- -D warnings -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic` — Zero warnings, zero panics.
3. `cargo fmt --all -- --check` — Standard formatting verified.
4. `cargo build --release` — Stripped release binary built cleanly.
5. `./target/release/kelp --pack /tmp` — Valid EGO `.shell-extension.zip` bundle built cleanly via `gnome-extensions pack`.

---

## 6. Known Gaps — Not Enforced

- **Live GNOME Shell Wayland Compositor Session**: Interactive window drag-and-drop tiling, multi-monitor hotplug migration, and Wayland pointer warping require a running GNOME Shell Wayland session and cannot be exercised in headless CI containers; CI verifies static EGO guidelines, GJS module syntax, installer tree layout, and `gnome-extensions pack` bundle structure headlessly.

---

## 7. Multi-Engine Audit Protocol (Pre-Release)

Advisory tiered audit run before tagging releases or uploading to `extensions.gnome.org`, budgeted by token capacity:
1. **`mcode`** (Abundant tokens): Full codebase scan for contract mismatches, packaging specs, and CI gates.  
   `mcode exec --permission full "<prompt>"`
2. **`vibe`** (Moderate tokens): Adversarial diff inspection for subtle regressions, EGO guideline violations, and API validity.  
   `vibe -p "<prompt>" --trust --auto-approve`
3. **`grok`** (Strict quota): High-value referee and final sanity check on critical release diffs.  
   `grok -p "<prompt>" --always-approve`
4. **`gemma4`** (Local offline): On-device validation pass with local weights.  
   `gemma4 -p "<prompt>"`

**Rule:** External audits are strictly advisory; all findings must be verified against source code. External LLMs never gate CI—the §5 Verification Ladder is the sole canonical authority.
