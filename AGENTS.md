# AGENTS.md — Kelp Architectural Invariants & Engineering Standards

## 1. Global Engineering Philosophy

Kelp (`kelp@ubermetroid.github.io`) is built on four uncompromising engineering pillars:

1. **Linus Torvalds' "Good Taste"**: Eliminate special-case branching through clean data representation (generational ECS arenas, binary space partitioning trees, and immutable frozen enums).
2. **UNIX Philosophy**: Each module ("page") does one thing well, composes cleanly via explicit imports, and avoids hidden global state.
3. **NASA JPL Power-of-10 Safety Rules**:
   - All recursive or iterative tree traversals (`forest_resize.js`) enforce an explicit upper iteration bound (`MAX_PARENT_DEPTH = 64`).
   - Zero dynamic code evaluation (`eval`, `Function`), zero `unsafe` Rust (`#![forbid(unsafe_code)]`), and zero panicking primitives (`unwrap`, `expect`, `panic!`, `todo!`, `unimplemented!`, `dbg!`).
4. **OWASP Zero-Trust Security**:
   - External configuration (`~/.config/kelp/config.json`) is validated for byte size (`MAX_CONFIG_BYTES = 65_536`), delimiter balance, and schema before parsing in both Rust (`src/default_rules.rs`) and GJS (`extension/ui/settings/float_rules.js`).
   - All user regex patterns are compiled inside defensive `try / catch` blocks (`safe_regex_match`).
   - External process invocations (`gsettings`, `glib-compile-schemas`, `gnome-extensions`) use `std::process::Command` argument arrays directly without a shell interpreter.

---

## 2. The Page Rule & Directory Density (Enforced by `tests/page_rules.rs`)

