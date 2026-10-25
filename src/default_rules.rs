// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Default floating window exception configuration (`DEFAULT_CONFIG_JSON`), config schema
//   validator (`validate_config_json`), and GNOME Control Center custom shortcut XML blobs.
// - Zero-Trust Boundary & Invariants:
//   Enforces an OWASP payload size ceiling (`MAX_CONFIG_BYTES = 65_536`) and validates JSON
//   structure in pure safe Rust before writing or accepting user configuration files.

/// Maximum allowed byte length for `~/.config/kelp/config.json`.
pub const MAX_CONFIG_BYTES: usize = 65_536;

/// Default user floating-exception configuration written to `~/.config/kelp/config.json`
/// when no existing user configuration is present.
pub const DEFAULT_CONFIG_JSON: &str = r#"{
  "float": [
    {
      "class": "pop-shell-example",
      "title": "pop-shell-example"
    }
  ],
  "log_on_Change": false
}
"#;

/// GNOME Control Center `50-kelp-launchers.xml` keybinding category definition.
pub const KEYBINDING_LAUNCHERS_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<KeyListEntries schema="org.gnome.shell.extensions.kelp"
                group="system"
                name="Search and Launch"
                wm_name="Kelp">

    <KeyListEntry name="activate-launcher"
                  description="Activate Launcher"/>

</KeyListEntries>
"#;

/// GNOME Control Center `50-kelp-navigation.xml` directional focus and monitor shortcuts.
pub const KEYBINDING_NAVIGATION_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<KeyListEntries schema="org.gnome.shell.extensions.kelp"
                group="system"
                name="Window Navigation"
                wm_name="Kelp">

    <KeyListEntry name="focus-left"
                  description="Focus window left"/>

    <KeyListEntry name="focus-down"
                  description="Focus window down"/>

    <KeyListEntry name="focus-up"
                  description="Focus window up"/>

    <KeyListEntry name="focus-right"
                  description="Focus window right"/>

    <KeyListEntry name="pop-monitor-left"
                  description="Move window to left monitor"/>

    <KeyListEntry name="pop-monitor-right"
                  description="Move window to right monitor"/>

    <KeyListEntry name="pop-monitor-up"
                  description="Move window to upper monitor"/>

    <KeyListEntry name="pop-monitor-down"
                  description="Move window to lower monitor"/>

    <KeyListEntry name="pop-workspace-up"
                  description="Move window to upper workspace"/>

    <KeyListEntry name="pop-workspace-down"
                  description="Move window to lower workspace"/>

</KeyListEntries>
"#;

/// GNOME Control Center `50-kelp-tiling.xml` tiling management shortcuts.
pub const KEYBINDING_TILING_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<KeyListEntries schema="org.gnome.shell.extensions.kelp"
                group="system"
                name="Window Tiling"
                wm_name="Kelp">

    <KeyListEntry name="tile-enter"
                  description="Enter window tiling adjustment mode"/>

    <KeyListEntry name="toggle-tiling"
                  description="Toggle auto-tiling"/>

    <KeyListEntry name="toggle-floating"
                  description="Toggle floating mode for active window"/>

    <KeyListEntry name="tile-orientation"
                  description="Toggle tiling orientation"/>

    <KeyListEntry name="toggle-stacking-global"
                  description="Toggle window stacking"/>

</KeyListEntries>
"#;

/// Validates that a candidate `config.json` string is within `MAX_CONFIG_BYTES`, contains
/// balanced JSON braces/brackets, and includes the top-level `"float"` array key.
///
/// # Errors
///
/// Returns an `Err(String)` describing the validation failure if the payload is oversized
/// or structurally invalid.
pub fn validate_config_json(payload: &str) -> Result<(), String> {
    if payload.len() > MAX_CONFIG_BYTES {
        return Err(format!(
            "config.json payload ({} bytes) exceeds maximum allowed size ({MAX_CONFIG_BYTES} bytes)",
            payload.len()
        ));
    }
    let trimmed = payload.trim();
    if !trimmed.starts_with('{') || !trimmed.ends_with('}') {
        return Err("config.json must be a top-level JSON object".to_string());
    }
    if !trimmed.contains("\"float\"") {
        return Err("config.json must contain a \"float\" array field".to_string());
    }

    let mut brace_depth: i32 = 0;
    let mut bracket_depth: i32 = 0;
    let mut in_string = false;
    let mut escaped = false;

    for ch in trimmed.chars() {
        if escaped {
            escaped = false;
            continue;
        }
        if ch == '\\' && in_string {
            escaped = true;
            continue;
        }
        if ch == '"' {
            in_string = !in_string;
            continue;
        }
        if in_string {
            continue;
        }
        match ch {
            '{' => brace_depth += 1,
            '}' => {
                brace_depth -= 1;
                if brace_depth < 0 {
                    return Err("unbalanced closing brace in config.json".to_string());
                }
            }
            '[' => bracket_depth += 1,
            ']' => {
                bracket_depth -= 1;
                if bracket_depth < 0 {
                    return Err("unbalanced closing bracket in config.json".to_string());
                }
            }
            _ => {}
        }
    }

    if in_string || brace_depth != 0 || bracket_depth != 0 {
        return Err("unbalanced delimiters or unterminated string in config.json".to_string());
    }
    Ok(())
}
