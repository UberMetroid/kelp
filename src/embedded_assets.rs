// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Compile-time embedded asset manifest (`EXTENSION_FILES`, `ICON_FILES`, `SCHEMA_XML`,
//   `KEYBINDING_FILES`) baking every extension JS/CSS/SVG/XML file into the `kelp` binary.
// - Zero-Trust Boundary & Invariants:
//   Every relative path in `EXTENSION_FILES` and `ICON_FILES` is a static compile-time literal
//   with zero `..` traversal components, guaranteeing deterministic extraction into the user's
//   local GNOME Shell extension directory.

use crate::default_rules::{
    KEYBINDING_LAUNCHERS_XML, KEYBINDING_NAVIGATION_XML, KEYBINDING_TILING_XML,
};

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
    "highcontrast.css",
    "keybindings.js",
    "launcher_service.js",
    "lib.js",
    "light.css",
    "log.js",
    "movement.js",
    "node.js",
    "panel_settings.js",
    "rectangle.js",
    "settings.js",
    "stack.js",
    "tiler.js",
    "utils.js",
    "window.js",
    "xprop.js",
];

pub const EXTENSION_FILES: &[(&str, &str)] = &[
    ("extension.js", include_str!("../extension/extension.js")),
    ("metadata.json", include_str!("../extension/metadata.json")),
    ("prefs.js", include_str!("../extension/prefs.js")),
    (
        "engine/ecs/arena.js",
        include_str!("../extension/engine/ecs/arena.js"),
    ),
    (
        "engine/ecs/events.js",
        include_str!("../extension/engine/ecs/events.js"),
    ),
    (
        "engine/ecs/executor.js",
        include_str!("../extension/engine/ecs/executor.js"),
    ),
    (
        "engine/ecs/world.js",
        include_str!("../extension/engine/ecs/world.js"),
    ),
    (
        "engine/geom/focus.js",
        include_str!("../extension/engine/geom/focus.js"),
    ),
    (
        "engine/geom/movement.js",
        include_str!("../extension/engine/geom/movement.js"),
    ),
    (
        "engine/geom/rectangle.js",
        include_str!("../extension/engine/geom/rectangle.js"),
    ),
    (
        "engine/tree/auto_tiler.js",
        include_str!("../extension/engine/tree/auto_tiler.js"),
    ),
    (
        "engine/tree/auto_tiler_drop.js",
        include_str!("../extension/engine/tree/auto_tiler_drop.js"),
    ),
    (
        "engine/tree/forest.js",
        include_str!("../extension/engine/tree/forest.js"),
    ),
    (
        "engine/tree/forest_resize.js",
        include_str!("../extension/engine/tree/forest_resize.js"),
    ),
    (
        "engine/tree/fork.js",
        include_str!("../extension/engine/tree/fork.js"),
    ),
    (
        "engine/tree/node.js",
        include_str!("../extension/engine/tree/node.js"),
    ),
    (
        "engine/tree/tiler.js",
        include_str!("../extension/engine/tree/tiler.js"),
    ),
    (
        "engine/tree/tiler_actions.js",
        include_str!("../extension/engine/tree/tiler_actions.js"),
    ),
    ("ui/dark.css", include_str!("../extension/ui/dark.css")),
    (
        "ui/exception_dialog.js",
        include_str!("../extension/ui/exception_dialog.js"),
    ),
    (
        "ui/highcontrast.css",
        include_str!("../extension/ui/highcontrast.css"),
    ),
    ("ui/light.css", include_str!("../extension/ui/light.css")),
    (
        "ui/panel_indicator.js",
        include_str!("../extension/ui/panel_indicator.js"),
    ),
    (
        "ui/settings/color.js",
        include_str!("../extension/ui/settings/color.js"),
    ),
    (
        "ui/settings/float_rules.js",
        include_str!("../extension/ui/settings/float_rules.js"),
    ),
    (
        "ui/settings/gsettings.js",
        include_str!("../extension/ui/settings/gsettings.js"),
    ),
    (
        "ui/settings/log.js",
        include_str!("../extension/ui/settings/log.js"),
    ),
    ("ui/stack.js", include_str!("../extension/ui/stack.js")),
    (
        "ui/stack_widgets.js",
        include_str!("../extension/ui/stack_widgets.js"),
    ),
    (
        "window/controller.js",
        include_str!("../extension/window/controller.js"),
    ),
    (
        "window/controller_display.js",
        include_str!("../extension/window/controller_display.js"),
    ),
    (
        "window/controller_signals.js",
        include_str!("../extension/window/controller_signals.js"),
    ),
    (
        "window/controller_workspace.js",
        include_str!("../extension/window/controller_workspace.js"),
    ),
    (
        "window/keybindings.js",
        include_str!("../extension/window/keybindings.js"),
    ),
    (
        "window/overview_tray.js",
        include_str!("../extension/window/overview_tray.js"),
    ),
    (
        "window/shell_window.js",
        include_str!("../extension/window/shell_window.js"),
    ),
    (
        "window/window_border.js",
        include_str!("../extension/window/window_border.js"),
    ),
];

pub const ICON_FILES: &[(&str, &str)] = &[
    (
        "icons/pop-shell-auto-on-symbolic.svg",
        include_str!("../extension/icons/pop-shell-auto-on-symbolic.svg"),
    ),
    (
        "icons/pop-shell-auto-off-symbolic.svg",
        include_str!("../extension/icons/pop-shell-auto-off-symbolic.svg"),
    ),
];

pub const KEYBINDING_FILES: &[(&str, &str)] = &[
    ("50-kelp-launchers.xml", KEYBINDING_LAUNCHERS_XML),
    ("50-kelp-navigation.xml", KEYBINDING_NAVIGATION_XML),
    ("50-kelp-tiling.xml", KEYBINDING_TILING_XML),
];
