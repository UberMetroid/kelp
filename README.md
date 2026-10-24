# Kelp (`kelp@ubermetroid.github.io`)

**Kelp** is a hardened, zero-subprocess Wayland auto-tiling extension for **GNOME 45–51** (Mutter 13–19), compliant with the official [GNOME Extensions (`extensions.gnome.org` / EGO) Review Guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html) and packaged inside a single zero-dependency Rust installer & bundler (`kelp`).

Derived from System76's Pop Shell auto-tiling engine, Kelp strips out all legacy subprocesses (`xprop`, `/proc` readers, external GTK3 color/exception app spawners, launcher services, and D-Bus daemons) and modernizes every GJS module for modern Wayland GNOME Shell sessions.

---

## Key Features & Hardening

1. **100% EGO (`extensions.gnome.org`) Compliant**:
   - Independent extension identity (`kelp@ubermetroid.github.io`) and GSettings schema (`org.gnome.shell.extensions.kelp` at `/org/gnome/shell/extensions/kelp/`).
   - Strict process-boundary isolation: GNOME Shell modules never import `gi://Gdk`, `gi://Gtk`, or `gi://Adw`; `prefs.js` uses `ExtensionPreferences` and `this.getSettings()`.
   - Zero import-time GObject/Shell mutations before `enable()` and full signal, timer, executor, widget, and stylesheet teardown in `disable()`.
   - Built-in `--pack` flag (`kelp --pack [OUT_DIR]`) that runs `gnome-extensions pack` to produce an upload-ready `kelp@ubermetroid.github.io.shell-extension.zip` archive.
2. **GNOME 45–51 / Mutter Wayland Compatibility**:
   - Uses `Clutter.Orientation` on `St.BoxLayout` (replacing removed `vertical` boolean property).
   - Uses `global.stage.get_context().get_backend().get_default_seat().warp_pointer()` for Wayland-safe cursor focus warping.
   - Uses `Meta.DisplayDirection` and supports both `Meta.Window.is_maximized()` (GNOME 49/50+) and `Meta.Window.get_maximized()`.
   - Native ES2022 private class fields (`#event_loop`, `#events`, `#executor`) and batched `GLib.PRIORITY_HIGH_IDLE` event draining.
   - Event-driven `notify::minimized` and `restacked` signals (zero background polling timers).
3. **Hyprland-Style Keybindings & Defaults**:
   - Auto-tiles windows by default (`tile-by-default = true`) with a `2px` red active-window border (`rgb(255,0,0)`), `2px` inner/outer gaps, and hidden titlebars (`show-title = false`).
   - Direct directional window movement (`<Super><Shift>Arrows/HJKL` and `<Primary><Super>Arrows/HJKL`) without entering a modal grab mode.
   - Workspaces `1–10` mapped to `<Super>1..0` (switch) and `<Super><Shift>1..0` (move window).

---

## Installation & Usage

### Build & Install from Source

```bash
cargo build --release
install -Dm755 target/release/kelp ~/.local/bin/kelp

# Install extension to ~/.local/share/gnome-shell/extensions/kelp@ubermetroid.github.io,
# write ~/.config/kelp/config.json, apply Hyprland-style gsettings, and enable the extension:
kelp
```

### Generate an `extensions.gnome.org` (EGO) Upload Bundle

```bash
kelp --pack .
# Produces: ./kelp@ubermetroid.github.io.shell-extension.zip
```

### CLI Options

```text
USAGE:
    kelp [OPTIONS]

OPTIONS:
    --user              Install extension into ~/.local/share/gnome-shell/extensions/kelp@ubermetroid.github.io (default)
    --system            Install extension system-wide in /usr/share/gnome-shell/extensions/kelp@ubermetroid.github.io (uses run0 if not root)
    --pack [OUT_DIR]    Build an EGO-ready kelp@ubermetroid.github.io.shell-extension.zip bundle in OUT_DIR (default: .)
    --target-dir <DIR>  Install extension files into a custom directory
    --skip-gsettings    Install files only; do not run gsettings or gnome-extensions
    --dry-run           Print actions without modifying the system
    -h, --help          Print this help message
```

---

## Repository Structure

```text
kelp/
├── AGENTS.md           # House Laws, Page Rule (16–256 lines), and EGO invariants
├── Cargo.toml          # Zero external dependencies
├── config/             # Default floating window exceptions (config.json)
├── extension/          # EGO-compliant GNOME Shell Extension (kelp@ubermetroid.github.io)
├── keybindings/        # GNOME Settings keyboard shortcut XML definitions
├── schemas/            # GSettings schema (org.gnome.shell.extensions.kelp.gschema.xml)
├── src/                # Modular Rust installer & EGO packager (7 focused pages)
└── tests/              # Page Rule, EGO static lint, and installer/packager integration tests
```

---

## License

GPL-3.0-only (see [LICENSE](LICENSE)). Original Pop Shell copyright System76; Kelp hardening and EGO port copyright UberMetroid.
