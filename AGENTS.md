# AGENTS.md — Kelp Architectural Invariants & Engineering Standards

## 1. Global Engineering Philosophy

Kelp (`kelp@studio2201.github.io`) is built on four uncompromising engineering pillars:

1. **Linus Torvalds' "Good Taste"**: Eliminate special-case branching through clean data representation (generational ECS arenas, binary space partitioning trees, and immutable frozen enums).
2. **UNIX Philosophy**: Each module ("page") does one thing well, composes cleanly via explicit imports, and avoids hidden global state.
3. **NASA JPL Power-of-10 Safety Rules**:
   - All recursive or iterative tree traversals (`forest_resize.js`) enforce an explicit upper iteration bound (`MAX_PARENT_DEPTH = 64`).
   - All event-loop drains (`executor.js`) enforce an explicit per-tick bound (`MAX_EVENTS_PER_TICK = 256`).
   - Zero dynamic code evaluation (`eval`, `Function`) and zero synchronous subprocess or blocking disk I/O in the compositor.
4. **OWASP Zero-Trust Security**:
   - Float-rule JSON configuration (`extension/ui/settings/float_rules.js`) is validated for byte size (`MAX_CONFIG_BYTES = 65_536`), prototype-pollution keys (`__proto__`, `constructor`, `prototype`), and schema before parsing.
   - All user regex patterns are compiled inside defensive `try / catch` blocks (`safe_regex_match`) with a bounded cache cleared on `disable()`.

---

## 2. The Page Rule & Directory Density (Enforced by `tests/verify.js`)

- **File Line Bounds**: Every `.js` source file in the repository (`extension/`, `tests/`) **must** be between **16 and 256 lines** (`16..=256`), and every line **must** be at most **200 characters** (`<= 200`).
- **Directory Density**: Every directory in the repository (`root`, `tests/`, `extension/`, and all subdirectories) **must** contain **at most 8 visible entries** (`<= 8`).
- **Banned Generic Names**: Generic grab-bag names (`util`, `utils`, `lib`, `helper`, `helpers`, `common`, `misc`, `shared`, `base`, `core`, `types`, `mod`) are strictly forbidden.
- **2-Line SPDX + Concise Module Header**:
   - Line 1 of every `.js` file must be `// SPDX-License-Identifier: GPL-3.0-or-later`.
   - Line 2 of every `.js` file must be a concise single-line module description (`// <Concise module description>`).

---

## 3. Process-Boundary & GNOME Shell / EGO Lifecycle Invariants (`tests/verify.js`)

- **ES2022 Strictness**: Zero `var` declarations (`const`/`let` only) and zero loose equality operators (`===`/`!==` only).
- **Process Boundary Separation**: `extension/prefs.js` runs in the GTK4 `gnome-extensions-app` process. Neither `prefs.js` nor any module in its import chain (`engine/geom/focus.js`, `engine/geom/movement.js`, `engine/geom/rectangle.js`, `engine/octopus/forest.js`, `engine/otter/otter_tiler.js`, `engine/seahorse/seahorse_tiler.js`, `ui/settings/gsettings.js`, `ui/settings/color.js`, `ui/settings/log.js`, `ui/settings/prefs_pages.js`) may import compositor-only typelibs (`gi://Meta`, `gi://Clutter`, `gi://St`, `gi://Shell`, `resource:///org/gnome/shell/*`).
- **Deterministic EGO Teardown**: `extension/extension.js` performs zero top-level work at import time and deterministically cleans up all named `GLib` sources, signals, keybindings, borders, stacks, modal dialogs, themes, and Mutter `edge-tiling` / `focus-mode` preferences in `disable()`.

---

## 4. Functional Page Map

### Verification & Test Suite (`tests/` — 1 page)
- [`tests/verify.js`](tests/verify.js): Zero-dependency GJS architectural lint, Page Rule (`16..=256` lines, `<= 8` entries/dir), process-boundary check, and headless behavioral test suite (`gjs -m tests/verify.js`).

### GNOME Shell Extension (`extension/` — 36 JS pages across 3 domain trees)
- **Root Entrypoints**:
  - [`extension/extension.js`](extension/extension.js): `KelpExtension extends Extension` EGO lifecycle entrypoint.
  - [`extension/prefs.js`](extension/prefs.js): `KelpPreferences extends ExtensionPreferences` GTK4 preferences UI.
- **Engine (`extension/engine/` — 6 domain subdirectories)**:
  - `ecs/`: [`arena.js`](extension/engine/ecs/arena.js), [`world.js`](extension/engine/ecs/world.js), [`executor.js`](extension/engine/ecs/executor.js), [`events.js`](extension/engine/ecs/events.js)
  - `geom/`: [`rectangle.js`](extension/engine/geom/rectangle.js), [`movement.js`](extension/engine/geom/movement.js), [`focus.js`](extension/engine/geom/focus.js)
  - `octopus/`: [`octopus_tiler.js`](extension/engine/octopus/octopus_tiler.js), [`octopus_drop.js`](extension/engine/octopus/octopus_drop.js), [`forest.js`](extension/engine/octopus/forest.js), [`forest_resize.js`](extension/engine/octopus/forest_resize.js), [`fork.js`](extension/engine/octopus/fork.js), [`node.js`](extension/engine/octopus/node.js)
  - `seahorse/`: [`seahorse_tiler.js`](extension/engine/seahorse/seahorse_tiler.js)
  - `otter/`: [`otter_tiler.js`](extension/engine/otter/otter_tiler.js)
  - `modal/`: [`modal_tiler.js`](extension/engine/modal/modal_tiler.js), [`modal_actions.js`](extension/engine/modal/modal_actions.js)
- **Window Management (`extension/window/`)**:
  - [`controller.js`](extension/window/controller.js), [`controller_signals.js`](extension/window/controller_signals.js), [`controller_display.js`](extension/window/controller_display.js), [`controller_workspace.js`](extension/window/controller_workspace.js), [`shell_window.js`](extension/window/shell_window.js), [`window_border.js`](extension/window/window_border.js), [`keybindings.js`](extension/window/keybindings.js), [`overview_tray.js`](extension/window/overview_tray.js)
- **UI & Settings (`extension/ui/`)**:
  - [`stack.js`](extension/ui/stack.js), [`stack_widgets.js`](extension/ui/stack_widgets.js), [`panel_indicator.js`](extension/ui/panel_indicator.js), [`exception_dialog.js`](extension/ui/exception_dialog.js), `dark.css`, `light.css`, `highcontrast.css`
  - `settings/`: [`log.js`](extension/ui/settings/log.js), [`color.js`](extension/ui/settings/color.js), [`gsettings.js`](extension/ui/settings/gsettings.js), [`float_rules.js`](extension/ui/settings/float_rules.js), [`prefs_pages.js`](extension/ui/settings/prefs_pages.js)
