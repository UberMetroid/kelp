# <img src="extension/icons/kelp-octopus-symbolic.svg" width="32" height="32" alt="Kelp Tiling Icon" /> Kelp

[![CI & EGO Bundle Verification](https://github.com/UberMetroid/kelp/actions/workflows/ci.yml/badge.svg)](https://github.com/UberMetroid/kelp/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/UberMetroid/kelp)](https://github.com/UberMetroid/kelp/releases/latest)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

**Kelp** (`kelp@ubermetroid.github.io`) brings 3 instant window-tiling modes themed after kelp forest animals — **Octopus (2D Grid)**, **Seahorse (Scrolling Strip)**, and **Otter (Floating)** — plus window stacking and active focus borders to **GNOME 45–51 on Wayland**.

Built from System76's Pop Shell — stripped of legacy X11 and launcher bloat, and updated for modern GNOME (`45` through `51`, including Ubuntu 24.04+, Fedora, Arch, and Debian).

---

## Three Kelp Forest Modes (One Left-Click Away)

Left-clicking the top-bar icon (or pressing `Super + Y`) cycles through all 3 modes and **immediately reformats every open window** on your workspace:

| Top-Bar Icon | Animal Mode | Layout Style | Left-Click / Scroll Action |
| :---: | :--- | :--- | :--- |
| <img src="extension/icons/kelp-octopus-symbolic.svg" width="32" height="32" alt="Octopus 2D Grid Icon" /> | **Octopus — 2D Grid** *(Default)* | Hyprland-style 2D Binary Space Partitioning (`OctopusTiler` + `Forest` in `engine/octopus/`) with tabbed stacks (`Super + S`). | Left-click switches to **Seahorse** |
| <img src="extension/icons/kelp-seahorse-symbolic.svg" width="32" height="32" alt="Seahorse Scrolling Strip Icon" /> | **Seahorse — Scrolling Strip** | Niri/PaperWM-style horizontal scrolling strip of full-height columns (`SeahorseTiler` in `engine/seahorse/`), showing up to 2 side-by-side columns (`Super + O` for 100% full-width, `Super + Enter` -> `Shift + Left/Right` or mouse drag to resize column widths) with clickable `8px` screen-edge peek slivers when off-screen neighbor columns exist. | Left-click switches to **Otter** · Mouse wheel scrolls columns |
| <img src="extension/icons/kelp-otter-symbolic.svg" width="32" height="32" alt="Otter Floating Icon" /> | **Otter — Floating** | Standard GNOME / Windows free-floating mode (`engine/otter/otter_tiler.js`) with gently cascaded windows, monitor edge-tiling, and `Ctrl/Shift + Super + Left/Right/Up/Down` 50% edge-snap. | Left-click switches to **Octopus** |

---

## What You Get Out of the Box

- **3 Instant Layout Modes**: Switch seamlessly between **Octopus (2D Grid)**, **Seahorse (Scrolling Strip)**, and **Otter (Floating)** at any time.
- **Window Stacking (`Super + S`)**: Group tiled windows into tabbed stacks in Octopus mode, or toggle 100% full-width columns in Seahorse mode.
- **Hyprland-Style Active Border**: High-contrast `2px` active window border (`rgb(255,0,0)`), `6px` inner/outer gaps, and window titlebars hidden by default.
- **Top-Bar Quick Menu**: Right-click to pick a mode directly or toggle **Keyboard Shortcuts (On/Off)**, **Focus Follows Mouse (On/Off)**, **Smart Gaps**, **Show Active Hint**, and **Retile Workspace**.
- **Built-In Float Rules**: Dialogs, Picture-in-Picture, Steam, `caligula`, `btm`, and `macchina` float automatically; add custom per-app or per-window exceptions in two clicks.
- **Identical Everywhere**: Installing from [GNOME Extensions](https://extensions.gnome.org/) or GitHub Releases gives you the exact same out-of-the-box configuration.

---

## Install in 10 Seconds

Download the latest release (`v1.6.0`) from [**GitHub Releases**](https://github.com/UberMetroid/kelp/releases/latest) and choose either method:

### Option 1: Standard GNOME Extension `.zip` (No compiler needed)

```bash
gnome-extensions install --force kelp@ubermetroid.github.io.shell-extension.zip
gnome-extensions enable kelp@ubermetroid.github.io
```

*(On Wayland, log out and log back in once if this is your first time installing the extension.)*

### Option 2: Standalone `kelp` CLI Installer

The standalone `kelp` binary installs the extension, compiles the GSettings schemas, configures desktop launcher/window shortcuts (`Super + Q`, `Super + M`, `Super + B`, `Super + F`, `Super + E`, `Super + Escape`), and automatically clears GNOME's conflicting default `Ctrl + Super + Left/Right` edge-tiling shortcuts so directional tile movement works immediately:

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
| `Super + Arrow` or `Super + H / J / K / L` | Focus window Left / Down / Up / Right (or scroll columns in **Seahorse** mode) |
| `Ctrl + Super + Arrow` or `Ctrl + Super + H / J / K / L` | Move tiled window / swap column / edge-snap floating window (**Otter** mode) |
| `Super + Shift + Arrow` or `Super + Shift + H / J / K / L` | Move tiled window / swap column / edge-snap floating window (**Otter** mode) |
| `Super + Q` | Close focused window (`<Super>q`, `<Alt>F4`) |
| `Super + M` | Toggle maximize on the focused window |
| `Super + B` | Open default web browser |
| `Super + F` | Open file manager |
| `Super + E` | Open default email client |
| `Super + Escape` | Lock screen / activate screensaver |
| `Super + O` | Toggle split orientation (**Octopus**) or 50% / 100% column width (**Seahorse**) |
| `Super + S` | Toggle tabbed stacking on the focused window |
| `Super + G` | Toggle floating mode for the focused window |
| `Super + Y` | Cycle Kelp tiling mode (**Octopus -> Seahorse -> Otter**) |
| `Super + Enter` | Enter interactive adjustment mode (`Arrows/HJKL` to move, `Shift + Arrows/HJKL` to resize, `Enter` to apply, `Esc` to cancel) |
| `Super + Alt + Arrow / H / J / K / L` | Switch to workspace Left / Down / Up / Right |
| `Super + Alt + Shift + Arrow / H / J / K / L` or `Super + Shift + Page_Up / Page_Down` | Move window to another workspace |
| `Ctrl + Super + Shift + Arrow / H / J / K / L` | Move window to another monitor |

---

## Right-Click Quick Settings Menu

Right-clicking the top-bar icon opens the quick settings menu:

| Control | Default | Description |
| :--- | :--- | :--- |
| **Octopus (2D Grid)** | **Active** | Hyprland-style 2D binary tree auto-tiling and stacking. |
| **Seahorse (Scrolling Strip)** | Mode | Niri-style horizontal scrolling strip of full-height vertical columns. |
| **Otter (Floating)** | Mode | Free-floating windows with edge-tiling and keyboard edge-snap. |
| **Keyboard Shortcuts** | **On** | Turn all Kelp keyboard shortcuts on or off (useful for full-screen games, VMs, or remote desktop apps). |
| **Focus Follows Mouse** | **Off** | Switch GNOME's window focus mode between Click-to-Focus (`click`) and Focus-Follows-Mouse (`sloppy`). |
| **Retile Workspace** | Action | Immediately recalculate and snap all open windows on the active workspace into alignment. |
| **Floating Window Exceptions** | Action | Open the picker to float specific windows or applications. |
| **Show Active Hint** | **On** | Show or hide the `2` px colored border around the focused window. |
| **Smart Gaps** | **Off** | Hide outer screen gaps when only a single tiled window is open on a workspace. |
| **Active Hint Border Radius** | **`2` px** | Adjust the corner radius of the active window border (`0–30 px`). |
| **Gaps** | **`6` px** | Adjust inner and outer window gaps (`0–64 px`). |

All settings are also available in the standard GNOME 45–51 Libadwaita Extensions **Preferences** window (`gnome-extensions prefs kelp@ubermetroid.github.io`).

---

## Why Trust Kelp? (Security & Privacy)

Because GNOME Shell extensions run inside your Wayland compositor process, Kelp is built to be small, transparent, and verifiable:

- **No background daemons or subprocesses**: Everything runs natively through GNOME Shell's window manager APIs.
- **No network access or telemetry**: Kelp never connects to the internet.
- **Zero third-party dependencies**: The extension uses zero `npm` packages, and the Rust installer uses only the Rust standard library (`0` external crates in `Cargo.lock`).
- **Clean disable & screen-lock behavior**: Disabling the extension or locking your screen cleanly removes all shortcuts, window borders, and signal listeners, and restores your previous Mutter `edge-tiling` setting.

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
