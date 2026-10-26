// SPDX-License-Identifier: GPL-3.0-or-later
// Seahorse scrolling column strip engine (`SeahorseTiler`) with screen-edge peek slivers.

import * as Ecs from '../ecs/world.js';
import { Rectangle } from '../geom/rectangle.js';

export const PEEK_WIDTH = 8;

export class SeahorseTiler {
    constructor(attached) {
        this.attached = attached; this.is_seahorse = true; this.overview_visible = false;
        this.strips = new Map(); this.full_width = new Set(); this.ratios = new Map();
    }

    _strip(id) {
        const key = `${id[0]}:${id[1]}`;
        if (!this.strips.has(key)) this.strips.set(key, { id: [id[0], id[1]], cols: [], active: 0, scroll: 0 });
        return this.strips.get(key);
    }

    _entity_key(entity) { return `${entity[0]}:${entity[1]}`; }
    _weight(entity) { return this.ratios.get(this._entity_key(entity)) ?? 1.0; }

    auto_tile(ext, win, ignore_focus = false) {
        if (!win) return;
        this.detach_window(ext, win.entity);
        const strip = this._strip(ext.workspace_id(win));
        const insert_at = !ignore_focus && strip.cols.length > 0 ? Math.min(strip.cols.length, strip.active + 1) : strip.cols.length;
        strip.cols.splice(insert_at, 0, win.entity); strip.active = insert_at;
        this.attached.insert(win.entity, win.entity); this._sync_scroll(strip); this.arrange_strip(ext, strip);
    }

    detach_window(ext, entity, activate_next = false, preserve_state = false) {
        if (!entity) return;
        const ekey = this._entity_key(entity), win = ext.windows.get(entity);
        this.attached.remove(entity);
        if (!preserve_state) { this.full_width.delete(ekey); this.ratios.delete(ekey); }
        if (win && this._is_alive(win)) this._show_actor(win, ext);
        for (const [key, strip] of this.strips.entries()) {
            const idx = strip.cols.findIndex((e) => Ecs.entity_eq(e, entity)), prev_active = strip.active;
            if (idx === -1) continue;
            strip.cols.splice(idx, 1);
            if (strip.cols.length === 0) { this.strips.delete(key); ext.sync_seahorse_peeks?.(strip.id, null); continue; }
            if (idx < prev_active) strip.active = prev_active - 1;
            else if (idx === prev_active) strip.active = Math.min(idx, strip.cols.length - 1);
            strip.scroll = idx < strip.scroll ? Math.max(0, strip.scroll - 1) : Math.max(0, Math.min(Math.max(0, strip.cols.length - Math.min(strip.cols.length, 3)), strip.scroll));
            this._sync_scroll(strip); this.arrange_strip(ext, strip);
            const next = activate_next && idx === prev_active ? ext.windows.get(strip.cols[strip.active]) : null;
            if (next && this._is_active_ws(next, ext)) ext.register_fn?.(() => next.activate(ext, true));
        }
    }

    _sync_scroll(strip) {
        const n = strip.cols.length;
        if (n <= 1) { strip.active = 0; strip.scroll = 0; return; }
        strip.active = Math.max(0, Math.min(n - 1, strip.active));
        const active_ent = strip.cols[strip.active];
        if (active_ent && this.full_width.has(this._entity_key(active_ent))) { strip.scroll = strip.active; return; }
        const max_vis = Math.min(n, 3);
        if (strip.active < strip.scroll) strip.scroll = strip.active;
        else if (strip.active >= strip.scroll + max_vis) strip.scroll = strip.active - max_vis + 1;
        strip.scroll = Math.max(0, Math.min(Math.max(0, n - max_vis), strip.scroll));
    }

