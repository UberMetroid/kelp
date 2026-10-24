use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

const EXTENSION_UUID: &str = "pop-shell@system76.com";

const EMBEDDED_EXTENSION_FILES: &[(&str, &[u8])] = &[
    ("arena.js", include_bytes!("../extension/arena.js")),
    ("auto_tiler.js", include_bytes!("../extension/auto_tiler.js")),
    (
        "color_dialog/main.js",
        include_bytes!("../extension/color_dialog/main.js"),
    ),
    ("config.js", include_bytes!("../extension/config.js")),
    ("context.js", include_bytes!("../extension/context.js")),
    ("dark.css", include_bytes!("../extension/dark.css")),
    ("dbus_service.js", include_bytes!("../extension/dbus_service.js")),
    (
        "dialog_add_exception.js",
        include_bytes!("../extension/dialog_add_exception.js"),
    ),
    ("ecs.js", include_bytes!("../extension/ecs.js")),
    ("error.js", include_bytes!("../extension/error.js")),
    ("events.js", include_bytes!("../extension/events.js")),
    ("executor.js", include_bytes!("../extension/executor.js")),
    ("extension.js", include_bytes!("../extension/extension.js")),
    (
        "floating_exceptions/config.js",
        include_bytes!("../extension/floating_exceptions/config.js"),
    ),
    (
        "floating_exceptions/main.js",
        include_bytes!("../extension/floating_exceptions/main.js"),
    ),
    (
        "floating_exceptions/utils.js",
        include_bytes!("../extension/floating_exceptions/utils.js"),
    ),
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
    ("keybindings.js", include_bytes!("../extension/keybindings.js")),
    ("launcher.js", include_bytes!("../extension/launcher.js")),
    (
        "launcher_service.js",
        include_bytes!("../extension/launcher_service.js"),
    ),
    ("lib.js", include_bytes!("../extension/lib.js")),
    ("light.css", include_bytes!("../extension/light.css")),
    ("log.js", include_bytes!("../extension/log.js")),
    ("metadata.json", include_bytes!("../extension/metadata.json")),
    ("movement.js", include_bytes!("../extension/movement.js")),
    ("node.js", include_bytes!("../extension/node.js")),
    ("once_cell.js", include_bytes!("../extension/once_cell.js")),
    (
        "panel_settings.js",
        include_bytes!("../extension/panel_settings.js"),
    ),
    ("paths.js", include_bytes!("../extension/paths.js")),
    ("prefs.js", include_bytes!("../extension/prefs.js")),
    ("rectangle.js", include_bytes!("../extension/rectangle.js")),
    ("result.js", include_bytes!("../extension/result.js")),
    ("scheduler.js", include_bytes!("../extension/scheduler.js")),
    (
        "schemas/gschemas.compiled",
        include_bytes!("../extension/schemas/gschemas.compiled"),
    ),
    (
        "schemas/org.gnome.shell.extensions.pop-shell.gschema.xml",
        include_bytes!("../extension/schemas/org.gnome.shell.extensions.pop-shell.gschema.xml"),
    ),
    ("search.js", include_bytes!("../extension/search.js")),
    ("settings.js", include_bytes!("../extension/settings.js")),
    ("shell.js", include_bytes!("../extension/shell.js")),
    (
        "shortcut_overlay.js",
        include_bytes!("../extension/shortcut_overlay.js"),
    ),
    ("stack.js", include_bytes!("../extension/stack.js")),
    ("tags.js", include_bytes!("../extension/tags.js")),
    ("tiling.js", include_bytes!("../extension/tiling.js")),
    ("utils.js", include_bytes!("../extension/utils.js")),
    ("window.js", include_bytes!("../extension/window.js")),
    ("xprop.js", include_bytes!("../extension/xprop.js")),
];

const EMBEDDED_SCHEMA_XML: &[u8] =
    include_bytes!("../schemas/org.gnome.shell.extensions.pop-shell.gschema.xml");

const EMBEDDED_KEYBINDINGS: &[(&str, &[u8])] = &[
    (
        "10-pop-shell-move.xml",
        include_bytes!("../keybindings/10-pop-shell-move.xml"),
    ),
    (
        "10-pop-shell-navigate.xml",
        include_bytes!("../keybindings/10-pop-shell-navigate.xml"),
    ),
    (
        "10-pop-shell-tile.xml",
        include_bytes!("../keybindings/10-pop-shell-tile.xml"),
    ),
];

