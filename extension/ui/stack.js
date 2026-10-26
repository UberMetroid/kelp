// SPDX-License-Identifier: GPL-3.0-or-later
// Tabbed window stack container managing St.BoxLayout tab headers and actor visibility.

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Ecs from '../engine/ecs/world.js';
import {
    INACTIVE_TAB_STYLE,
    active_tab_style,
    create_stack_tab,
    disconnect_stack_tab,
} from './stack_widgets.js';

export const TAB_HEIGHT = 24;

export class Stack {
    constructor(ext, active_entity, workspace, monitor = 0) {
        this.ext = ext;
        this.active = active_entity;
        this.active_id = 0;
        this.workspace = workspace;
        this.monitor = monitor;
        this.tabs = [];
        this.rect = null;
        this.restack = null;
        this.active_style = active_tab_style(ext);

        this.widgets = {
            tabs: new St.BoxLayout({ style_class: 'kelp-stack', reactive: true, x_expand: true }),
        };

        const group = global.window_group;
        if (group) group.add_child(this.widgets.tabs);

        const display = global.display;
        if (display) this.restack = display.connect('restacked', () => this.restack_tabs());
    }

    sync_visibility(overview_visible = false) {
        if (!this.widgets) return;
        const on_active_ws =
            this.ext?.should_ignore_workspace?.(this.monitor) ||
            !this.ext?.active_workspace ||
            this.workspace === this.ext.active_workspace();
        if (overview_visible) {
            this.widgets.tabs.hide();
            if (on_active_ws) {
                for (const c of this.tabs) {
                    const win = this.ext.windows.get(c.entity);
                    if (win && !win.meta.minimized) win.meta.get_compositor_private()?.show();
                }
            }
        } else if (!on_active_ws) {
            this.widgets.tabs.hide();
            for (const c of this.tabs) this.comp_show(c.entity, false);
        } else {
            const active_win = this.ext.windows.get(this.active);
            if (active_win?.meta?.is_fullscreen?.()) {
                this.widgets.tabs.hide();
            } else {
                this.widgets.tabs.show();
                this.restack_tabs();
            }
        }
    }

    restack_tabs() {
        if (!this.widgets) return;
        const win = this.ext.windows.get(this.active);
        if (!win) return;
        if (win.meta.is_fullscreen?.()) {
            this.widgets.tabs.hide();
            return;
        }
        const actor = win.meta.get_compositor_private();
        const group = global.window_group;
        if (actor && group && this.widgets.tabs.get_parent() === group) {
            group.set_child_below_sibling(this.widgets.tabs, actor);
        }
    }

    add(window) {
        const entity = window.entity;
        for (const c of this.tabs) {
            if (Ecs.entity_eq(c.entity, entity)) return;
        }
        const entry = create_stack_tab(this, window, this.active_style);
        this.tabs.push(entry);
        if (this.widgets) {
            this.widgets.tabs.add_child(entry.button);
        }
        this.activate(this.active);
    }

    activate(entity) {
        const permitted = Ecs.entity_eq(entity, this.active) ||
            this.tabs.some((c) => Ecs.entity_eq(c.entity, entity));
        if (!permitted) return;

        this.active = entity;
        this.active_style = active_tab_style(this.ext);

        for (let i = 0; i < this.tabs.length; i += 1) {
            const c = this.tabs[i];
            const is_active = Ecs.entity_eq(c.entity, entity);
            c.active = is_active;
            if (is_active) {
                this.active_id = i;
                c.button.style_class = 'kelp-tab kelp-tab-active';
                c.button.style = this.active_style;
            } else {
                c.button.style_class = 'kelp-tab kelp-tab-inactive';
                c.button.style = INACTIVE_TAB_STYLE;
            }
            this.comp_show(c.entity, is_active);
        }
        this.restack_tabs();
    }

