// SPDX-License-Identifier: GPL-3.0-or-later
// Default floating window exception config, JSON schema validator, and GNOME shortcut XML blobs.

/// Maximum allowed byte length for `~/.config/kelp/config.json`.
pub const MAX_CONFIG_BYTES: usize = 65_536;

/// Default user floating-exception configuration written to `~/.config/kelp/config.json`
/// when no existing user configuration is present.
pub const DEFAULT_CONFIG_JSON: &str = r#"{
  "float": [
    {
      "class": "kelp-example",
      "title": "kelp-example"
    },
    {
      "class": "steam"
    },
    {
      "class": "caligula"
    },
    {
      "class": "btm"
    },
    {
      "class": "macchina"
    },
    {
      "class": "com.rastersoft.ding"
    },
    {
      "class": "com.rastersoft.dingtest"
    },
    {
      "title": "^Desktop Icons.*$"
    },
    {
      "title": "@!"
    }
  ],
  "skiptaskbarhidden": [],
  "log_on_focus": false
}
"#;

/// GNOME Control Center `10-kelp-move.xml` window move keybinding definitions.
pub const KEYBINDING_MOVE_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<KeyListEntries schema="org.gnome.shell.extensions.kelp"
                group="system"
                name="Move, resize, and swap windows"
                wm_name="Kelp">

    <KeyListEntry name="kelp-workspace-down"
                  description="Move window to lower workspace"/>

    <KeyListEntry name="kelp-workspace-up"
                  description="Move window to upper workspace"/>

    <KeyListEntry name="kelp-monitor-left"
                  description="Move window to left monitor"/>

    <KeyListEntry name="kelp-monitor-right"
                  description="Move window to right monitor"/>

    <KeyListEntry name="kelp-monitor-up"
                  description="Move window to upper monitor"/>

    <KeyListEntry name="kelp-monitor-down"
                  description="Move window to lower monitor"/>

</KeyListEntries>
"#;

/// GNOME Control Center `10-kelp-navigate.xml` directional focus shortcuts.
pub const KEYBINDING_NAVIGATION_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<KeyListEntries schema="org.gnome.shell.extensions.kelp"
                group="system"
                name="Navigate applications and windows"
                wm_name="Kelp">

    <KeyListEntry name="focus-left"
                  description="Focus left window"/>

    <KeyListEntry name="focus-down"
                  description="Focus down window"/>

    <KeyListEntry name="focus-up"
                  description="Focus up window"/>

    <KeyListEntry name="focus-right"
                  description="Focus right window"/>

</KeyListEntries>
"#;

/// GNOME Control Center `10-kelp-tile.xml` tiling management shortcuts.
pub const KEYBINDING_TILING_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<KeyListEntries schema="org.gnome.shell.extensions.kelp"
                group="system"
                name="Manage tiling"
                wm_name="Kelp">

    <KeyListEntry name="tile-enter"
                  description="Enter tiling mode"/>

    <KeyListEntry name="toggle-tiling"
                  description="Toggle auto-tiling"/>

    <KeyListEntry name="toggle-floating"
                  description="Toggle a window between floating and tiling"/>

    <KeyListEntry name="tile-orientation"
                  description="Toggle tiling orientation"/>

    <KeyListEntry name="toggle-stacking-global"
                  description="Toggle stacking mode"/>

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