const EMBEDDED_CONFIG_JSON: &[u8] = include_bytes!("../config/config.json");

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Options {
    pub system: bool,
    pub dry_run: bool,
    pub skip_gsettings: bool,
    pub target_dir: Option<PathBuf>,
    pub help: bool,
}

pub fn parse_args<I>(args: I) -> Result<Options, String>
where
    I: IntoIterator<Item = String>,
{
    let mut opts = Options::default();
    let mut iter = args.into_iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "-h" | "--help" => opts.help = true,
            "--system" => opts.system = true,
            "--user" => opts.system = false,
            "--dry-run" => opts.dry_run = true,
            "--skip-gsettings" => opts.skip_gsettings = true,
            "--target-dir" => {
                let dir = iter
                    .next()
                    .ok_or_else(|| "--target-dir requires a path argument".to_string())?;
                if dir.is_empty() {
                    return Err("--target-dir cannot be empty".to_string());
                }
                opts.target_dir = Some(PathBuf::from(dir));
            }
            other => {
                return Err(format!("Unknown argument: {other}"));
            }
        }
    }
    Ok(opts)
}

pub fn gsettings_commands(schema_dir: Option<&Path>) -> Vec<Vec<String>> {
    let mut cmds = Vec::new();

    let mut add = |schema: &str, key: &str, val: &str, needs_ext_schema: bool| {
        let mut cmd = vec!["gsettings".to_string()];
        if needs_ext_schema {
            if let Some(dir) = schema_dir {
                cmd.push("--schemadir".to_string());
                cmd.push(dir.to_string_lossy().into_owned());
            }
        }
        cmd.push("set".to_string());
        cmd.push(schema.to_string());
        cmd.push(key.to_string());
        cmd.push(val.to_string());
        cmds.push(cmd);
    };

    // Mutter & WM preferences
    add("org.gnome.mutter", "auto-maximize", "false", false);
    add("org.gnome.mutter", "edge-tiling", "false", false);
    add(
        "org.gnome.mutter.keybindings",
        "toggle-tiled-left",
        "[]",
        false,
    );
    add(
        "org.gnome.mutter.keybindings",
        "toggle-tiled-right",
        "[]",
        false,
    );
    add(
        "org.gnome.desktop.wm.preferences",
        "focus-mode",
        "'click'",
        false,
    );

    // Avoid <Super>s collision with toggle-stacking-global
    add(
        "org.gnome.shell.keybindings",
        "toggle-quick-settings",
        "['<Super><Control>s']",
        false,
    );

    // Pop Shell core & appearance settings
    let pop = "org.gnome.shell.extensions.pop-shell";
    add(pop, "mouse-cursor-follows-active-window", "false", true);
    add(pop, "tile-by-default", "true", true);
    add(pop, "active-hint", "true", true);
    add(pop, "active-hint-border-radius", "2", true);
    add(pop, "hint-color-rgba", "'rgb(255,0,0)'", true);
    add(pop, "gap-inner", "2", true);
    add(pop, "gap-outer", "2", true);
    add(pop, "smart-gaps", "false", true);
    add(pop, "show-title", "false", true);
    add(pop, "log-level", "0", true);

    // Hyprland-style global directional window movement (<Primary><Super> + <Super><Shift>)
    add(
        pop,
        "tile-move-left-global",
        "['<Primary><Super>Left', '<Primary><Super>KP_Left', '<Primary><Super>h', '<Super><Shift>Left', '<Super><Shift>KP_Left', '<Super><Shift>h']",
        true,
    );
    add(
        pop,
        "tile-move-right-global",
        "['<Primary><Super>Right', '<Primary><Super>KP_Right', '<Primary><Super>l', '<Super><Shift>Right', '<Super><Shift>KP_Right', '<Super><Shift>l']",
        true,
    );
    add(
        pop,
        "tile-move-up-global",
        "['<Primary><Super>Up', '<Primary><Super>KP_Up', '<Primary><Super>k', '<Super><Shift>Up', '<Super><Shift>KP_Up', '<Super><Shift>k']",
        true,
    );
    add(
        pop,
        "tile-move-down-global",
        "['<Primary><Super>Down', '<Primary><Super>KP_Down', '<Primary><Super>j', '<Super><Shift>Down', '<Super><Shift>KP_Down', '<Super><Shift>j']",
        true,
    );

    // Prevent conflicts with <Super><Shift>Arrows/HJKL on pop-monitor-* and pop-workspace-*
    add(
        pop,
        "pop-monitor-left",
        "['<Super><Shift><Primary>Left', '<Super><Shift><Primary>KP_Left', '<Super><Shift><Primary>h']",
        true,
    );
    add(
        pop,
        "pop-monitor-right",
        "['<Super><Shift><Primary>Right', '<Super><Shift><Primary>KP_Right', '<Super><Shift><Primary>l']",
        true,
    );
    add(
        pop,
        "pop-monitor-up",
        "['<Super><Shift><Primary>Up', '<Super><Shift><Primary>KP_Up', '<Super><Shift><Primary>k']",
        true,
    );
    add(
        pop,
        "pop-monitor-down",
        "['<Super><Shift><Primary>Down', '<Super><Shift><Primary>KP_Down', '<Super><Shift><Primary>j']",
        true,
    );
    add(
        pop,
        "pop-workspace-up",
        "['<Super><Shift>Page_Up', '<Super><Shift><Alt>Up', '<Super><Shift><Alt>k']",
        true,
    );
    add(
        pop,
        "pop-workspace-down",
        "['<Super><Shift>Page_Down', '<Super><Shift><Alt>Down', '<Super><Shift><Alt>j']",
        true,
    );

    // Workspace 1..10 switching & moving
    let wm_keys = "org.gnome.desktop.wm.keybindings";
    for i in 1..=9 {
        add(
            wm_keys,
            &format!("switch-to-workspace-{i}"),
            &format!("['<Super>{i}']"),
            false,
        );
        add(
            wm_keys,
            &format!("move-to-workspace-{i}"),
            &format!("['<Super><Shift>{i}']"),
            false,
        );
    }
    add(wm_keys, "switch-to-workspace-10", "['<Super>0']", false);
    add(
        wm_keys,
        "move-to-workspace-10",
        "['<Super><Shift>0']",
        false,
    );

    // Relative workspace navigation & moving
    add(
        wm_keys,
        "switch-to-workspace-left",
        "['<Super><Alt>Left', '<Super><Alt>h']",
        false,
    );
    add(
        wm_keys,
        "switch-to-workspace-right",
        "['<Super><Alt>Right', '<Super><Alt>l']",
        false,
    );
    add(
        wm_keys,
        "switch-to-workspace-up",
        "['<Super><Alt>Up', '<Super><Alt>k']",
        false,
    );
    add(
        wm_keys,
        "switch-to-workspace-down",
        "['<Super><Alt>Down', '<Super><Alt>j']",
        false,
    );
    add(
        wm_keys,
        "move-to-workspace-left",
        "['<Super><Alt><Shift>Left', '<Super><Alt><Shift>h']",
        false,
    );
    add(
        wm_keys,
        "move-to-workspace-right",
        "['<Super><Alt><Shift>Right', '<Super><Alt><Shift>l']",
        false,
    );

    cmds
}

