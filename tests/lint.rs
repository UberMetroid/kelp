//! Static lint gates for Rust (`src/`) and GNOME Shell Extension (`extension/`) EGO compliance.

use std::fs;
use std::path::Path;

use kelp::embedded_assets::{EMBEDDED_EXTENSION_FILES, EXTENSION_UUID, SCHEMA_FILENAME, SCHEMA_ID};

#[test]
fn rust_sources_have_no_shell_invocations() -> Result<(), String> {
    let src_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let entries = fs::read_dir(&src_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("rs") {
            let content = fs::read_to_string(&path).unwrap_or_default();
            for forbidden in [
                "\"sh\"",
                "\"bash\"",
                "\"zsh\"",
                "\"-c\"",
                "Command::new(\"sh\")",
                "Command::new(\"bash\")",
            ] {
                assert!(
                    !content.contains(forbidden),
                    "Rust source {} contains forbidden shell invocation token `{forbidden}`",
                    path.display()
                );
            }
        }
    }
    Ok(())
}

#[test]
fn ego_metadata_and_schema_compliance() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let metadata_str = fs::read_to_string(root.join("extension/metadata.json")).unwrap_or_default();

    assert!(metadata_str.contains(&format!("\"uuid\": \"{EXTENSION_UUID}\"")));
    assert!(metadata_str.contains(&format!("\"settings-schema\": \"{SCHEMA_ID}\"")));
    assert!(metadata_str.contains(&format!("\"gettext-domain\": \"{EXTENSION_UUID}\"")));
    assert!(metadata_str.contains("\"version-name\": \"1.0.0\""));
    for v in ["45", "46", "47", "48", "49", "50", "51"] {
        assert!(
            metadata_str.contains(&format!("\"{v}\"")),
            "metadata.json missing shell-version {v}"
        );
    }
    assert!(
        !metadata_str.contains("\"version\":"),
        "metadata.json must use version-name instead of deprecated integer version"
    );

    let schema_path = root.join("extension/schemas").join(SCHEMA_FILENAME);
    let schema_str = fs::read_to_string(&schema_path).unwrap_or_default();
    assert!(schema_str.contains(&format!("id=\"{SCHEMA_ID}\"")));
    assert!(schema_str.contains("path=\"/org/gnome/shell/extensions/kelp/\""));
    assert!(!schema_str.contains("activate-launcher"));
    assert!(!schema_str.contains("fullscreen-launcher"));
}

#[test]
fn ego_javascript_guidelines_and_process_boundaries() {
    for (path, bytes) in EMBEDDED_EXTENSION_FILES {
        if !path.ends_with(".js") {
            continue;
        }
        let content = std::str::from_utf8(bytes).unwrap_or_default();

        // Forbidden across ALL extension JS files (EGO guidelines)
        for forbidden in [
            "imports.",
            "spawn",
            "Subprocess",
            "globalThis.log",
            "globalThis.popShellExtension",
            "__classPrivateFieldGet",
            "__classPrivateFieldSet",
            "ByteArray",
            "Mainloop",
            "Lang.",
            "ExtensionUtils",
            "vertical: true",
            "vertical: false",
            "horizontal: true",
            "horizontal: false",
            "Clutter.Backend",
            "ACTIVE_HINT_SHOW_ID",
            "SCHEDULED_RESTACK",
            "/proc/",
        ] {
            assert!(
                !content.contains(forbidden),
                "JS file `{path}` contains EGO-forbidden construct `{forbidden}`"
            );
        }

        if *path == "prefs.js" {
            // prefs.js runs in the GTK4 preferences process: must NEVER import Shell/Meta/Clutter/St
            for forbidden_shell_import in [
                "gi://Clutter",
                "gi://Meta",
                "gi://Mtk",
                "gi://St",
                "gi://Shell",
                "resource:///org/gnome/shell/",
                "show_all",
            ] {
                assert!(
                    !content.contains(forbidden_shell_import),
                    "prefs.js must not import or call GNOME Shell API `{forbidden_shell_import}`"
                );
            }
        } else {
            // Shell process modules must NEVER import GTK/GDK/Adw
            for forbidden_gtk_import in ["gi://Gdk", "gi://Gtk", "gi://Adw"] {
                assert!(
                    !content.contains(forbidden_gtk_import),
                    "Shell module `{path}` must not import `{forbidden_gtk_import}` in GNOME Shell process"
                );
            }
        }
    }

    // Verify extension.js has no top-level object creation before enable() and cleans up in disable()
    let ext_bytes = EMBEDDED_EXTENSION_FILES
        .iter()
        .find(|(p, _)| *p == "extension.js")
        .map(|(_, b)| *b)
        .unwrap_or_default();
    let ext_str = std::str::from_utf8(ext_bytes).unwrap_or_default();
    assert!(!ext_str.contains("\nconst display = global.display"));
    assert!(!ext_str.contains("const STYLESHEETS ="));
    assert!(ext_str.contains("export default class KelpExtension extends Extension"));
    assert!(ext_str.contains("ext.destroy()"));
    assert!(ext_str.contains("this.unload_theme()"));
    assert!(ext_str.contains("this.exception_dialog.close()"));

    // Verify dialog_add_exception.js destroys its modal dialog on close
    let dialog_bytes = EMBEDDED_EXTENSION_FILES
        .iter()
        .find(|(p, _)| *p == "dialog_add_exception.js")
        .map(|(_, b)| *b)
        .unwrap_or_default();
    let dialog_str = std::str::from_utf8(dialog_bytes).unwrap_or_default();
    assert!(
        dialog_str.contains("destroyOnClose: true"),
        "AddExceptionDialog must set destroyOnClose: true to avoid leaking modal actors"
    );

    // Verify stack.js disconnects hint_signal in tab_disconnect
    let stack_bytes = EMBEDDED_EXTENSION_FILES
        .iter()
        .find(|(p, _)| *p == "stack.js")
        .map(|(_, b)| *b)
        .unwrap_or_default();
    let stack_str = std::str::from_utf8(stack_bytes).unwrap_or_default();
    assert!(
        stack_str.contains("c.hint_signal"),
        "stack.js must track and disconnect c.hint_signal in tab_disconnect()"
    );
}
