import * as lib from './lib.js';
import * as log from './log.js';
import * as Rect from './rectangle.js';
import * as Tags from './tags.js';
import * as utils from './utils.js';
import * as focus from './focus.js';
import Meta from 'gi://Meta';
import St from 'gi://St';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class ShellWindow {
    constructor(entity, window, window_app, ext) {
        this.stack = null;
        this.grab = false;
        this.activate_after_move = false;
        this.ignore_detach = false;
        this.destroying = false;
        this.reassignment = false;
        this.smart_gapped = false;
        this.restack_id = null;
        this.hint_change_id = null;
        this.border = new St.Bin({
            style_class: 'pop-shell-active-hint pop-shell-border-normal',
        });
        this.prev_rect = null;
        this.was_hidden = false;
        this.border_size = 0;
        this.window_app = window_app;
        this.entity = entity;
        this.meta = window;
        this.ext = ext;
        this.known_workspace = this.workspace_id();
        if (this.meta.is_fullscreen()) {
            ext.add_tag(entity, Tags.Floating);
        }
        this.bind_window_events();
        this.bind_hint_events();
        if (this.border)
            global.window_group.add_child(this.border);
        this.hide_border();
        this.restack();
        this.update_border_layout();
        if (this.meta.get_compositor_private()?.get_stage())
            this.on_style_changed();
    }

    activate(move_mouse = true) {
        activate(this.ext, move_mouse, this.meta);
    }

    actor_exists() {
        return !this.destroying && this.meta.get_compositor_private() !== null;
    }

    bind_window_events() {
        this.ext.window_signals
            .get_or(this.entity, () => new Array())
            .push(this.meta.connect('size-changed', () => {
            this.window_changed();
        }), this.meta.connect('position-changed', () => {
            this.window_changed();
        }), this.meta.connect('workspace-changed', () => {
            this.workspace_changed();
        }), this.meta.connect('notify::wm-class', () => {
            this.wm_class_changed();
        }), this.meta.connect('raised', () => {
            this.window_raised();
        }));
    }

    bind_hint_events() {
        if (!this.border)
            return;
        const settings = this.ext.settings;
        this.hint_change_id = settings.ext.connect('changed', (_, key) => {
            if (this.border) {
                if (key === 'hint-color-rgba') {
                    this.update_hint_colors();
                }
            }
            return false;
        });
        this.border.connect('destroy', () => {
            if (this.hint_change_id !== null) {
                settings.ext.disconnect(this.hint_change_id);
                this.hint_change_id = null;
            }
            if (this.restack_id !== null) {
                GLib.source_remove(this.restack_id);
                this.restack_id = null;
            }
        });
        this.border.connect('style-changed', () => {
            this.on_style_changed();
        });
        this.update_hint_colors();
    }

    destroy() {
        this.destroying = true;
        if (this.restack_id !== null) {
            GLib.source_remove(this.restack_id);
            this.restack_id = null;
        }
        if (this.hint_change_id !== null) {
            this.ext.settings.ext.disconnect(this.hint_change_id);
            this.hint_change_id = null;
        }
        if (this.border) {
            const border = this.border;
            this.border = null;
            border.destroy();
        }
    }

    update_hint_colors() {
        const settings = this.ext.settings;
        const color_value = settings.hint_color_rgba();
        if (this.ext.overlay) {
            const parsed = utils.parse_rgba(color_value);
            const overlay_str = parsed && !utils.is_dark(color_value)
                ? `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, 0.3)`
                : 'rgba(53, 132, 228, 0.3)';
            this.ext.overlay.set_style(`background: ${overlay_str}`);
        }
        this.update_border_style();
    }

    cmdline() {
        return null;
    }

    decoration(_ext, _callback) { }

    decoration_hide(_ext) { }

    decoration_show(_ext) { }

    icon(_ext, size) {
        let icon = this.window_app.create_icon_texture(size);
        if (!icon) {
            icon = new St.Icon({
                icon_name: 'applications-other',
                icon_type: St.IconType.FULLCOLOR,
                icon_size: size,
            });
        }
        return icon;
    }

    ignore_decoration() {
        return true;
    }

    is_client_decorated() {
        return this.meta.is_client_decorated?.() ?? true;
    }

    is_maximized() {
        if (typeof this.meta.is_maximized === 'function') {
            return this.meta.is_maximized();
        }
        if (typeof this.meta.get_maximized === 'function') {
            return this.meta.get_maximized() !== 0;
        }
        return Boolean(this.meta.maximized_horizontally || this.meta.maximized_vertically);
    }

    is_max_screen() {
        return this.is_maximized() || this.ext.settings.gap_inner() === 0 || this.smart_gapped;
    }

    is_single_max_screen() {
        const display = this.meta.get_display();
        if (display) {
            const monitor_count = display.get_n_monitors();
            return (this.is_maximized() || this.smart_gapped) && monitor_count === 1;
        }
        return false;
    }

    is_snap_edge() {
        if (typeof this.meta.get_maximized === 'function') {
            return this.meta.get_maximized() === (Meta.MaximizeFlags?.VERTICAL ?? 2);
        }
        return Boolean(this.meta.maximized_vertically && !this.meta.maximized_horizontally);
    }

    is_tilable(ext) {
        const tile_checks = () => {
            let wm_class = this.meta.get_wm_class();
            if (wm_class !== null && wm_class.trim().length === 0) {
                wm_class = this.name(ext);
            }
            const role = this.meta.get_role();
            if (role === 'quake')
                return false;
            if (this.meta.get_title() === 'Steam') {
                const rect = this.rect();
                const is_dialog = rect.width < 400 && rect.height < 200;
                const is_first_login = rect.width === 432 && rect.height === 438;
                if (is_dialog || is_first_login)
                    return false;
            }
            if (wm_class !== null && ext.conf.window_shall_float(wm_class, this.title())) {
                return ext.contains_tag(this.entity, Tags.ForceTile);
            }
            return (this.meta.window_type === Meta.WindowType.NORMAL &&
                !this.is_transient() &&
                wm_class !== null);
        };
        return !ext.contains_tag(this.entity, Tags.Floating) && tile_checks();
    }

    is_transient() {
        return this.meta.get_transient_for() !== null;
    }

    may_decorate() {
        return false;
    }

    move(ext, rect, on_complete) {
        if (!this.same_workspace() && this.is_maximized()) {
            return;
        }
        this.hide_border();
        const max_width = ext.settings.max_window_width();
        if (max_width > 0 && rect.width > max_width) {
            rect.x += (rect.width - max_width) / 2;
            rect.width = max_width;
        }
        const clone = Rect.Rectangle.from_meta(rect);
        const meta = this.meta;
        const actor = meta.get_compositor_private();
        if (actor) {
            if (this.is_maximized()) {
                meta.unmaximize();
            }
            actor.remove_all_transitions();
            ext.movements.insert(this.entity, clone);
            ext.register({ tag: 2, window: this, kind: { tag: 1 } });
            if (on_complete)
                ext.register_fn(on_complete);
            if (meta.appears_focused) {
                this.update_border_layout();
                ext.show_border_on_focused();
            }
        }
    }

    name(ext) {
        return ext.names.get_or(this.entity, () => 'unknown');
    }

    on_style_changed() {
        if (!this.border)
            return;
        this.border_size = this.border.get_theme_node().get_border_width(St.Side.TOP);
    }

    rect() {
        return Rect.Rectangle.from_meta(this.meta.get_frame_rect());
    }

    size_hint() {
        return null;
    }

    swap(ext, other) {
        const ar = this.rect().clone();
        const br = other.rect().clone();
        other.move(ext, ar);
        this.move(ext, br, () => place_pointer_on(this.ext, this.meta));
    }

    title() {
        const title = this.meta.get_title();
        return title ? title : this.name(this.ext);
    }

    wm_role() {
        return this.meta.get_role();
    }

    workspace_id() {
        const workspace = this.meta.get_workspace();
        if (workspace) {
            return workspace.index();
        }
        else {
            this.meta.change_workspace_by_index(0, false);
            return 0;
        }
    }

    xid() {
        return null;
    }

    show_border() {
        if (!this.border)
            return;
        this.restack();
        this.update_border_style();
        if (this.ext.settings.active_hint()) {
            const permitted = this.actor_exists() &&
                this.ext.focus_window() === this &&
                !this.meta.is_fullscreen() &&
                (!this.is_single_max_screen() || this.is_snap_edge()) &&
                !this.meta.minimized;
            if (permitted && this.meta.appears_focused) {
                this.border.show();
            }
        }
    }

    same_workspace() {
        const workspace = this.meta.get_workspace();
        if (workspace) {
            const workspace_id = workspace.index();
            return workspace_id === global.workspace_manager.get_active_workspace_index();
        }
        return false;
    }

    same_monitor() {
        return this.meta.get_monitor() === global.display.get_current_monitor();
    }

    restack() {
        this.update_border_layout();
        if (this.meta.is_fullscreen() || (this.is_single_max_screen() && !this.is_snap_edge()) || this.meta.minimized) {
            this.hide_border();
        }
        const apply_restack = () => {
            if (!this.actor_exists())
                return;
            const border = this.border;
            const actor = this.meta.get_compositor_private();
            const win_group = global.window_group;
            if (actor && border && win_group) {
                this.update_border_layout();
                win_group.set_child_above_sibling(border, null);
                if (this.always_top_windows.length > 0) {
                    for (const above_actor of this.always_top_windows) {
                        if (actor !== above_actor) {
                            if (border.get_parent() === above_actor.get_parent()) {
                                win_group.set_child_below_sibling(border, above_actor);
                            }
                        }
                    }
                    if (border.get_parent() === actor.get_parent()) {
                        win_group.set_child_above_sibling(border, actor);
                    }
                }
                for (const window of this.ext.windows.values()) {
                    const parent = window.meta.get_transient_for();
                    const window_actor = window.meta.get_compositor_private();
                    if (!parent || !window_actor)
                        continue;
                    const parent_actor = parent.get_compositor_private();
                    if (!parent_actor && parent_actor !== actor)
                        continue;
                    win_group.set_child_below_sibling(border, window_actor);
                }
            }
        };
        apply_restack();
        if (!this.actor_exists() && this.restack_id === null) {
            this.restack_id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this.restack_id = null;
                apply_restack();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    get always_top_windows() {
        const above_windows = new Array();
        for (const actor of global.get_window_actors()) {
            if (actor && actor.get_meta_window() && actor.get_meta_window().is_above())
                above_windows.push(actor);
        }
        return above_windows;
    }

    hide_border() {
        const b = this.border;
        if (b)
            b.hide();
    }

    update_border_layout() {
        let { x, y, width, height } = this.meta.get_frame_rect();
        const border = this.border;
        let borderSize = this.border_size;
        if (border) {
            if (!(this.is_max_screen() || this.is_snap_edge())) {
                border.remove_style_class_name('pop-shell-border-maximize');
            }
            else {
                borderSize = 0;
                border.add_style_class_name('pop-shell-border-maximize');
            }
            const stack_number = this.stack;
            let dimensions = null;
            if (stack_number !== null) {
                const stack = this.ext.auto_tiler?.forest.stacks.get(stack_number);
                if (stack) {
                    let stack_tab_height = stack.tabs_height;
                    if (borderSize === 0 || this.grab) {
                        stack_tab_height = 0;
                    }
                    dimensions = [
                        x - borderSize,
                        y - stack_tab_height - borderSize,
                        width + 2 * borderSize,
                        height + stack_tab_height + 2 * borderSize,
                    ];
                }
            }
            else {
                dimensions = [x - borderSize, y - borderSize, width + 2 * borderSize, height + 2 * borderSize];
            }
            if (dimensions) {
                [x, y, width, height] = dimensions;
                const workspace = this.meta.get_workspace();
                if (workspace === null)
                    return;
                const screen = workspace.get_work_area_for_monitor(this.meta.get_monitor());
                if (screen) {
                    width = Math.min(width, screen.x + screen.width);
                    height = Math.min(height, screen.y + screen.height);
                }
                border.set_position(x, y);
                border.set_size(width, height);
            }
        }
    }

    update_border_style() {
        const { settings } = this.ext;
        const color_value = settings.hint_color_rgba();
        const radius_value = settings.active_hint_border_radius();
        if (this.border) {
            this.border.set_style(`border-color: ${color_value}; border-radius: ${radius_value}px;`);
        }
    }

    wm_class_changed() {
        if (this.is_tilable(this.ext)) {
            this.ext.connect_window(this);
            if (!this.meta.minimized) {
                this.ext.auto_tiler?.auto_tile(this.ext, this, this.ext.init);
            }
        }
    }

    window_changed() {
        this.update_border_layout();
        this.ext.show_border_on_focused();
    }

    window_raised() {
        this.restack();
        this.ext.show_border_on_focused();
    }

    workspace_changed() {
        this.restack();
    }
}

export function activate(ext, move_mouse, win) {
    try {
        if (!win.get_compositor_private())
            return;
        if (ext.get_window(win)?.destroying)
            return;
        if (win.is_override_redirect())
            return;
        const workspace = win.get_workspace();
        if (!workspace)
            return;
        win.unminimize();
        workspace.activate_with_focus(win, global.get_current_time());
        win.raise();
        const pointer_placement_permitted = move_mouse &&
            Main.modalCount === 0 &&
            ext.settings.mouse_cursor_follows_active_window() &&
            !pointer_already_on_window(win) &&
            pointer_in_work_area();
        if (pointer_placement_permitted) {
            place_pointer_on(ext, win);
        }
    }
    catch (error) {
        log.error(`failed to activate window: ${error}`);
    }
}

function pointer_in_work_area() {
    const cursor = lib.cursor_rect();
    const indice = global.display.get_current_monitor();
    const mon = global.display.get_workspace_manager().get_active_workspace().get_work_area_for_monitor(indice);
    return mon ? cursor.intersects(mon) : false;
}

function place_pointer_on(ext, win) {
    const rect = win.get_frame_rect();
    let x = rect.x;
    let y = rect.y;
    const key = Object.keys(focus.FocusPosition)[ext.settings.mouse_cursor_focus_location()];
    const pointer_position_ = focus.FocusPosition[key];
    switch (pointer_position_) {
        case focus.FocusPosition.TopLeft:
            x += 8;
            y += 8;
            break;
        case focus.FocusPosition.BottomLeft:
            x += 8;
            y += rect.height - 16;
            break;
        case focus.FocusPosition.TopRight:
            x += rect.width - 16;
            y += 8;
            break;
        case focus.FocusPosition.BottomRight:
            x += rect.width - 16;
            y += rect.height - 16;
            break;
        case focus.FocusPosition.Center:
            x += rect.width / 2 + 8;
            y += rect.height / 2 + 8;
            break;
        default:
            x += 8;
            y += 8;
    }
    global.stage.get_context().get_backend().get_default_seat().warp_pointer(x, y);
}

function pointer_already_on_window(meta) {
    const cursor = lib.cursor_rect();
    return cursor.intersects(meta.get_frame_rect());
}
