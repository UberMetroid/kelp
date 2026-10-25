# <img src="extension/icons/pop-shell-auto-on-symbolic.svg" width="32" height="32" alt="Kelp Tiling Icon" /> Kelp

[![CI & EGO Bundle Verification](https://github.com/UberMetroid/kelp/actions/workflows/ci.yml/badge.svg)](https://github.com/UberMetroid/kelp/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/UberMetroid/kelp)](https://github.com/UberMetroid/kelp/releases/latest)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

**Kelp** (`kelp@ubermetroid.github.io`) brings Hyprland-style automatic window tiling, window stacking, and active focus borders to **GNOME 45–51 on Wayland**.

Built from System76's Pop Shell — stripped of legacy X11 and launcher bloat, and updated for modern GNOME (`45` through `51`, including Ubuntu 24.04+, Fedora, Arch, and Debian).

---

## What You Get Out of the Box

- **Automatic Binary Tree Tiling**: Windows automatically split and tile across monitors and workspaces as you open them.
- **Window Stacking (`Super + S`)**: Group tiled windows into tabbed stacks and switch tabs with directional focus keys.
- **Hyprland-Style Active Border**: High-contrast `2px` active window border (`rgb(255,0,0)`), `2px` inner/outer gaps, and window titlebars hidden by default.
- **Top-Bar Quick Menu**: One-click toggles for **Tile Windows**, **Keyboard Shortcuts (On/Off)**, **Focus Follows Mouse (On/Off)**, **Smart Gaps**, **Show Active Hint**, and **Retile Workspace**.
- **Built-In Float Rules**: Dialogs, Picture-in-Picture, Steam, `caligula`, `btm`, and `macchina` float automatically; add custom per-app or per-window exceptions in two clicks.
- **Identical Everywhere**: Installing from [GNOME Extensions](https://extensions.gnome.org/) or GitHub Releases gives you the exact same out-of-the-box configuration.

---

## Install in 10 Seconds

Download the latest release from [**GitHub Releases**](https://github.com/UberMetroid/kelp/releases/latest) and choose either method:

### Option 1: Standard GNOME Extension `.zip` (No compiler needed)

```bash
gnome-extensions install --force kelp@ubermetroid.github.io.shell-extension.zip
gnome-extensions enable kelp@ubermetroid.github.io
```

*(On Wayland, log out and log back in once if this is your first time installing the extension.)*

### Option 2: Standalone `kelp` CLI Installer

The standalone `kelp` binary installs the extension, compiles the GSettings schemas, and automatically clears GNOME's conflicting default `Ctrl + Super + Left/Right` edge-tiling shortcuts so directional tile movement works immediately:

```bash
chmod +x kelp-linux-x86_64
./kelp-linux-x86_64
```

Or build from source with Rust:

```bash
cargo install --path . --root ~/.local
kelp
```

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Super + Arrow` or `Super + H / J / K / L` | Focus window Left / Down / Up / Right |
| `Ctrl + Super + Arrow` or `Ctrl + Super + H / J / K / L` | Move tiled window Left / Down / Up / Right |
| `Super + Shift + Arrow` or `Super + Shift + H / J / K / L` | Move tiled window Left / Down / Up / Right |
| `Super + O` | Toggle split orientation (Horizontal / Vertical) |
| `Super + S` | Toggle tabbed stacking on the focused window |
| `Super + G` | Toggle floating mode for the focused window |
| `Super + Y` | Toggle auto-tiling on / off globally |
| `Super + Enter` | Enter interactive adjustment mode (`Arrows/HJKL` to move, `Shift + Arrows/HJKL` to resize, `Enter` to apply, `Esc` to cancel) |
| `Ctrl + Super + Shift + Arrow / H / J / K / L` | Move window to another monitor |
| `Super + Shift + Page_Up / Page_Down` | Move window to another workspace |

---

## Top-Bar Menu Controls

| Top-Bar Icon | Mode | Left-Click Action | Right-Click Action |
| :---: | :--- | :--- | :--- |
| <img src="extension/icons/pop-shell-auto-on-symbolic.svg" width="32" height="32" alt="Tiling ON Icon" /> | **Tiling ON** | Switch to Floating (**OFF**) | Open Quick Settings Menu |
| <img src="extension/icons/pop-shell-auto-off-symbolic.svg" width="32" height="32" alt="Tiling OFF Icon" /> | **Tiling OFF** | Switch to Auto-Tiling (**ON**) | Open Quick Settings Menu |

Right-clicking the top-bar icon opens the quick settings menu:

| Control | Default | Description |
| :--- | :--- | :--- |
| **Tile Windows** | **On** | Enable or disable automatic window tiling globally. |
| **Keyboard Shortcuts** | **On** | Turn all Kelp keyboard shortcuts on or off (useful for full-screen games, VMs, or remote desktop apps). |
| **Focus Follows Mouse** | **Off** | Switch GNOME's window focus mode between Click-to-Focus (`click`) and Focus-Follows-Mouse (`sloppy`). |
| **Retile Workspace** | Action | Immediately recalculate and snap all tiled windows on the active workspace into alignment. |
| **Floating Window Exceptions** | Action | Open the picker to float specific windows or applications. |
| **Show Active Hint** | **On** | Show or hide the colored border around the focused window. |
| **Smart Gaps** | **Off** | Hide outer screen gaps when only a single tiled window is open on a workspace. |
| **Active Hint Border Radius** | **`2` px** | Adjust the corner radius of the active window border (`0–30 px`). |
| **Gaps** | **`2` px** | Adjust inner and outer window gaps (`0–64 px`). |

All settings are also available in the standard GNOME Extensions **Preferences** window (`gnome-extensions prefs kelp@ubermetroid.github.io`).

---

## Why Trust Kelp? (Security & Privacy)

Because GNOME Shell extensions run inside your Wayland compositor process, Kelp is built to be small, transparent, and verifiable:

- **No background daemons or subprocesses**: Everything runs natively through GNOME Shell's window manager APIs.
- **No network access or telemetry**: Kelp never connects to the internet.
- **Zero third-party dependencies**: The extension uses zero `npm` packages, and the Rust installer uses only the Rust standard library (`0` external crates in `Cargo.lock`).
- **Clean disable & screen-lock behavior**: Disabling the extension or locking your screen cleanly removes all shortcuts, window borders, and signal listeners.

---

## Supported GNOME Versions

| GNOME Version | Distros | Status |
| :--- | :--- | :--- |
| **GNOME 50 / 51** | Fedora 44+, Arch Linux, GNOME Nightly | Supported |
| **GNOME 48 / 49** | Fedora 42 / 43, Ubuntu 25.04 / 25.10, Debian Testing | Supported |
| **GNOME 45 / 46 / 47** | Ubuntu 24.04 LTS, Debian 13, Fedora 39–41 | Supported |

---

## License

Released under the [GNU General Public License v3.0 or later](LICENSE) (`GPL-3.0-or-later`).
Derived from [System76 Pop Shell](https://github.com/pop-os/shell).