    comp_show(entity, show) {
        const win = this.ext.windows.get(entity);
        if (!win) return;
        const actor = win.meta.get_compositor_private();
        if (!actor) return;
        const on_active_ws =
            this.ext?.should_ignore_workspace?.(this.monitor) ||
            !this.ext?.active_workspace ||
            (win.workspace_id?.() ?? this.workspace) === this.ext.active_workspace();
        if (show && !win.meta.minimized && on_active_ws) {
            actor.show();
            win.stack_Previously_hidden = false;
        } else if (!show && !win.meta.minimized) {
            actor.hide();
            win.stack_Previously_hidden = true;
        }
    }

    auto_activate() {
        if (this.tabs.length === 0) return null;
        if (this.active_id >= this.tabs.length) {
            this.active_id = this.tabs.length - 1;
        }
        const c = this.tabs[this.active_id];
        this.activate(c.entity);
        return c.entity;
    }

    deactivate(window) {
        for (const c of this.tabs) {
            if (Ecs.entity_eq(c.entity, window.entity)) {
                this.tab_disconnect(c);
                this.comp_show(c.entity, true);
            }
        }
    }

    remove_by_pos(idx) {
        const c = this.tabs[idx];
        if (!c) return;
        this.remove_tab_component(c);
        this.tabs.splice(idx, 1);
    }

    remove_tab(entity) {
        for (let idx = 0; idx < this.tabs.length; idx += 1) {
            if (Ecs.entity_eq(this.tabs[idx].entity, entity)) {
                this.remove_by_pos(idx);
                if (this.tabs.length > 0) {
                    this.auto_activate();
                }
                return idx;
            }
        }
        return null;
    }

    remove_tab_component(c, restore_actor = true) {
        this.tab_disconnect(c);
        if (this.widgets && c.button.get_parent() === this.widgets.tabs) {
            this.widgets.tabs.remove_child(c.button);
        }
        c.button.destroy();
        if (restore_actor) this.comp_show(c.entity, true);
    }

    tab_disconnect(c) {
        for (const s of c.signals) {
            c.button.disconnect(s);
        }
        c.signals = [];
        disconnect_stack_tab(this.ext, c);
    }

    reposition() {
        if (!this.rect || !this.widgets) return;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
        const tab_h = TAB_HEIGHT * scale;
        const min_y = this.ext?.monitor_work_area?.(this.monitor)?.y ?? 0;
        this.widgets.tabs.set_position(this.rect.x, Math.max(min_y, this.rect.y - tab_h));
        this.widgets.tabs.set_size(this.rect.width, tab_h);
        this.sync_visibility();
    }

    update_positions(rect) {
        this.rect = {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: Math.max(1, rect.height),
        };
        this.reposition();
    }

    sync_entities(entities, stack_idx) {
        for (const entity of entities) {
            const win = this.ext.windows.get(entity);
            if (win) win.stack = stack_idx;
        }
        if (this.tabs.length === entities.length && this.tabs.every((c, i) => Ecs.entity_eq(c.entity, entities[i]))) return;
        this.clear(false);
        for (const entity of entities) {
            const win = this.ext.windows.get(entity);
            if (win) this.add(win);
        }
    }

    replace(window, idx = null) {
        const slot = idx !== null && idx !== undefined ? idx : this.active_id;
        const c = this.tabs[slot];
        if (!c) return;
        this.remove_tab_component(c);
        const entry = create_stack_tab(this, window, this.active_style);
        this.tabs[slot] = entry;
        if (this.widgets) this.widgets.tabs.insert_child_at_index(entry.button, slot);
        this.activate(window.entity);
    }

    clear(restore_actors = true) {
        for (const c of this.tabs) this.remove_tab_component(c, restore_actors);
        this.tabs = [];
    }

    destroy() {
        if (this.restack !== null && global.display) {
            global.display.disconnect(this.restack);
            this.restack = null;
        }
        for (const c of this.tabs) { this.tab_disconnect(c); this.comp_show(c.entity, true); }
        this.tabs = [];
        if (this.widgets) { this.widgets.tabs.destroy(); this.widgets = null; }
    }
}
