// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Libadwaita Preferences Pages 3 & 4 (`build_shortcuts_page`, `build_about_page`) and
//   color theme presets (`BORDER_PRESETS`) for `KelpPreferences`.
// - Zero-Trust Boundary & Invariants:
//   Runs in the GTK4 `gnome-extensions-app` process. Imports ONLY `gi://Adw`, `gi://Gio`,
//   and `gi://Gtk` — zero compositor typelibs (`Meta`, `Clutter`, `St`, `Shell`).

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

export const BORDER_PRESETS = Object.freeze([
    ['Gruvbox Amber', 'rgb(251,184,108)'],
    ['Kelp Emerald', 'rgb(46,194,126)'],
    ['Ocean Cyan', 'rgb(106,215,225)'],
    ['Coral Red', 'rgb(255,0,0)'],
]);

const SHORTCUT_GROUPS = Object.freeze([
    [
        'Tiling Mode &amp; Window Control',
        'Switch between Kelp layout engines and control tiled or floating windows',
        [
            ['Cycle Tiling Mode (Octopus → Seahorse → Otter)', 'Super + Y'],
            ['Focus Window (Left / Down / Up / Right)', 'Super + Arrows / H J K L'],
            ['Move Window / Swap Column / Snap Otter Edge', 'Ctrl/Shift + Super + Arrows / H J K L'],
            ['Toggle Floating Exception on Window', 'Super + G'],
            ['Interactive Adjustment Mode (Move / Resize)', 'Super + Enter'],
            ['Toggle Maximize / Close Focused Window', 'Super + M  /  Super + Q'],
        ],
    ],
    [
        'Seahorse Strip &amp; Octopus Stack',
        'Column width cycling in Seahorse and tabbed window stacking in Octopus',
        [
            ['Toggle Split Orientation (Octopus) / Full-Width Column (Seahorse)', 'Super + O'],
            ['Toggle Tabbed Stack (Octopus) / Full-Width Column (Seahorse)', 'Super + S'],
            ['Resize Column / Split Ratio (Inside Adjustment Mode)', 'Shift + Arrows / H J K L'],
            ['Scroll Seahorse Strip or Jump to Off-Screen Column', 'Top-Bar Scroll / 8px Edge Peek'],
        ],
    ],
    [
        'Workspaces &amp; Monitors',
        'Navigate and migrate windows across workspaces and multi-monitor setups',
        [
            ['Switch Workspace (Left / Down / Up / Right)', 'Super + Alt + Arrows / H J K L'],
            ['Move Window to Workspace', 'Super + Alt + Shift + Arrows / H J K L'],
            ['Move Window to Another Monitor', 'Ctrl + Super + Shift + Arrows / H J K L'],
        ],
    ],
]);

function add_link_row(group, title, subtitle, button_label, url, fallback_url = null) {
    const row = new Adw.ActionRow({ title, subtitle });
    const btn = new Gtk.Button({
        label: button_label,
        valign: Gtk.Align.CENTER,
        css_classes: ['pill'],
    });
    btn.connect('clicked', () => {
        let ok = false;
        try {
            ok = Boolean(Gio.AppInfo.launch_default_for_uri(url, null));
        } catch (_e) {
            ok = false;
        }
        if (!ok && fallback_url) {
            try { Gio.AppInfo.launch_default_for_uri(fallback_url, null); } catch (_e2) { /* ignore */ }
        }
    });
    row.add_suffix(btn);
    row.activatable_widget = btn;
    group.add(row);
}

export function build_shortcuts_page() {
    const page = new Adw.PreferencesPage({
        title: 'Shortcuts',
        icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
    });

    for (const [group_title, group_desc, rows] of SHORTCUT_GROUPS) {
        const group = new Adw.PreferencesGroup({
            title: group_title,
            description: group_desc,
        });
        for (const [action_label, accel_text] of rows) {
            const row = new Adw.ActionRow({ title: action_label });
            const badge = new Gtk.Label({
                label: accel_text,
                valign: Gtk.Align.CENTER,
                css_classes: ['dim-label', 'monospace'],
            });
            row.add_suffix(badge);
            group.add(row);
        }
        page.add(group);
    }
    return page;
}

export function build_about_page() {
    const page = new Adw.PreferencesPage({
        title: 'About & Support',
        icon_name: 'help-about-symbolic',
    });

    const header_group = new Adw.PreferencesGroup({
        title: 'Kelp — Wayland Auto-Tiling for GNOME 45–51',
        description: 'Three instant kelp-forest tiling modes: Octopus (2D Binary Space Partition), Seahorse (Niri/PaperWM Scrolling Column Strip), and Otter (Manual Floating &amp; Snap).',
    });

    const ver_row = new Adw.ActionRow({
        title: 'Kelp Release Version',
        subtitle: 'Zero-subprocess, zero-telemetry Wayland tiling engine &amp; Rust installer',
    });
    ver_row.add_suffix(new Gtk.Label({ label: 'v1.9.1', valign: Gtk.Align.CENTER, css_classes: ['monospace'] }));
    header_group.add(ver_row);

    const lic_row = new Adw.ActionRow({
        title: 'Open-Source License',
        subtitle: 'Derived from System76 Pop Shell — free software forever',
    });
    lic_row.add_suffix(new Gtk.Label({ label: 'GPL-3.0-or-later', valign: Gtk.Align.CENTER, css_classes: ['monospace'] }));
    header_group.add(lic_row);
    page.add(header_group);

    const support_group = new Adw.PreferencesGroup({
        title: 'Support &amp; Community',
        description: 'If Kelp improves your daily workflow, starring the repository or sponsoring development helps keep GNOME 45–51 support fast and rock-solid.',
    });

    add_link_row(
        support_group,
        '⭐ Star Kelp on GitHub',
        'Star UberMetroid/kelp to help other GNOME &amp; Linux users discover Kelp',
        '⭐ Star on GitHub',
        'https://github.com/UberMetroid/kelp',
    );
    add_link_row(
        support_group,
        '🎓 Tuition, Not Coffee — Help send my daughter to college',
        "Skip the coffee — 100% of sponsorships go toward my daughter's college &amp; future fund",
        '🎓 Tuition, Not Coffee',
        'https://ubermetroid.github.io/tuition-not-coffee',
        'https://github.com/UberMetroid/kelp',
    );
    add_link_row(
        support_group,
        '🌐 Project Website &amp; Documentation',
        'Explore the interactive mode guide, architecture overview, and shortcut reference',
        '🌐 Open Website',
        'https://ubermetroid.github.io/kelp/',
    );
    add_link_row(
        support_group,
        '🐞 Report an Issue or Request a Feature',
        'Found a bug or window exception rule to add? Open an issue on GitHub',
        '🐞 Report Issue',
        'https://github.com/UberMetroid/kelp/issues',
    );

    page.add(support_group);
    return page;
}
