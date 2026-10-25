// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Global and modal WM keybinding manager (`Keybindings`) registering and unregistering
//   GNOME Shell `Main.wm.addKeybinding` shortcuts for directional focus, adjustment mode,
//   orientation toggling, stacking, and floating overrides.
// - Zero-Trust Boundary & Invariants:
//   Tracks every active keybinding name registered with `Main.wm` and removes all of them
//   deterministically on `disable()` so locking the screen or disabling the extension leaves
//   zero orphaned WM keybinding handlers in GNOME Shell.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class Keybindings {
    constructor(ext) {
        this.ext = ext;
        this.active_bindings = new Set();
        this.global = {
            'activate-launcher': () => Main.overview.toggle(),
            'tile-enter': () => ext.tiler.enter(ext),
        };
        this.window_focus = {
            'focus-left': () => ext.focus_left(),
            'focus-down': () => ext.focus_down(),
            'focus-up': () => ext.focus_up(),
            'focus-right': () => ext.focus_right(),
            'tile-orientation': () => {
                const win = ext.focus_window();
                if (win && ext.auto_tiler) {
                    ext.auto_tiler.toggle_orientation(ext, win);
                    ext.register_fn(() => win.activate(ext, true));
                }
            },
            'toggle-floating': () => ext.auto_tiler?.toggle_floating(ext),
            'toggle-tiling': () => {
                if (ext.auto_tiler) {
                    ext.auto_tile_off();
                } else {
                    ext.auto_tile_on();
                }
            },
            'toggle-stacking-global': () => ext.auto_tiler?.toggle_stacking(ext),
            'pop-monitor-left': () => ext.move_monitor(Meta.DisplayDirection.LEFT),
            'pop-monitor-right': () => ext.move_monitor(Meta.DisplayDirection.RIGHT),
            'pop-monitor-up': () => ext.move_monitor(Meta.DisplayDirection.UP),
            'pop-monitor-down': () => ext.move_monitor(Meta.DisplayDirection.DOWN),
            'pop-workspace-up': () => ext.move_workspace(Meta.MotionDirection.UP),
            'pop-workspace-down': () => ext.move_workspace(Meta.MotionDirection.DOWN),
        };
    }

    enable(keybindings) {
        for (const name of Object.keys(keybindings)) {
            if (this.active_bindings.has(name)) {
                Main.wm.removeKeybinding(name);
            }
            Main.wm.addKeybinding(
                name,
                this.ext.settings.ext,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL,
                keybindings[name],
            );
            this.active_bindings.add(name);
        }
        return this;
    }

    disable(keybindings) {
        const targets = keybindings ? Object.keys(keybindings) : Array.from(this.active_bindings);
        for (const name of targets) {
            if (this.active_bindings.has(name)) {
                Main.wm.removeKeybinding(name);
                this.active_bindings.delete(name);
            }
        }
        return this;
    }
}
