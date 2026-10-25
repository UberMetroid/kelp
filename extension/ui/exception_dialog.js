// SPDX-License-Identifier: GPL-3.0-or-later
// Interactive modal dialog and pointer window-picker for floating exception rules.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { DEFAULT_RULES } from './settings/float_rules.js';

export const SelectWindowDialog = GObject.registerClass(
    class SelectWindowDialog extends ModalDialog.ModalDialog {
        _init(select_cb, cancel_cb) {
            super._init({
                styleClass: 'kelp-OSDs',
                destroyOnClose: true,
                shellReactive: true,
                shouldFadeIn: false,
                shouldFadeOut: false,
            });
            const title = new St.Label({
                text: 'Select a window to add a floating exception',
                style_class: 'kelp-osd-title',
                x_align: Clutter.ActorAlign.CENTER,
            });
            const body = new St.Label({
                text: 'Click on any open window, or press Esc to cancel.',
                x_align: Clutter.ActorAlign.CENTER,
            });
            this.contentLayout.add_child(title);
            this.contentLayout.add_child(body);

            this.addButton({
                label: 'Cancel',
                action: () => {
                    this.close();
                    if (cancel_cb) cancel_cb();
                },
                key: Clutter.KEY_Escape,
            });

            this.open();
            if (select_cb) select_cb();
        }
    },
);

export const OverviewDialog = GObject.registerClass(
    class OverviewDialog extends ModalDialog.ModalDialog {
        _init(add_rule, remove_rule, toggle_rule, config, cancel_cb) {
            super._init({
                styleClass: 'kelp-exceptions',
                destroyOnClose: true,
                shellReactive: false,
                shouldFadeIn: true,
                shouldFadeOut: true,
            });

            this.config = config;
            this.remove_rule = remove_rule;
            this.toggle_rule = toggle_rule;

            const select_btn = new St.Button({
                label: '+ Select Window',
                x_align: Clutter.ActorAlign.CENTER,
                style_class: 'kelp-button button',
            });
            select_btn.connect('clicked', () => {
                this.close();
                add_rule();
            });

            const box_orient = 'orientation' in St.BoxLayout.prototype
                ? { orientation: Clutter.Orientation.VERTICAL }
                : { vertical: true };
            this.list = new St.BoxLayout({
                ...box_orient,
                style_class: 'kelp-exceptions-list',
            });

            const scroll = new St.ScrollView({
                overlay_scrollbars: true,
                style_class: 'kelp-exceptions-scroll',
            });
            scroll.add_child(this.list);

            this.contentLayout.add_child(select_btn);
            this.contentLayout.add_child(scroll);

            this.populate_rules();

            this.addButton({
                label: 'Close',
                action: () => {
                    this.close();
                    if (cancel_cb) cancel_cb();
                },
                key: Clutter.KEY_Escape,
            });

            this.open();
        }

        populate_rules() {
            for (const rule of this.config.float) {
                if (rule.disabled !== undefined && rule.disabled) continue;
                const title = rule.title ? `${rule.class ?? '*'} (${rule.title})` : `${rule.class}`;
                const row = new St.BoxLayout({ x_expand: true });
                const lbl = new St.Label({
                    text: title,
                    x_expand: true,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                const del = new St.Button({
                    label: 'Remove',
                    style_class: 'button',
                });
                del.connect('clicked', () => {
                    this.remove_rule(rule.class, rule.title);
                    if (row.get_parent() === this.list) this.list.remove_child(row);
                    row.destroy();
                });
                row.add_child(lbl);
                row.add_child(del);
                this.list.add_child(row);
            }

            for (const rule of DEFAULT_RULES) {
                const title = rule.title ? `${rule.class ?? '*'} (${rule.title})` : `${rule.class}`;
                const enabled = !this.config.rule_disabled(rule);
                const sw = new PopupMenu.PopupSwitchMenuItem(title, enabled);
                sw.connect('toggled', (_item, state) => {
                    this.toggle_rule(rule.class, rule.title, !state);
                });
                this.list.add_child(sw);
            }
        }
    },
);

export class ExceptionDialog {
    constructor(ext) {
        this.ext = ext;
        this.dialog = null;
        this.picker_signals = [];
    }

    open() {
        this.close();
        this.dialog = new OverviewDialog(
            () => this.start_window_picker(),
            (wm_class, wm_title) => {
                this.ext.conf.remove_user_exception(wm_class, wm_title);
                this.ext.reload_config();
            },
            (wm_class, wm_title, disabled) => {
                this.ext.conf.toggle_system_exception(wm_class, wm_title, disabled);
                this.ext.reload_config();
            },
            this.ext.conf,
            () => {
                this.dialog = null;
            },
        );
    }

    pick_window_at(x, y) {
        const actors = global.get_window_actors?.() ?? [];
        const active_ws = this.ext.active_workspace?.() ?? 0;
        for (let i = actors.length - 1; i >= 0; i -= 1) {
            const actor = actors[i];
            if (!actor || actor.visible === false) continue;
            const meta = actor.get_meta_window?.();
            const sw = meta ? this.ext.get_window(meta) : null;
            if (!sw || sw.meta.minimized || sw.stack_Previously_hidden) continue;
            if (sw.workspace_id() !== active_ws && !this.ext.should_ignore_workspace(sw.meta.get_monitor())) continue;
            const r = sw.rect();
            if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) return sw;
        }
        return null;
    }

    start_window_picker() {
        this.close();
        this.dialog = new SelectWindowDialog(
            () => {
                const sig = global.stage.connect('button-press-event', () => {
                    const [x, y] = global.get_pointer();
                    let cur = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
                    let picked = null;
                    for (let depth = 0; cur && depth < 16; depth += 1) {
                        if (typeof cur.get_meta_window === 'function') {
                            picked = this.ext.get_window(cur.get_meta_window());
                            if (picked) break;
                        }
                        cur = cur.get_parent();
                    }
                    const win = picked ?? this.pick_window_at(x, y) ?? this.ext.focus_window();
                    this.close();
                    if (win) {
                        const wm_class = win.meta.get_wm_class();
                        if (wm_class) {
                            this.ext.conf.add_app_exception(wm_class);
                            this.ext.reload_config();
                        }
                    }
                    return Clutter.EVENT_STOP;
                });
                this.picker_signals.push(sig);
            },
            () => this.cleanup_picker(),
        );
    }

    cleanup_picker() {
        for (const sig of this.picker_signals) {
            global.stage.disconnect(sig);
        }
        this.picker_signals = [];
    }

    close() {
        this.cleanup_picker();
        if (this.dialog) {
            const dlg = this.dialog;
            this.dialog = null;
            dlg.close();
        }
    }
}