- **File Line Bounds**: Every `.rs` and `.js` source file in the repository (`src/`, `tests/`, `extension/`) **must** be between **16 and 256 lines** (`16..=256`).
- **Directory Density**: Every directory in the repository (`root`, `src/`, `tests/`, `extension/`, and all subdirectories) **must** contain **at most 8 visible entries** (`<= 8`).
- **Banned Generic Names**: Generic grab-bag names (`util`, `utils`, `lib` [except Cargo's mandatory `src/lib.rs`], `helper`, `helpers`, `common`, `misc`, `shared`, `base`, `core`, `types`, `mod`) are strictly forbidden.
- **SPDX + First-Principles & Zero-Trust Page Header**:
  - Line 1 of every `.rs` and `.js` file must be `// SPDX-License-Identifier: GPL-3.0-or-later`.
  - Lines 2–15 must contain the structured header block:
    - `// First-Principles & Zero-Trust Page Header`
    - `// - Page Responsibility / Functional Domain:`
    - `// - Zero-Trust Boundary & Invariants:`

---

## 3. Process-Boundary & GNOME Shell / EGO Lifecycle Invariants (`tests/lint.rs`)

- **ES2022 Strictness**: Zero `var` declarations (`const`/`let` only) and zero loose equality operators (`===`/`!==` only).
- **Process Boundary Separation**: `extension/prefs.js` runs in the GTK4 `gnome-extensions-app` process. Neither `prefs.js` nor any module in its import chain (`engine/geom/focus.js`, `engine/geom/rectangle.js`, `ui/settings/gsettings.js`, `ui/settings/color.js`, `ui/settings/log.js`) may import compositor-only typelibs (`gi://Meta`, `gi://Clutter`, `gi://St`, `gi://Shell`, `resource:///org/gnome/shell/*`).
- **Deterministic EGO Teardown**: `extension/extension.js` performs zero top-level work at import time and deterministically cleans up all timers, signals, keybindings, borders, stacks, modal dialogs, and themes in `disable()`.

---

## 4. Functional Page Map

### Rust Installer & EGO Packager (`src/` — 8 pages, `tests/` — 3 pages)
- [`src/lib.rs`](src/lib.rs): Crate root, XDG directory resolver, and `#![forbid(unsafe_code)]` lint gates.
- [`src/main.rs`](src/main.rs): Binary CLI entrypoint and error-reporting exit-code dispatcher.
- [`src/cli_options.rs`](src/cli_options.rs): Zero-dependency CLI parser (`--pack [OUT_DIR]`, `--help`, `--version`).
- [`src/default_rules.rs`](src/default_rules.rs): Default float-exception config JSON, OWASP size/structure validator, and GNOME Control Center keybinding XML definitions.
- [`src/embedded_assets.rs`](src/embedded_assets.rs): Compile-time `include_str!` manifest of all 33 JS files, 3 CSS themes, 2 SVG icons, and GSettings schema.
- [`src/gsettings_config.rs`](src/gsettings_config.rs): GSettings WM conflict clearer, tiling defaults, and shortcut configurator.
- [`src/install_files.rs`](src/install_files.rs): Path-traversal-safe asset extractor, legacy flat-file purger, and schema compiler.
- [`src/pack_bundle.rs`](src/pack_bundle.rs): EGO `.shell-extension.zip` staging tree writer and `gnome-extensions pack` runner.
- [`tests/page_rules.rs`](tests/page_rules.rs): Automated enforcement of `16..=256` lines, `<= 8` directory entries, banned names, and First-Principles headers.
- [`tests/lint.rs`](tests/lint.rs): Automated ES2022, process-boundary, and EGO lifecycle lint verification.
- [`tests/installer.rs`](tests/installer.rs): End-to-end tests for CLI parsing, config validation, legacy cleanup, and EGO bundle creation.

### GNOME Shell Extension (`extension/` — 33 JS pages across 3 domain trees)
- **Root Entrypoints**:
  - [`extension/extension.js`](extension/extension.js): `KelpExtension extends Extension` EGO lifecycle entrypoint.
  - [`extension/prefs.js`](extension/prefs.js): `KelpPreferences extends ExtensionPreferences` GTK4 preferences UI.
- **Engine (`extension/engine/`)**:
  - `ecs/`: [`arena.js`](extension/engine/ecs/arena.js), [`world.js`](extension/engine/ecs/world.js), [`executor.js`](extension/engine/ecs/executor.js), [`events.js`](extension/engine/ecs/events.js)
  - `geom/`: [`rectangle.js`](extension/engine/geom/rectangle.js), [`movement.js`](extension/engine/geom/movement.js), [`focus.js`](extension/engine/geom/focus.js)
  - `tree/`: [`node.js`](extension/engine/tree/node.js), [`fork.js`](extension/engine/tree/fork.js), [`forest.js`](extension/engine/tree/forest.js), [`forest_resize.js`](extension/engine/tree/forest_resize.js), [`auto_tiler.js`](extension/engine/tree/auto_tiler.js), [`auto_tiler_drop.js`](extension/engine/tree/auto_tiler_drop.js), [`tiler.js`](extension/engine/tree/tiler.js), [`tiler_actions.js`](extension/engine/tree/tiler_actions.js)
- **Window Management (`extension/window/`)**:
  - [`controller.js`](extension/window/controller.js), [`controller_signals.js`](extension/window/controller_signals.js), [`controller_display.js`](extension/window/controller_display.js), [`controller_workspace.js`](extension/window/controller_workspace.js), [`shell_window.js`](extension/window/shell_window.js), [`window_border.js`](extension/window/window_border.js), [`keybindings.js`](extension/window/keybindings.js), [`overview_tray.js`](extension/window/overview_tray.js)
- **UI & Settings (`extension/ui/`)**:
  - [`stack.js`](extension/ui/stack.js), [`stack_widgets.js`](extension/ui/stack_widgets.js), [`panel_indicator.js`](extension/ui/panel_indicator.js), [`exception_dialog.js`](extension/ui/exception_dialog.js), `dark.css`, `light.css`, `highcontrast.css`
  - `settings/`: [`log.js`](extension/ui/settings/log.js), [`color.js`](extension/ui/settings/color.js), [`gsettings.js`](extension/ui/settings/gsettings.js), [`float_rules.js`](extension/ui/settings/float_rules.js)
