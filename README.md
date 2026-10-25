# Kelp — GNOME Shell Wayland Auto-Tiling Extension & Self-Contained Rust Installer

**Kelp** (`kelp@ubermetroid.github.io`) is a fast, zero-dependency, Wayland-first binary space partitioning (BSP) auto-tiling extension for **GNOME Shell 45–51** (Mutter 18/19), bundled inside a single self-contained Rust installer and EGO packager binary (`kelp`).

---

## Features

- **Automatic Binary Space Partitioning (BSP) Tiling**: Automatically tiles normal windows across monitors and workspaces with dynamic orientation splits.
- **Window Stacking**: Group windows into tabbed stacks (`Super + S`) and cycle tabs with directional focus (`Super + H/Left`, `Super + L/Right`).
- **Interactive Adjustment Mode**: Enter modal keyboard tiling/resize mode (`Super + Return`), move/swap/resize with directional keys, and commit (`Return`) or cancel (`Escape`).
- **Top-Bar Indicator Controls**: Instant toggles for **Tile Windows**, **Keyboard Shortcuts** (on/off), **Focus Follows Mouse** (`sloppy`/`click` WM focus mode), **Show Window Titles**, **Show Active Hint**, **Smart Gaps**, **Retile Workspace**, **Floating Window Exceptions**, and interactive gap/border-radius spinners.
- **Unified EGO & GitHub Experience**: Installing the `.shell-extension.zip` from `extensions.gnome.org` or running the `kelp` Rust installer applies identical Hyprland-inspired defaults (`2px` gaps, red `rgb(255,0,0)` active hint border with `2px` radius, titlebars hidden, built-in `steam`/`caligula`/`btm`/`macchina` float rules).
- **Zero-Runtime-Dependency Rust Installer (`kelp`)**: All 33 ES2022 modules, 3 CSS themes, SVG icons, GSettings schemas, and GNOME Control Center keybinding definitions are embedded at compile time via `include_str!`.

---

## Quick Start

### Build & Install

```bash
cargo install --path . --root ~/.local
kelp
```

Running `kelp` with no arguments:
1. Purges any obsolete flat extension files and legacy directories from earlier versions.
2. Extracts the modular extension tree into `~/.local/share/gnome-shell/extensions/kelp@ubermetroid.github.io/`.
3. Installs and compiles `org.gnome.shell.extensions.kelp.gschema.xml`.
4. Validates/writes `~/.config/kelp/config.json` and installs GNOME Control Center keybinding entries.
5. Configures default tiling shortcuts and enables the extension.

### Package an EGO `.shell-extension.zip` Archive

```bash
kelp --pack /tmp
```

---

## Default Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Super + H / J / K / L` or `Super + Arrow` | Focus window Left / Down / Up / Right |
| `Super + Shift + H / J / K / L` or `Super + Ctrl + H / J / K / L` | Move tiled window Left / Down / Up / Right |
| `Super + Return` | Enter interactive adjustment / resize mode |
| `Super + Y` | Toggle auto-tiling on / off |
| `Super + G` | Toggle floating mode for the focused window |
| `Super + O` | Toggle split orientation (horizontal / vertical) |
| `Super + S` | Toggle window stacking on the focused window |
| `Super + Shift + Ctrl + H / J / K / L` or `Arrow` | Move window to adjacent monitor |
| `Super + Shift + Alt + J / K` or `Page_Down / Page_Up` | Move window to adjacent workspace |

---

## Repository Architecture

Every `.rs` and `.js` source file strictly obeys the **Page Rule** (`16..=256` lines per file, `<= 8` entries per directory, SPDX `GPL-3.0-or-later` on line 1, and a structured First-Principles & Zero-Trust Page Header):

```text
kelp/
├── AGENTS.md
├── Cargo.toml
├── Cargo.lock
├── LICENSE
├── README.md
├── src/                  # 8 Rust pages (16..=256 lines each)
│   ├── lib.rs
│   ├── main.rs
│   ├── cli_options.rs
│   ├── default_rules.rs
│   ├── embedded_assets.rs
│   ├── gsettings_config.rs
│   ├── install_files.rs
│   └── pack_bundle.rs
├── tests/                # 3 Rust integration/lint suites (16..=256 lines each)
│   ├── installer.rs
│   ├── lint.rs
│   └── page_rules.rs
└── extension/            # 8 top-level entries, 33 ES2022 JS pages (16..=256 lines each)
    ├── extension.js
    ├── prefs.js
    ├── metadata.json
    ├── icons/
    ├── schemas/
    ├── engine/           # ecs/ (4 pages), geom/ (3 pages), tree/ (8 pages)
    ├── window/           # 8 window & compositor controller pages
    └── ui/               # 4 UI pages, 3 CSS themes, settings/ (4 pages)
```

---

## Verification

```bash
cargo test --workspace --all-targets
cargo clippy --workspace --all-targets -- -D warnings -W clippy::pedantic \
  -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic \
  -D clippy::todo -D clippy::unimplemented -D clippy::dbg_macro
cargo fmt --all -- --check
```

## License

GPL-3.0-or-later (`// SPDX-License-Identifier: GPL-3.0-or-later`).