    arrange_strip(ext, strip) {
        const next_cols = [];
        for (const e of strip.cols) {
            const w = ext.windows.get(e), wid = w ? ext.workspace_id(w) : null;
            if (w && wid && this._is_alive(w) && w.is_tilable(ext) && !w.meta.minimized && wid[0] === strip.id[0] && wid[1] === strip.id[1]) { next_cols.push(e); continue; }
            if (w && this._is_alive(w)) this._show_actor(w, ext);
            this.attached.remove(e); this.full_width.delete(this._entity_key(e)); this.ratios.delete(this._entity_key(e));
            if (next_cols.length <= strip.active && strip.active > 0) strip.active -= 1;
            if (next_cols.length <= strip.scroll && strip.scroll > 0) strip.scroll -= 1;
        }
        strip.cols = next_cols;
        const n = strip.cols.length;
        if (n === 0) { this.strips.delete(`${strip.id[0]}:${strip.id[1]}`); ext.sync_seahorse_peeks?.(strip.id, null); return; }
        this._sync_scroll(strip);
        const area = ext.monitor_work_area(strip.id[0]), smart = ext.settings.smart_gaps() && n === 1;
        const outer = smart ? 0 : ext.gap_outer, inner = ext.gap_inner, active_ent = strip.cols[strip.active];
        const single_view = n === 1 || Boolean(active_ent && this.full_width.has(this._entity_key(active_ent)));
        const vis_count = single_view ? 1 : Math.min(n, 3);
        const vis0 = single_view ? strip.active : strip.scroll, vis_end = vis0 + vis_count - 1;
        const peek_w = PEEK_WIDTH * (ext.dpi || 1), has_left = vis0 > 0, has_right = vis_end < n - 1;
        const peek_l = has_left ? peek_w + inner : 0, peek_r = has_right ? peek_w + inner : 0;
        const x0 = area.x + outer + peek_l, y0 = area.y + outer;
        const avail_w = Math.max(64, area.width - outer * 2 - peek_l - peek_r), avail_h = Math.max(64, area.height - outer * 2);
        let any_fs = false;
        for (let i = vis0; i <= vis_end; i += 1) if (ext.windows.get(strip.cols[i])?.meta?.is_fullscreen?.()) { any_fs = true; break; }
        ext.sync_seahorse_peeks?.(strip.id, any_fs ? null : {
            left: has_left ? new Rectangle([area.x + outer, y0, peek_w, avail_h]) : null,
            right: has_right ? new Rectangle([area.x + area.width - outer - peek_w, y0, peek_w, avail_h]) : null,
        });
        if (single_view) strip.scroll = strip.active;
        const cols_avail_w = Math.max(64, avail_w - inner * (vis_count - 1));
        let sum_w = 0, cur_x = x0;
        for (let i = vis0; i <= vis_end; i += 1) sum_w += Math.max(0.35, Math.min(2.85, this._weight(strip.cols[i])));
        for (let i = 0; i < n; i += 1) {
            const win = ext.windows.get(strip.cols[i]);
            if (!win) continue;
            win.smart_gapped = single_view && smart;
            if (i >= vis0 && i <= vis_end) {
                const frac = Math.max(0.35, Math.min(2.85, this._weight(strip.cols[i]))) / Math.max(0.01, sum_w);
                const col_w = i === vis_end ? Math.max(32, x0 + avail_w - cur_x) : Math.max(32, Math.floor(cols_avail_w * frac));
                if (this._is_active_ws(win, ext)) this._show_actor(win, ext);
                else if (!this.overview_visible) this._hide_actor(win);
                if (!win.meta?.is_fullscreen?.()) this._move_win(ext, win, new Rectangle([cur_x, y0, col_w, avail_h]));
                cur_x += col_w + inner;
            } else if (!this.overview_visible) this._hide_actor(win);
        }
    }

    _move_win(ext, win, rect) { ext.size_signals_block?.(win); win.move(ext, rect); }
    _is_alive(w) { return Boolean(w && w.actor_exists?.() !== false && !w.meta?.in_destruction?.()); }

    resize_column(ext, delta, target_win = null) {
        const win = target_win ?? ext.focus_window();
        if (!win || !this.attached.contains(win.entity)) return false;
        const key = this._entity_key(win.entity);
        if (this.full_width.has(key)) { this.full_width.delete(key); this.ratios.set(key, delta < 0 ? 1.8 : 1.0); }
        else this.ratios.set(key, Math.max(0.35, Math.min(2.85, this._weight(win.entity) + delta * 0.25)));
        this.arrange_strip(ext, this._strip(ext.workspace_id(win)));
        return true;
    }