pub fn install_extension_tree(dest_dir: &Path, dry_run: bool) -> Result<(), String> {
    if dry_run {
        println!(
            "[dry-run] Would write {} extension files to {}",
            EMBEDDED_EXTENSION_FILES.len(),
            dest_dir.display()
        );
        return Ok(());
    }

    for (rel_path, bytes) in EMBEDDED_EXTENSION_FILES {
        let full_path = dest_dir.join(rel_path);
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory {}: {e}", parent.display()))?;
        }
        fs::write(&full_path, bytes)
            .map_err(|e| format!("Failed to write {}: {e}", full_path.display()))?;
    }

    // Recompile schemas if glib-compile-schemas is present on the system
    let schemas_dir = dest_dir.join("schemas");
    if schemas_dir.exists() {
        let _ = Command::new("glib-compile-schemas")
            .arg(&schemas_dir)
            .status();
    }

    Ok(())
}

pub fn install_config_json(home_dir: &Path, dry_run: bool) -> Result<PathBuf, String> {
    let config_path = home_dir.join(".config/pop-shell/config.json");
    if dry_run {
        println!("[dry-run] Would write {}", config_path.display());
        return Ok(config_path);
    }
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }
    fs::write(&config_path, EMBEDDED_CONFIG_JSON)
        .map_err(|e| format!("Failed to write {}: {e}", config_path.display()))?;
    Ok(config_path)
}

