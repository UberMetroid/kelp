// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Compile-time embedded asset manifest (`EXTENSION_FILES`, `ICON_FILES`, `SCHEMA_XML`,
//   `KEYBINDING_FILES`) baking every extension JS/CSS/SVG/XML file into the `kelp` binary.
// - Zero-Trust Boundary & Invariants:
//   Every relative path in `EXTENSION_FILES` and `ICON_FILES` is a static compile-time literal
//   with zero `..` traversal components, guaranteeing deterministic extraction into the user's
//   local GNOME Shell extension directory.

use crate::default_rules::{KEYBINDING_MOVE_XML, KEYBINDING_NAVIGATION_XML, KEYBINDING_TILING_XML};

pub const EXTENSION_UUID: &str = "kelp@ubermetroid.github.io";
pub const SCHEMA_ID: &str = "org.gnome.shell.extensions.kelp";
pub const SCHEMA_FILENAME: &str = "org.gnome.shell.extensions.kelp.gschema.xml";

pub const SCHEMA_XML: &str =
    include_str!("../extension/schemas/org.gnome.shell.extensions.kelp.gschema.xml");

/// Top-level subdirectories inside the extension bundle that must be passed as
/// `--extra-source=<dir>` to `gnome-extensions pack`.
pub const EXTENSION_SUBDIRS: &[&str] = &["engine", "window", "ui", "icons"];

/// Legacy flat filenames from older installations that must be purged on upgrade so stale
/// flat modules never shadow the modularized `engine/`, `window/`, and `ui/` pages.
pub const LEGACY_FLAT_FILES: &[&str] = &[
    "arena.js",
    "auto_tiler.js",
    "color_dialog.js",
    "config.js",
    "context.js",
    "dark.css",
    "dbus_service.js",
    "dialog_add_exception.js",
    "dialog_launcher.js",
    "ecs.js",
    "error.js",
    "events.js",
    "executor.js",
    "floating_exceptions.js",
    "focus.js",
    "forest.js",
    "fork.js",
    "geom.js",
    "grab_op.js",
    "highcontrast.css",
    "keybindings.js",
    "launcher.js",
    "launcher_service.js",
    "lib.js",
    "light.css",
    "log.js",
    "movement.js",
    "node.js",
    "once_cell.js",
    "panel_settings.js",
    "paths.js",
    "rectangle.js",
    "result.js",
    "scheduler.js",
    "search.js",
    "settings.js",
    "shell.js",
    "shortcut_overlay.js",
    "stack.js",
    "tags.js",
    "tiler.js",
    "tiling.js",
    "utils.js",
    "window.js",
    "xprop.js",
    "schemas/org.gnome.shell.extensions.pop-shell.gschema.xml",
    "icons/pop-shell-auto-on-symbolic.svg",
    "icons/pop-shell-auto-off-symbolic.svg",
];

/// Legacy subdirectories from older Pop Shell / Kelp releases that must be removed on upgrade.
pub const LEGACY_DIRS: &[&str] = &["color_dialog", "floating_exceptions"];

/// Legacy GNOME Control Center keybinding filenames that must be removed on upgrade.
pub const LEGACY_KEYBINDING_FILES: &[&str] = &[
    "50-kelp-launchers.xml",
    "50-kelp-navigation.xml",
    "50-kelp-tiling.xml",
    "50-org.gnome.shell.extensions.pop-shell.xml",
    "10-pop-shell-launchers.xml",
    "10-pop-shell-move.xml",
    "10-pop-shell-navigate.xml",
    "10-pop-shell-tile.xml",
];

macro_rules! ext_file {
    ($rel:literal) => {
        ($rel, include_str!(concat!("../extension/", $rel)))
    };
}

pub const EXTENSION_FILES: &[(&str, &str)] = &[
    ext_file!("extension.js"),
    ext_file!("metadata.json"),
    ext_file!("prefs.js"),
    ext_file!("engine/ecs/arena.js"),
    ext_file!("engine/ecs/events.js"),
    ext_file!("engine/ecs/executor.js"),
    ext_file!("engine/ecs/world.js"),
    ext_file!("engine/geom/focus.js"),
    ext_file!("engine/geom/movement.js"),
    ext_file!("engine/geom/rectangle.js"),
    ext_file!("engine/geom/seahorse.js"),
    ext_file!("engine/tree/auto_tiler.js"),
    ext_file!("engine/tree/auto_tiler_drop.js"),
    ext_file!("engine/tree/forest.js"),
    ext_file!("engine/tree/forest_resize.js"),
    ext_file!("engine/tree/fork.js"),
    ext_file!("engine/tree/node.js"),
    ext_file!("engine/tree/tiler.js"),
    ext_file!("engine/tree/tiler_actions.js"),
    ext_file!("ui/dark.css"),
    ext_file!("ui/exception_dialog.js"),
    ext_file!("ui/highcontrast.css"),
    ext_file!("ui/light.css"),
    ext_file!("ui/panel_indicator.js"),
    ext_file!("ui/settings/color.js"),
    ext_file!("ui/settings/float_rules.js"),
    ext_file!("ui/settings/gsettings.js"),
    ext_file!("ui/settings/log.js"),
    ext_file!("ui/stack.js"),
    ext_file!("ui/stack_widgets.js"),
    ext_file!("window/controller.js"),
    ext_file!("window/controller_display.js"),
    ext_file!("window/controller_signals.js"),
    ext_file!("window/controller_workspace.js"),
    ext_file!("window/keybindings.js"),
    ext_file!("window/overview_tray.js"),
    ext_file!("window/shell_window.js"),
    ext_file!("window/window_border.js"),
    ext_file!("icons/kelp-seahorse-symbolic.svg"),
];

pub const ICON_FILES: &[(&str, &str)] = &[
    ext_file!("icons/kelp-auto-on-symbolic.svg"),
    ext_file!("icons/kelp-seahorse-symbolic.svg"),
    ext_file!("icons/kelp-auto-off-symbolic.svg"),
];

pub const KEYBINDING_FILES: &[(&str, &str)] = &[
    ("10-kelp-move.xml", KEYBINDING_MOVE_XML),
    ("10-kelp-navigate.xml", KEYBINDING_NAVIGATION_XML),
    ("10-kelp-tile.xml", KEYBINDING_TILING_XML),
];
