# pop-shell-gnome50

Patched **System76 Pop Shell (`pop-shell@system76.com`)** auto-tiling extension for **GNOME 50 & GNOME 51 (Mutter 18 / 19)** on Fedora Linux, bundled with a **zero-dependency pure-Rust installer (`pop-shell-installer`)** that embeds all extension assets, schemas, floating exceptions, and Hyprland-style keybindings into a single native binary.

---

## What Was Fixed for GNOME 50 & GNOME 51 (Mutter 18 / 19)

Upstream `pop-shell` fails or throws runtime exceptions on GNOME 50 and GNOME 51 due to removed Clutter, St, Meta, and legacy GJS `imports` APIs. This repository bakes in the following fixes directly:

1. **Removed `Clutter.Backend.get_default_seat()` (`window.js`)**
   - In GNOME 50+ / Clutter 18+, `Clutter.get_default_backend().get_default_seat()` was removed, breaking pointer warping and throwing GJS exceptions during window activation.
   - Replaced with `global.stage.get_context().get_backend().get_default_seat().warp_pointer(x, y)`.
   - Wrapped `ShellWindow.activate()` in a defensive `try / catch` block checking `win.get_compositor_private()` and `destroying` state before raising or focusing windows.
   - Guarded `this.on_style_changed()` in `ShellWindow` constructor with `if (this.meta.get_compositor_private()?.get_stage())` so unparented actors do not trigger theme node warnings on creation.

2. **Replaced `Meta.MotionDirection` with `Meta.DisplayDirection` (`tiling.js`, `extension.js`)**
   - `global.display.get_monitor_neighbor_index()` and `Meta.MotionDirection` usage in monitor/directional lookup broke in Mutter 18+.
   - Replaced directional monitor resolution in `tiling.js` (`locate_monitor` and `move_window_or_monitor`) and `extension.js` (`move_workspace`, `move_monitor`) with `Meta.DisplayDirection.{LEFT,RIGHT,UP,DOWN}` and geometry-based work-area distance checks.

3. **Eliminated All Legacy GJS `imports.*` Globals & Subprocess Stream Leak (`extension.js`, `config.js`, `utils.js`, `xprop.js`, `launcher.js`, `launcher_service.js`, `floating_exceptions/*`)**
   - Replaced every `imports.byteArray.toString(...)` call with standard Web/GJS `new TextDecoder().decode(...)` and removed `imports.searchPath` manipulation for strict ESM compliance in GJS (GNOME 50 & 51).
   - Fixed `LauncherService.exit()` in `launcher_service.js` closing `service.stdin` twice instead of closing both `service.stdin` and `service.stdout`.

4. **Forward-Compatible `Meta.Window` Maximize, `ModalDialog`, & `St.BoxLayout` APIs (`window.js`, `panel_settings.js`, `search.js`, `shortcut_overlay.js`)**
   - Added `this.meta.get_maximized()` checks in `is_maximized()` and `is_snap_edge()` (with `Meta.MaximizeFlags?.VERTICAL ?? 2` fallback) alongside `maximized_horizontally` / `maximized_vertically` for Mutter 18/19 compatibility, removed deprecated `Meta.MaximizeFlags` arguments from `maximize()` / `unmaximize()`, and fixed `!this.actor_exists()` invocation in `ShellWindow.restack()`.
   - Replaced all deprecated `St.BoxLayout({ vertical: ... })` and `St.BoxLayout({ horizontal: ... })` properties with `orientation: Clutter.Orientation.VERTICAL / HORIZONTAL`, replaced `.add(...)` with `.add_child(...)`, and guarded `this.dialog.show_all()` with `this.dialog.show()` in `search.js`.

5. **Fixed Active Hint Border Bleed & GNOME 42+ Dark Mode Detection (`settings.js`, `dark.css`, `light.css`, `highcontrast.css`)**
   - `settings.js`: Checked `org.gnome.desktop.interface` `color-scheme === 'prefer-dark'` so GNOME 50/51's standard dark mode is detected without requiring a legacy `*dark*` GTK3 theme string.
   - `dark.css`, `light.css`, `highcontrast.css`: Zeroed the inner `box-shadow` alpha (`inset 0 0 0 1px rgba(..., 0)`) so the `2px` radius `rgb(255,0,0)` active window border renders crisp without an inner dark/gray halo.

6. **GNOME 50 & 51 Version Declaration (`metadata.json`)**
   - Declared `"50"` and `"51"` in `shell-version` (`["45", "46", "47", "48", "49", "50", "51"]`).

---

## One-Command Installation

No shell scripts required. The Rust binary embeds the entire patched extension tree, compiled GSettings schemas, float rules, and `gsettings` configuration:

```bash
git clone git@github.com:UberMetroid/pop-shell-gnome50.git ~/.local/src/pop-shell-gnome50
cd ~/.local/src/pop-shell-gnome50
cargo run --release
```

Or install the binary globally to `~/.cargo/bin` and run it anytime:

```bash
cargo install --path .
pop-shell-installer
```

### Installer Flags

| Flag | Description |
| :--- | :--- |
| `--user` | **(Default)** Installs extension to `~/.local/share/gnome-shell/extensions/pop-shell@system76.com` with compiled schemas, writes `~/.config/pop-shell/config.json`, applies all `gsettings`, and enables the extension. |
| `--system` | Installs/patches `/usr/share/gnome-shell/extensions/pop-shell@system76.com`, `/usr/share/glib-2.0/schemas/`, and `/usr/share/gnome-control-center/keybindings/` (elevates via `run0` if not root), then applies user `gsettings`. |
| `--target-dir <DIR>` | Extracts the patched extension tree and compiled schemas to `<DIR>`. |
| `--skip-gsettings` | Installs files only without executing `gsettings` or `gnome-extensions`. |
| `--dry-run` | Prints every file write and `gsettings` command without modifying the system. |

---

## Hyprland-Style Keybindings & Tiling Configuration

The installer configures GNOME 50/51 and Pop Shell for a keyboard-driven, Hyprland-inspired workflow:

- **Auto-tiling enabled by default** (`tile-by-default = true`)
- **Window gaps**: `2px` inner, `2px` outer (`smart-gaps = false`)
- **Active window border**: `3px` solid `#FF0000` (`rgb(255,0,0)`), `2px` border radius
- **Server-side titlebars hidden** (`show-title = false`)
- **Focus mode**: Click-to-focus (`focus-mode = 'click'`), cursor warping disabled (`mouse-cursor-follows-active-window = false`)
- **Mutter conflicts disabled**: `auto-maximize = false`, `edge-tiling = false`, `toggle-tiled-left/right = []`

### Keybindings Reference

| Action | Shortcut (Arrows) | Shortcut (Vim / HJKL) |
| :--- | :--- | :--- |
| **Focus Window** (Left / Down / Up / Right) | `Super + Left / Down / Up / Right` | `Super + H / J / K / L` |
| **Move / Swap Tiled Window** (Direct Global) | `Super + Shift + Left / Down / Up / Right`<br>`Ctrl + Super + Left / Down / Up / Right` | `Super + Shift + H / J / K / L`<br>`Ctrl + Super + H / J / K / L` |
| **Switch to Workspace 1–9, 10** | `Super + 1..9`, `Super + 0` | `Super + 1..9`, `Super + 0` |
| **Move Window to Workspace 1–9, 10** | `Super + Shift + 1..9`, `Super + Shift + 0` | `Super + Shift + 1..9`, `Super + Shift + 0` |
| **Switch Workspace Relative** (Left / Right / Up / Down) | `Super + Alt + Left / Right / Up / Down` | `Super + Alt + H / L / K / J` |
| **Move Window to Workspace** (Left / Right) | `Super + Alt + Shift + Left / Right` | `Super + Alt + Shift + H / L` |
| **Move Window to Workspace** (Up / Down) | `Super + Shift + Alt + Up / Down`<br>`Super + Shift + Page_Up / Page_Down` | `Super + Shift + Alt + K / J` |
| **Move Window to Monitor** (Left / Down / Up / Right) | `Ctrl + Super + Shift + Left / Down / Up / Right` | `Ctrl + Super + Shift + H / J / K / L` |
| **Toggle Floating / Tiled** | `Super + G` | `Super + G` |
| **Toggle Split Orientation** (Horizontal / Vertical) | `Super + O` | `Super + O` |
| **Toggle Stacking Mode** | `Super + S` | `Super + S` |
| **Toggle Auto-Tiling** | `Super + Y` | `Super + Y` |
| **Pop Shell Launcher / Window Search** | `Super + /` | `Super + /` |
| **Enter Adjustment / Resize Mode** | `Super + Enter` (`Shift + Arrows/HJKL` to resize, `Enter`/`Esc` to exit) | `Super + Enter` |
| **GNOME Quick Settings** (remapped off `Super+S`) | `Ctrl + Super + S` | `Ctrl + Super + S` |

---

## Floating Exceptions (`~/.config/pop-shell/config.json`)

Installed automatically by `pop-shell-installer`:

- `steam`
- `caligula`
- `btm`
- `macchina`
- `log_on_focus: false`

---

## License

GPL-3.0-only (upstream System76 Pop Shell license).
