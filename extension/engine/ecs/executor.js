// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   GLib main-loop event scheduler (`GLibExecutor` / `WakeupExecutor`) for non-blocking,
//   batched execution of compositor layout and window events.
// - Zero-Trust Boundary & Invariants:
//   `GLibExecutor` drains queued events in `GLib.PRIORITY_HIGH_IDLE` bounded by
//   `MAX_EVENTS_PER_TICK` (NASA JPL Power-of-10 bounded loop rule) to prevent an event storm
//   from freezing the GNOME Shell compositor thread, continuing across ticks until empty.
//   Every source ID is deterministically removed on `.stop()` during `disable()`.

import GLib from 'gi://GLib';

export const MAX_EVENTS_PER_TICK = 256;

export class GLibExecutor {
    #event_loop = null;
    #events = [];

    wake(system, event) {
        this.#events.push([system, event]);
        if (this.#event_loop !== null)
            return;
        this.#event_loop = GLib.idle_add(GLib.PRIORITY_HIGH_IDLE, () => {
            let processed = 0;
            while (this.#events.length > 0 && processed < MAX_EVENTS_PER_TICK) {
                const pair = this.#events.shift();
                processed += 1;
                if (pair && pair[1])
                    pair[0].run(pair[1]);
            }
            if (this.#events.length > 0)
                return GLib.SOURCE_CONTINUE;
            this.#event_loop = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    send(event, run_fn) {
        this.wake({ run: run_fn }, event);
    }

    stop() {
        this.#events.splice(0);
        if (this.#event_loop !== null) {
            GLib.source_remove(this.#event_loop);
            this.#event_loop = null;
        }
    }
}

export { GLibExecutor as WakeupExecutor };
