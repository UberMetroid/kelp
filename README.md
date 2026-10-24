# Kelp (`UberMetroid/kelp`)

**Kelp** is a hardened, zero-subprocess, low-latency **Wayland auto-tiling extension** for **GNOME 50 & GNOME 51 (Mutter 18 / 19)** on Fedora Linux, bundled with a **zero-dependency pure-Rust installer (`kelp`)** that embeds all extension assets, schemas, floating exceptions, and Hyprland-style keybindings into a single native binary.

Named after the underwater kelp forest to match the extension's core `Forest` binary-tree tiling data structure (`forest.js`).

---

## Hardening & Performance Optimizations Over Upstream `pop-shell`

1. **Zero Subprocess Spawning & Dead Module Elimination (~35 KB of legacy JS removed)**
   - **Deleted legacy modules**: Removed `launcher.js`, `launcher_service.js`, `search.js`, `context.js`, `scheduler.js`, `xprop.js`, `dbus_service.js`, `color_dialog/`, and `floating_exceptions/`.
   - **Zero `Gio.Subprocess` / `GLib.spawn_*` calls**: Removed `async_process()`, `async_process_ipc()`, and `os_release()` from `utils.js`, external GJS dialog spawners from `panel_settings.js` and `extension.js`, and blocking X11 `xprop` calls from `window.js`.
   - **Pure Wayland / Mutter window inspection**: `ShellWindow` queries `this.meta.get_role()` and `this.meta.is_client_decorated?.() ?? true` directly without synchronous `/proc/<pid>/cmdline` file reads or external processes.
   - **Removed unauthenticated D-Bus surface & failed Pop!_OS IPC**: Eliminated the unauthenticated `/com/System76/PopShell` D-Bus service (`dbus_service.js`) and failed D-Bus calls to Pop!_OS's `com.system76.Scheduler` (`scheduler.js`).

2. **Batched Event Execution & Zero Polling Timers (`executor.js`, `window.js`)**
   - **Batched `GLib.PRIORITY_HIGH_IDLE` Queue Drain**: Replaced TypeScript-transpiled `WeakMap` boilerplate in `executor.js` with native ES2022 private fields (`#event_loop`, `#events`) and updated `GLibExecutor.wake()` to drain the entire event queue in a single main-loop tick instead of processing one event per idle frame.
   - **Eliminated 600ms & 200–430ms Repeating Timers**: Removed the 5-iteration 600ms `ACTIVE_HINT_SHOW_ID` timer in `show_border()` and the 3-iteration 200–430ms `SCHEDULED_RESTACK` timer in `restack()`, replacing them with immediate event-driven border updates and restacking.

3. **Zero Hot-Path Logging & GSettings FFI Lookups (`log.js`, `extension.js`, `auto_tiler.js`)**
   - Cached `LOG_ENABLED` and the numeric log level in `log.js` (updated only on `changed::log-level`) so `log.debug()` / `log.info()` never cross the GObject FFI boundary to query `GSettings` during window operations.
   - Stripped and guarded hot-path template string allocations across `extension.js`, `auto_tiler.js`, and `prefs.js`.

4. **GNOME 50 & GNOME 51 (Mutter 18 / 19) API Compatibility**
   - Replaced removed `Clutter.Backend.get_default_seat()` with `global.stage.get_context().get_backend().get_default_seat().warp_pointer(x, y)`.
   - Replaced removed `Meta.MotionDirection` monitor/workspace neighbor lookups with `Meta.DisplayDirection.{LEFT,RIGHT,UP,DOWN}`.
   - Replaced all legacy GJS `imports.*` globals with standard ESM imports and `new TextDecoder().decode(...)`.
   - Added `this.meta.get_maximized()` checks and modern `St.BoxLayout({ orientation: Clutter.Orientation.* })` / `.add_child(...)` calls.
   - Added `org.gnome.desktop.interface` `color-scheme === 'prefer-dark'` detection and crisp `rgb(255,0,0)` active hint border styling.

---

## One-Command Installation

No shell scripts required. The `kelp` Rust binary embeds the entire hardened extension tree, compiled GSettings schemas, float rules, and `gsettings` configuration:

```bash
git clone git@github.com:UberMetroid/kelp.git ~/.local/src/kelp
cd ~/.local/src/kelp
cargo run --release
```

Or install the binary to `~/.local/bin/kelp` (or `~/.cargo/bin/kelp`) and run it anytime:

```bash
cargo install --path .
kelp
```

### Installer Flags

| Flag | Description |
| :--- | :--- |
| `--user` | **(Default)** Cleanly installs the extension to `~/.local/share/gnome-shell/extensions/pop-shell@system76.com` with compiled schemas, writes `~/.config/pop-shell/config.json`, applies all `gsettings`, and enables the extension. |
| `--system` | Installs the extension system-wide to `/usr/share/gnome-shell/extensions/pop-shell@system76.com`, `/usr/share/glib-2.0/schemas/`, and `/usr/share/gnome-control-center/keybindings/` (elevates via `run0` if not root), then applies user `gsettings`. |
| `--target-dir <DIR>` | Extracts the hardened extension tree and compiled schemas to `<DIR>`. |
| `--skip-gsettings` | Installs files only without executing `gsettings` or `gnome-extensions`. |
| `--dry-run` | Prints every file write and `gsettings` command without modifying the system. |

---

## Hyprland-Style Keybindings & Tiling Configuration

`kelp` configures GNOME 50/51 for a keyboard-driven, Hyprland-inspired workflow:

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
| **Enter Adjustment / Resize Mode** | `Super + Enter` (`Shift + Arrows/HJKL` to resize, `Enter`/`Esc` to exit) | `Super + Enter` |
| **GNOME Quick Settings** (remapped off `Super+S`) | `Ctrl + Super + S` | `Ctrl + Super + S` |

---

## Floating Exceptions (`~/.config/pop-shell/config.json`)

Installed automatically by `kelp`:

- `steam`
- `caligula`
- `btm`
- `macchina`
- `log_on_focus: false`

---

## License & Attribution

**License**: [GNU General Public License v3.0 only (GPL-3.0-only)](./LICENSE)

**Attribution & Notice of Modification**:
- Original work: Copyright © System76, Inc. (`https://github.com/pop-os/shell`), distributed under the GNU General Public License v3.0.
- Modified work (`kelp`): Copyright © 2026 UberMetroid (`https://github.com/UberMetroid/kelp`).
- Per GPL-3.0 § 5, this repository is a modified derivative work of System76's `pop-shell` refactored into a hardened, Wayland-native GNOME 50/51+ auto-tiling core with all legacy subprocess spawners, X11 `xprop` helpers, `pop-launcher` integration, `system76-scheduler` IPC, and unauthenticated D-Bus services removed, packaged with a standalone Rust installer.