fn is_root() -> bool {
    Command::new("id")
        .arg("-u")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim() == "0")
        .unwrap_or(false)
}

fn install_system_wide(dry_run: bool) -> Result<(), String> {
    let sys_ext_dir = Path::new("/usr/share/gnome-shell/extensions").join(EXTENSION_UUID);
    let sys_schema_dir = Path::new("/usr/share/glib-2.0/schemas");
    let sys_keybindings_dir = Path::new("/usr/share/gnome-control-center/keybindings");

    if dry_run {
        println!(
            "[dry-run] Would install extension system-wide to {}",
            sys_ext_dir.display()
        );
        println!(
            "[dry-run] Would install schema to {}/org.gnome.shell.extensions.pop-shell.gschema.xml",
            sys_schema_dir.display()
        );
        println!(
            "[dry-run] Would install keybinding XMLs to {}",
            sys_keybindings_dir.display()
        );
        return Ok(());
    }

    if is_root() {
        install_extension_tree(&sys_ext_dir, false)?;
        if sys_schema_dir.exists() {
            let schema_path = sys_schema_dir.join("org.gnome.shell.extensions.pop-shell.gschema.xml");
            fs::write(&schema_path, EMBEDDED_SCHEMA_XML)
                .map_err(|e| format!("Failed to write {}: {e}", schema_path.display()))?;
            let _ = Command::new("glib-compile-schemas")
                .arg(sys_schema_dir)
                .status();
        }
        if sys_keybindings_dir.exists() {
            for (name, bytes) in EMBEDDED_KEYBINDINGS {
                let kb_path = sys_keybindings_dir.join(name);
                fs::write(&kb_path, bytes)
                    .map_err(|e| format!("Failed to write {}: {e}", kb_path.display()))?;
            }
        }
        Ok(())
    } else {
        // Stage into a temporary directory and invoke run0 to copy into /usr/share
        let staging_dir = env::temp_dir().join(format!("pop-shell-gnome50-stage-{}", std::process::id()));
        let stage_ext = staging_dir.join("extension");
        let stage_schema = staging_dir.join("org.gnome.shell.extensions.pop-shell.gschema.xml");
        let stage_kb = staging_dir.join("keybindings");

        fs::create_dir_all(&stage_kb)
            .map_err(|e| format!("Failed to create staging dir: {e}"))?;
        install_extension_tree(&stage_ext, false)?;
        fs::write(&stage_schema, EMBEDDED_SCHEMA_XML)
            .map_err(|e| format!("Failed to write staged schema: {e}"))?;
        for (name, bytes) in EMBEDDED_KEYBINDINGS {
            fs::write(stage_kb.join(name), bytes)
                .map_err(|e| format!("Failed to write staged keybinding {name}: {e}"))?;
        }

        println!("==> Elevating via run0 to install into /usr/share...");
        let mut script = format!(
            "mkdir -p '{ext}' && cp -r '{stage_ext}/.' '{ext}'",
            ext = sys_ext_dir.display(),
            stage_ext = stage_ext.display()
        );
        if sys_schema_dir.exists() {
            script.push_str(&format!(
                " && cp '{stage_schema}' '{sys_schema}/org.gnome.shell.extensions.pop-shell.gschema.xml' && glib-compile-schemas '{sys_schema}'",
                stage_schema = stage_schema.display(),
                sys_schema = sys_schema_dir.display()
            ));
        }
        if sys_keybindings_dir.exists() {
            script.push_str(&format!(
                " && cp -r '{stage_kb}/.' '{sys_kb}'",
                stage_kb = stage_kb.display(),
                sys_kb = sys_keybindings_dir.display()
            ));
        }

        let status = Command::new("run0")
            .args(["sh", "-c", &script])
            .status()
            .map_err(|e| format!("Failed to execute run0: {e}"))?;
        let _ = fs::remove_dir_all(&staging_dir);
        if !status.success() {
            return Err("run0 failed to install system-wide extension files".to_string());
        }
        Ok(())
    }
}

