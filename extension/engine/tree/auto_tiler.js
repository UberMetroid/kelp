// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Binary Space Partitioning (BSP) auto-tiler (`AutoTiler`) managing automatic window
//   attachment, workspace/monitor reflow, sibling swaps, orientation toggles, and stacking.
// - Zero-Trust Boundary & Invariants:
//   `fetch_mode()` validates that any target window is non-null, distinct, tilable,
//   unminimized, attached to the tree, and on the same monitor & workspace before splitting.
//   `destroy()` detaches all windows, destroys all `Stack` actors, and clears `window.stack`.

import * as Ecs from '../ecs/world.js';
import { Ok, Err, ERR } from '../ecs/events.js';
import * as log from '../../ui/settings/log.js';
import { Stack } from '../../ui/stack.js';
import * as node from './node.js';
import {
    attach_swap, on_drop, place_or_stack, cursor_placement,
    toggle_floating_window, unstack_window,
} from './auto_tiler_drop.js';

export { cursor_placement };

export class AutoTiler {
    constructor(forest, attached) {
        this.forest = forest;
        this.attached = attached;
    }

    attach_swap(ext, a, b) { attach_swap(this, ext, a, b); }

    update_toplevel(ext, fork, monitor, smart_gaps) {
        const rect = ext.monitor_work_area(monitor);
        fork.smart_gapped = smart_gaps && fork.right === null;
        if (!fork.smart_gapped) {
            rect.x += ext.gap_outer;
            rect.y += ext.gap_outer;
            rect.width -= ext.gap_outer * 2;
            rect.height -= ext.gap_outer * 2;
        }
        if (fork.left.inner.kind === node.NodeKind.WINDOW) {
            const win = ext.windows.get(fork.left.inner.entity);
            if (win) win.smart_gapped = fork.smart_gapped;
        }
        fork.area = fork.set_area(rect.clone());
        fork.length_left = Math.round(fork.prev_ratio * fork.length());
        this.tile(ext, fork, fork.area);
    }

    attach_to_monitor(ext, win, workspace_id, smart_gaps) {
        const rect = ext.monitor_work_area(workspace_id[0]);
        if (!smart_gaps) {
            rect.x += ext.gap_outer;
            rect.y += ext.gap_outer;
            rect.width -= ext.gap_outer * 2;
            rect.height -= ext.gap_outer * 2;
        }
        const [entity, fork] = this.forest.create_toplevel(win.entity, rect.clone(), workspace_id);
        this.forest.on_attach(entity, win.entity);
        fork.smart_gapped = smart_gaps;
        win.smart_gapped = smart_gaps;
        this.tile(ext, fork, rect);
    }

    attach_to_window(ext, attachee, attacher, move_by, stack_from_left = true) {
        const attached = this.forest.attach_window(ext, attachee.entity, attacher.entity, move_by, stack_from_left);
        if (!attached) return false;
        const [, fork] = attached;
        if (!ext.monitors.get(attachee.entity)) {
            log.error(`missing monitor association for Window(${attachee.entity})`);
            return false;
        }
        if (fork.is_toplevel && fork.smart_gapped && fork.right) {
            fork.smart_gapped = false;
            const rect = ext.monitor_work_area(fork.monitor);
            rect.x += ext.gap_outer;
            rect.y += ext.gap_outer;
            rect.width -= ext.gap_outer * 2;
            rect.height -= ext.gap_outer * 2;
            fork.set_area(rect);
        }
        this.tile(ext, fork, fork.area.clone());
        return true;
    }

    attach_to_workspace(ext, win, id) {
        if (ext.should_ignore_workspace(id[0])) id = [id[0], 0];
        const toplevel = this.forest.find_toplevel(id);
        const onto = toplevel ? this.forest.largest_window_on(ext, toplevel) : null;
        if (onto && this.attach_to_window(ext, onto, win, { auto: 0 })) return;
        this.attach_to_monitor(ext, win, id, ext.settings.smart_gaps());
    }

    auto_tile(ext, win, ignore_focus = false) {
        const result = this.fetch_mode(ext, win, ignore_focus);
        this.detach_window(ext, win.entity);
        if (result.kind === ERR) this.attach_to_workspace(ext, win, ext.workspace_id(win));
        else this.attach_to_window(ext, result.value, win, { auto: 0 });
    }

    destroy(ext) {
        for (const [, [fent]] of this.forest.toplevel) {
            for (const n of this.forest.iter(fent)) {
                if (n.inner.kind === node.NodeKind.WINDOW) this.forest.on_detach(n.inner.entity);
                else if (n.inner.kind === node.NodeKind.STACK) {
                    for (const window of n.inner.entities) this.forest.on_detach(window);
                }
            }
        }
        for (const s of this.forest.stacks.values()) s.destroy();
        for (const window of ext.windows.values()) window.stack = null;
        this.forest.stacks.truncate(0);
        ext.show_border_on_focused();
    }

    detach_window(ext, win) {
        this.attached.take_with(win, (prev_fork) => {
            const reflow_fork = this.forest.detach(ext, prev_fork, win);
            if (reflow_fork) {
                const fork = reflow_fork[1];
                if (fork.is_toplevel && ext.settings.smart_gaps() && fork.right === null) {
                    fork.set_area(ext.monitor_work_area(fork.monitor));
                    fork.smart_gapped = true;
                }
                this.tile(ext, fork, fork.area);
            }
            ext.windows.with(win, (info) => (info.ignore_detach = false));
        });
    }