    on_resize(ext, win) {
        if (!win || !this.attached.contains(win.entity)) return;
        const strip = this._strip(ext.workspace_id(win)), idx = strip.cols.findIndex((e) => Ecs.entity_eq(e, win.entity));
        if (strip.cols.length <= 1 || idx === -1 || this.full_width.has(this._entity_key(win.entity))) { this.arrange_strip(ext, strip); return; }
        const area = ext.monitor_work_area(strip.id[0]), vis_count = Math.min(strip.cols.length, 3);
        const vis0 = strip.scroll, vis_end = vis0 + vis_count - 1;
        if (idx < vis0 || idx > vis_end) { this.arrange_strip(ext, strip); return; }
        const pw = PEEK_WIDTH * (ext.dpi || 1);
        const peek_w = (vis0 > 0 ? pw + ext.gap_inner : 0) + (vis_end < strip.cols.length - 1 ? pw + ext.gap_inner : 0);
        const cols_avail = Math.max(128, area.width - ext.gap_outer * 2 - peek_w - ext.gap_inner * (vis_count - 1));
        const frac = Math.max(0.15, Math.min(0.8, (win.rect?.()?.width ?? cols_avail / vis_count) / cols_avail));
        let other_w = 0;
        for (let i = vis0; i <= vis_end; i += 1) if (!Ecs.entity_eq(strip.cols[i], win.entity)) other_w += this._weight(strip.cols[i]);
        this.ratios.set(this._entity_key(win.entity), Math.max(0.35, Math.min(2.85, (frac / (1 - frac)) * Math.max(0.35, other_w))));
        this.arrange_strip(ext, strip);
    }

    on_focused(ext, win) {
        if (!win || !this.attached.contains(win.entity)) return;
        const strip = this._strip(ext.workspace_id(win));
        for (const e of [...strip.cols]) if (!this._is_alive(ext.windows.get(e))) this.detach_window(ext, e, false);
        const idx = strip.cols.findIndex((e) => Ecs.entity_eq(e, win.entity));
        if (idx === -1) { this.auto_tile(ext, win, false); return; }
        strip.active = idx; this._sync_scroll(strip); this.arrange_strip(ext, strip);
    }

    focus_step(ext, delta, peek = false) {
        const win = ext.focus_window(), wid = win ? ext.workspace_id(win) : [ext.active_monitor?.() ?? 0, ext.active_workspace?.() ?? 0];
        const strip = this._strip(wid), n = strip.cols.length;
        if (n === 0) return false;
        if (win) { const cur = strip.cols.findIndex((e) => Ecs.entity_eq(e, win.entity)); if (cur !== -1) strip.active = cur; }
        let target_idx = strip.active + delta;
        if (peek) {
            const active_ent = strip.cols[strip.active], single = n === 1 || Boolean(active_ent && this.full_width.has(this._entity_key(active_ent)));
            const vis0 = single ? strip.active : strip.scroll, vis_end = vis0 + (single ? 1 : Math.min(n, 3)) - 1;
            target_idx = delta < 0 ? vis0 - 1 : vis_end + 1;
        }
        const next_idx = Math.max(0, Math.min(n - 1, target_idx));
        strip.active = next_idx; this._sync_scroll(strip); this.arrange_strip(ext, strip);
        const target = ext.windows.get(strip.cols[next_idx]);
        if (!target) return false;
        this._show_actor(target, ext); target.activate(ext, true); ext.on_focused(target);
        return true;
    }

    move_step(ext, delta, target_win = null) {
        const win = target_win ?? ext.focus_window();
        if (!win || !this.attached.contains(win.entity)) return false;
        const strip = this._strip(ext.workspace_id(win));
        const idx = strip.cols.findIndex((e) => Ecs.entity_eq(e, win.entity)), target_idx = idx + delta;
        if (idx === -1 || target_idx < 0 || target_idx >= strip.cols.length) return false;
        [strip.cols[idx], strip.cols[target_idx]] = [strip.cols[target_idx], strip.cols[idx]];
        strip.active = target_idx; this._sync_scroll(strip); this.arrange_strip(ext, strip);
        ext.register_fn?.(() => win.activate(ext, true));
        return true;
    }

    toggle_orientation(ext, win) {
        const target = win ?? ext.focus_window();
        if (!target || !this.attached.contains(target.entity)) return;
        const key = this._entity_key(target.entity);
        if (this.full_width.has(key)) this.full_width.delete(key); else this.full_width.add(key);
        this.arrange_strip(ext, this._strip(ext.workspace_id(target)));
    }

