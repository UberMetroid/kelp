/// Official GNOME Extensions (EGO) UUID for Kelp.
pub const EXTENSION_UUID: &str = "kelp@ubermetroid.github.io";

/// Legacy Pop Shell UUID disabled/cleaned during migration.
pub const LEGACY_UUID: &str = "pop-shell@system76.com";

/// Official GSettings schema ID for Kelp.
pub const SCHEMA_ID: &str = "org.gnome.shell.extensions.kelp";

/// Official GSettings schema filename for Kelp.
pub const SCHEMA_FILENAME: &str = "org.gnome.shell.extensions.kelp.gschema.xml";

/// All embedded files that constitute the `kelp@ubermetroid.github.io` extension tree.
pub const EMBEDDED_EXTENSION_FILES: &[(&str, &[u8])] = &[
    ("arena.js", include_bytes!("../extension/arena.js")),
    (
        "auto_tiler.js",
        include_bytes!("../extension/auto_tiler.js"),
    ),
    ("config.js", include_bytes!("../extension/config.js")),
    ("dark.css", include_bytes!("../extension/dark.css")),
    (
        "dialog_add_exception.js",
        include_bytes!("../extension/dialog_add_exception.js"),
    ),
    ("ecs.js", include_bytes!("../extension/ecs.js")),
    ("error.js", include_bytes!("../extension/error.js")),
    ("events.js", include_bytes!("../extension/events.js")),
    ("executor.js", include_bytes!("../extension/executor.js")),
    ("extension.js", include_bytes!("../extension/extension.js")),
    ("focus.js", include_bytes!("../extension/focus.js")),
    ("forest.js", include_bytes!("../extension/forest.js")),
    ("fork.js", include_bytes!("../extension/fork.js")),
    ("geom.js", include_bytes!("../extension/geom.js")),
    ("grab_op.js", include_bytes!("../extension/grab_op.js")),
    (
        "highcontrast.css",
        include_bytes!("../extension/highcontrast.css"),
    ),
    (
        "icons/pop-shell-auto-off-symbolic.svg",
        include_bytes!("../extension/icons/pop-shell-auto-off-symbolic.svg"),
    ),
    (
        "icons/pop-shell-auto-on-symbolic.svg",
        include_bytes!("../extension/icons/pop-shell-auto-on-symbolic.svg"),
    ),
    (
        "keybindings.js",
        include_bytes!("../extension/keybindings.js"),
    ),
    ("lib.js", include_bytes!("../extension/lib.js")),
    ("light.css", include_bytes!("../extension/light.css")),
    ("log.js", include_bytes!("../extension/log.js")),
    (
        "metadata.json",
        include_bytes!("../extension/metadata.json"),
    ),
    ("movement.js", include_bytes!("../extension/movement.js")),
    ("node.js", include_bytes!("../extension/node.js")),
    (
        "panel_settings.js",
        include_bytes!("../extension/panel_settings.js"),
    ),
    ("prefs.js", include_bytes!("../extension/prefs.js")),
    ("rectangle.js", include_bytes!("../extension/rectangle.js")),
    ("result.js", include_bytes!("../extension/result.js")),
    (
        "schemas/gschemas.compiled",
        include_bytes!("../extension/schemas/gschemas.compiled"),
    ),
    (
        "schemas/org.gnome.shell.extensions.kelp.gschema.xml",
        include_bytes!("../extension/schemas/org.gnome.shell.extensions.kelp.gschema.xml"),
    ),
    ("settings.js", include_bytes!("../extension/settings.js")),
    ("stack.js", include_bytes!("../extension/stack.js")),
    ("tags.js", include_bytes!("../extension/tags.js")),
    ("tiling.js", include_bytes!("../extension/tiling.js")),
    ("utils.js", include_bytes!("../extension/utils.js")),
    ("window.js", include_bytes!("../extension/window.js")),
];

/// Embedded GSettings XML schema for system-wide `/usr/share/glib-2.0/schemas` installation.
pub const EMBEDDED_SCHEMA_XML: &[u8] =
    include_bytes!("../schemas/org.gnome.shell.extensions.kelp.gschema.xml");

/// Embedded GNOME Control Center keybinding definitions.
pub const EMBEDDED_KEYBINDINGS: &[(&str, &[u8])] = &[
    (
        "10-kelp-move.xml",
        include_bytes!("../keybindings/10-kelp-move.xml"),
    ),
    (
        "10-kelp-navigate.xml",
        include_bytes!("../keybindings/10-kelp-navigate.xml"),
    ),
    (
        "10-kelp-tile.xml",
        include_bytes!("../keybindings/10-kelp-tile.xml"),
    ),
];

/// Default floating window exceptions configuration file.
pub const EMBEDDED_CONFIG_JSON: &[u8] = include_bytes!("../config/config.json");