fn print_help() {
    println!(
        "pop-shell-installer 1.0.0
GNOME 50 & 51 (Mutter 18 / 19) patched Pop Shell auto-tiler + Hyprland-style configuration installer

USAGE:
    pop-shell-installer [OPTIONS]

OPTIONS:
    --user              Install extension into ~/.local/share/gnome-shell/extensions (default)
    --system            Install/patch extension system-wide in /usr/share/gnome-shell/extensions (uses run0 if not root)
    --target-dir <DIR>  Install extension files into a custom directory
    --skip-gsettings    Install files only; do not run gsettings or gnome-extensions
    --dry-run           Print actions without modifying the system
    -h, --help          Print this help message"
    );
}

fn run() -> Result<(), String> {
    let opts = parse_args(env::args().skip(1))?;
    if opts.help {
        print_help();
        return Ok(());
    }

    let home = env::var("HOME")
        .map(PathBuf::from)
        .map_err(|_| "HOME environment variable is not set".to_string())?;

    let schema_dir = if let Some(ref custom_dir) = opts.target_dir {
        println!(
            "==> Installing Pop Shell (GNOME 50/51 patched) to {}...",
            custom_dir.display()
        );
        install_extension_tree(custom_dir, opts.dry_run)?;
        Some(custom_dir.join("schemas"))
    } else if opts.system {
        println!("==> Installing Pop Shell (GNOME 50/51 patched) system-wide...");
        install_system_wide(opts.dry_run)?;
        None
    } else {
        let user_ext_dir = home
            .join(".local/share/gnome-shell/extensions")
            .join(EXTENSION_UUID);
        println!(
            "==> Installing Pop Shell (GNOME 50/51 patched) to {}...",
            user_ext_dir.display()
        );
        install_extension_tree(&user_ext_dir, opts.dry_run)?;
        Some(user_ext_dir.join("schemas"))
    };

    let cfg_path = install_config_json(&home, opts.dry_run)?;
    println!("==> Wrote float exceptions & config to {}", cfg_path.display());

    if !opts.skip_gsettings {
        println!("==> Applying Hyprland-style GNOME & Pop Shell gsettings...");
        let cmds = gsettings_commands(schema_dir.as_deref());
        for cmd in cmds {
            if opts.dry_run {
                println!("[dry-run] {}", cmd.join(" "));
            } else {
                let status = Command::new(&cmd[0])
                    .args(&cmd[1..])
                    .status()
                    .map_err(|e| format!("Failed to execute {}: {e}", cmd[0]))?;
                if !status.success() {
                    return Err(format!("Command failed: {}", cmd.join(" ")));
                }
            }
        }

        if opts.dry_run {
            println!("[dry-run] gnome-extensions enable {EXTENSION_UUID}");
        } else {
            println!("==> Enabling {EXTENSION_UUID}...");
            let _ = Command::new("gnome-extensions")
                .args(["enable", EXTENSION_UUID])
                .status();
        }
    }

    println!("==> Done! Pop Shell for GNOME 50/51 is installed and configured.");
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("Error: {e}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn test_parse_args_defaults() {
        let opts = parse_args(Vec::<String>::new()).unwrap();
        assert!(!opts.system);
        assert!(!opts.dry_run);
        assert!(!opts.skip_gsettings);
        assert!(opts.target_dir.is_none());
        assert!(!opts.help);
    }

    #[test]
    fn test_parse_args_flags() {
        let args = vec![
            "--system".to_string(),
            "--dry-run".to_string(),
            "--skip-gsettings".to_string(),
            "--target-dir".to_string(),
            "/tmp/test-pop".to_string(),
        ];
        let opts = parse_args(args).unwrap();
        assert!(opts.system);
        assert!(opts.dry_run);
        assert!(opts.skip_gsettings);
        assert_eq!(opts.target_dir, Some(PathBuf::from("/tmp/test-pop")));
    }

    #[test]
    fn test_parse_args_errors_on_unknown_or_empty() {
        assert!(parse_args(vec!["--unknown-flag".to_string()]).is_err());
        assert!(parse_args(vec!["--target-dir".to_string()]).is_err());
        assert!(parse_args(vec!["--target-dir".to_string(), "".to_string()]).is_err());
    }

    #[test]
    fn test_embedded_extension_patches_present() {
        // Verify metadata.json supports GNOME 50 and GNOME 51
        let (_, metadata_bytes) = EMBEDDED_EXTENSION_FILES
            .iter()
            .find(|(p, _)| *p == "metadata.json")
            .expect("metadata.json must be embedded");
        let metadata_str = std::str::from_utf8(metadata_bytes).unwrap();
        assert!(metadata_str.contains("\"50\""));
        assert!(metadata_str.contains("\"51\""));

        // Verify window.js uses get_default_seat().warp_pointer, get_maximized() forward-compat, and calls actor_exists()
        let (_, window_bytes) = EMBEDDED_EXTENSION_FILES
            .iter()
            .find(|(p, _)| *p == "window.js")
            .expect("window.js must be embedded");
        let window_str = std::str::from_utf8(window_bytes).unwrap();
        assert!(window_str.contains("get_default_seat().warp_pointer"));
        assert!(!window_str.contains("Clutter.Backend"));
        assert!(window_str.contains("this.meta.get_maximized"));
        assert!(!window_str.contains("!this.actor_exists "));

        // Verify tiling.js uses Meta.DisplayDirection instead of Meta.MotionDirection
        let (_, tiling_bytes) = EMBEDDED_EXTENSION_FILES
            .iter()
            .find(|(p, _)| *p == "tiling.js")
            .expect("tiling.js must be embedded");
        let tiling_str = std::str::from_utf8(tiling_bytes).unwrap();
        assert!(tiling_str.contains("Meta.DisplayDirection.LEFT"));

        // Verify settings.js checks color-scheme === 'prefer-dark'
        let (_, settings_bytes) = EMBEDDED_EXTENSION_FILES
            .iter()
            .find(|(p, _)| *p == "settings.js")
            .expect("settings.js must be embedded");
        let settings_str = std::str::from_utf8(settings_bytes).unwrap();
        assert!(settings_str.contains("prefer-dark"));

        // Verify launcher_service.js closes both stdin and stdout
        let (_, ls_bytes) = EMBEDDED_EXTENSION_FILES
            .iter()
            .find(|(p, _)| *p == "launcher_service.js")
            .expect("launcher_service.js must be embedded");
        let ls_str = std::str::from_utf8(ls_bytes).unwrap();
        assert!(ls_str.contains("close_stream(service.stdout)"));

        // Verify zero legacy GJS `imports.` usage and zero deprecated St.BoxLayout vertical/horizontal props across all embedded JS files
        for (path, bytes) in EMBEDDED_EXTENSION_FILES {
            if path.ends_with(".js") {
                let content = std::str::from_utf8(bytes).unwrap();
                assert!(
                    !content.contains("imports."),
                    "File {path} still contains legacy GJS `imports.` reference"
                );
                assert!(
                    !content.contains("vertical: true")
                        && !content.contains("vertical: false")
                        && !content.contains("horizontal: true")
                        && !content.contains("horizontal: false"),
                    "File {path} still contains deprecated St.BoxLayout vertical/horizontal property"
                );
            }
        }
    }

    #[test]
    fn test_gsettings_commands_completeness() {
        let cmds = gsettings_commands(Some(Path::new("/tmp/schemas")));
        let joined: Vec<String> = cmds.iter().map(|c| c.join(" ")).collect();

        assert!(joined.iter().any(|c| c.contains("org.gnome.mutter auto-maximize false")));
        assert!(joined.iter().any(|c| c.contains("org.gnome.mutter edge-tiling false")));
        assert!(joined.iter().any(|c| c.contains("org.gnome.desktop.wm.preferences focus-mode 'click'")));
        assert!(joined.iter().any(|c| c.contains("hint-color-rgba 'rgb(255,0,0)'")));
        assert!(joined.iter().any(|c| c.contains("active-hint-border-radius 2")));
        assert!(joined.iter().any(|c| c.contains("tile-move-left-global")));
        assert!(joined.iter().any(|c| c.contains("switch-to-workspace-10 ['<Super>0']")));
        assert!(joined.iter().any(|c| c.contains("move-to-workspace-10 ['<Super><Shift>0']")));
        assert!(joined.iter().any(|c| c.contains("toggle-quick-settings ['<Super><Control>s']")));
    }

    #[test]
    fn test_install_extension_tree_to_tempdir() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let temp_dir = env::temp_dir().join(format!("pop-shell-test-{nanos}"));
        install_extension_tree(&temp_dir, false).unwrap();

        assert!(temp_dir.join("extension.js").exists());
        assert!(temp_dir.join("window.js").exists());
        assert!(temp_dir.join("schemas/gschemas.compiled").exists());
        assert!(temp_dir.join("icons/pop-shell-auto-on-symbolic.svg").exists());

        fs::remove_dir_all(&temp_dir).unwrap();
    }
}