    toggle_floating(ext) {
        const focused = ext.focus_window();
        if (!focused) return;
        const wm_class = focused.meta?.get_wm_class?.() ?? null, wm_title = focused.meta?.get_title?.() ?? null;
        if (wm_class !== null && wm_title !== null && ext.conf?.window_shall_float(wm_class, wm_title)) {
            if (ext.contains_tag(focused.entity, Ecs.ForceTile)) { ext.delete_tag(focused.entity, Ecs.ForceTile); this.detach_window(ext, focused.entity); }
            else { ext.add_tag(focused.entity, Ecs.ForceTile); this.auto_tile(ext, focused, false); }
        } else if (ext.contains_tag(focused.entity, Ecs.Floating)) {
            ext.delete_tag(focused.entity, Ecs.Floating); this.auto_tile(ext, focused, false);
        } else if (this.attached.contains(focused.entity)) {
            this.detach_window(ext, focused.entity); ext.add_tag(focused.entity, Ecs.Floating);
        }
        ext.register_fn?.(() => focused.activate(ext, true));
    }

    toggle_stacking(ext, win) { this.toggle_orientation(ext, win); }
    find_stack(_entity) { return null; }
    get_parent_fork(_window) { return null; }
    windows_are_siblings(_a, _b) { return null; }
    largest_on_workspace(_ext, _m, _w) { return null; }
    on_drop(ext, win) {
        if (!win || !win.is_tilable(ext)) return;
        this.detach_window(ext, win.entity, false, true);
        const strip = this._strip(ext.workspace_id(win)), area = ext.monitor_work_area(strip.id[0]);
        const cx = ext.cursor_status?.()?.[0]?.x ?? win.rect?.()?.x ?? area.x;
        const vis_count = Math.max(1, Math.min(strip.cols.length + 1, 3));
        const slot = Math.min(vis_count - 1, Math.max(0, Math.floor(((cx - area.x) / Math.max(1, area.width)) * vis_count)));
        const insert_at = strip.cols.length === 0 ? 0 : Math.min(strip.cols.length, strip.scroll + slot);
        strip.cols.splice(insert_at, 0, win.entity); strip.active = insert_at;
        this.attached.insert(win.entity, win.entity); this._sync_scroll(strip); this.arrange_strip(ext, strip);
    }

    reflow(ext, ent) {
        const w = this.attached.contains(ent) ? ext.windows.get(ent) : null;
        if (!w) return;
        const strip = this._strip(ext.workspace_id(w));
        if (!strip.cols.some((e) => Ecs.entity_eq(e, ent))) this.auto_tile(ext, w, false);
        else this.arrange_strip(ext, strip);
    }

    retile_all(ext) { for (const strip of this.strips.values()) this.arrange_strip(ext, strip); }
    sync_workspace_visibility(ext) {
        ext.clear_seahorse_peeks?.();
        for (const [, win] of ext.windows.iter()) if (!this._is_active_ws(win, ext)) this._hide_actor(win);
        this.retile_all(ext);
    }
    overview_show(ext, showing) {
        this.overview_visible = Boolean(showing);
        if (!showing) { this.sync_workspace_visibility(ext); return; }
        ext.clear_seahorse_peeks?.();
        for (const [, win] of ext.windows.iter()) if (this._is_active_ws(win, ext)) win.meta?.get_compositor_private?.()?.show?.();
    }
    _is_active_ws(win, ext) {
        if (!win || win.meta?.minimized) return false;
        const mon = win.meta?.get_monitor?.() ?? 0;
        return !ext?.active_workspace || ext.should_ignore_workspace?.(mon) || (win.workspace_id?.() ?? win.ws?.[1] ?? 0) === ext.active_workspace();
    }
    _show_actor(win, ext, force_ws = false) {
        if (win && !win.meta?.minimized && (force_ws || this._is_active_ws(win, ext))) win.meta?.get_compositor_private?.()?.show?.();
    }
    _hide_actor(win) { if (!win?.meta?.minimized) win?.meta?.get_compositor_private?.()?.hide?.(); }
    destroy(ext) {
        ext.clear_seahorse_peeks?.(); for (const [, win] of ext.windows.iter()) this._show_actor(win, ext, false);
        this.strips.clear(); this.full_width.clear(); this.ratios.clear(); this.attached.clear(); ext.show_border_on_focused();
    }
}