    find_stack(entity) {
        const att = this.attached.get(entity);
        const fork = att ? this.forest.forks.get(att) : null;
        if (!fork) return null;
        if (fork.left.is_in_stack(entity)) return [fork, fork.left, true];
        if (fork.right?.is_in_stack(entity)) return [fork, fork.right, false];
        return null;
    }

    get_parent_fork(window) {
        const entity = this.attached.get(window);
        return entity === null ? null : this.forest.forks.get(entity);
    }

    largest_on_workspace(ext, monitor, workspace) {
        const toplevel = this.forest.find_toplevel([monitor, workspace]);
        return toplevel ? this.forest.largest_window_on(ext, toplevel) : null;
    }

    on_drop(ext, win, via_overview = false) { return on_drop(this, ext, win, via_overview); }
    place_or_stack(ext, win, attach_to, cursor) { return place_or_stack(this, ext, win, attach_to, cursor); }

    reflow(ext, win) {
        const fork_entity = this.attached.get(win);
        if (!fork_entity) return;
        ext.register_fn(() => {
            const fork = this.forest.forks.get(fork_entity);
            if (fork) this.tile(ext, fork, fork.area);
        });
    }

    tile(ext, fork, area) { this.forest.tile(ext, fork, area); }
    toggle_floating(ext) { toggle_floating_window(this, ext); }

    toggle_orientation(ext, window) {
        const res = this.toggle_orientation_(ext, window);
        if (res.kind === ERR) log.warn(`toggle_orientation: ${res.value}`);
    }

    toggle_stacking(ext, window) {
        const focused = window ?? ext.focus_window();
        if (!focused) return;
        if (ext.contains_tag(focused.entity, Ecs.Floating)) {
            ext.delete_tag(focused.entity, Ecs.Floating);
            this.auto_tile(ext, focused, false);
        }
        const fork_entity = this.attached.get(focused.entity);
        const fork = fork_entity ? this.forest.forks.get(fork_entity) : null;
        if (fork) this.unstack(ext, fork, focused, true);
    }

    unstack(ext, fork, win, toggled = false) { unstack_window(this, ext, fork, win, toggled); }

    stack_left(ext, fork, window) {
        window.stack = this.forest.stacks.insert(new Stack(ext, window.entity, fork.workspace, fork.monitor));
        fork.left = node.Node.stacked(window.entity, window.stack);
        fork.measure(this.forest, ext, fork.area, this.forest.on_record());
    }

    stack_right(ext, fork, window) {
        window.stack = this.forest.stacks.insert(new Stack(ext, window.entity, fork.workspace, fork.monitor));
        fork.right = node.Node.stacked(window.entity, window.stack);
        fork.measure(this.forest, ext, fork.area, this.forest.on_record());
    }

    create_stack(ext, window) {
        const entity = this.attached.get(window.entity);
        const fork = entity ? this.forest.forks.get(entity) : null;
        if (!fork) return;
        if (fork.left.is_window(window.entity)) this.stack_left(ext, fork, window);
        else if (fork.right?.is_window(window.entity)) this.stack_right(ext, fork, window);
    }

    update_stack(ext, stack) {
        if (!stack.rect) return;
        const container = this.forest.stacks.get(stack.idx);
        if (!container) return;
        container.clear();
        for (const entity of stack.entities) {
            const window = ext.windows.get(entity);
            if (window) { window.stack = stack.idx; container.add(window); }
        }
        container.update_positions(stack.rect);
        container.auto_activate();
    }

    windows_are_siblings(a, b) {
        const a_parent = this.attached.get(a), b_parent = this.attached.get(b);
        return a_parent !== null && b_parent !== null && Ecs.entity_eq(a_parent, b_parent) ? a_parent : null;
    }

    fetch_mode(ext, win, ignore_focus = false) {
        if (ignore_focus) return Err('ignoring focus');
        const prev = ext.previously_focused(win);
        const onto = prev ? ext.windows.get(prev) : null;
        if (!onto || Ecs.entity_eq(onto.entity, win.entity)) return Err('no focus window');
        if (!onto.is_tilable(ext) || onto.meta.minimized || !this.attached.contains(onto.entity))
            return Err('untilable or unattached');
        return onto.meta.get_monitor() === win.meta.get_monitor() && onto.workspace_id() === win.workspace_id()
            ? Ok(onto) : Err('different monitor or workspace');
    }

    toggle_orientation_(ext, focused) {
        if (focused.is_maximized()) return Err('cannot toggle maximized window');
        const fork_entity = this.attached.get(focused.entity);
        const fork = fork_entity ? this.forest.forks.get(fork_entity) : null;
        if (!fork) return Err('window is not attached to the tree');
        if (!fork.right) return Ok(void 0);
        fork.toggle_orientation();
        this.forest.measure(ext, fork, fork.area);
        for (const child of this.forest.iter(fork_entity, node.NodeKind.FORK)) {
            const child_fork = this.forest.forks.get(child.inner.entity);
            if (child_fork) {
                child_fork.rebalance_orientation();
                this.forest.measure(ext, child_fork, child_fork.area);
            }
        }
        this.forest.arrange(ext, fork.workspace, true);
        return Ok(void 0);
    }
}
