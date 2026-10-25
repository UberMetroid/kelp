// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   GLib main-loop event schedulers (`GLibExecutor`, `OnceExecutor`, `ChannelExecutor`)
//   for non-blocking, batched execution of compositor layout and migration tasks.
// - Zero-Trust Boundary & Invariants:
//   `GLibExecutor` drains queued events in `GLib.PRIORITY_HIGH_IDLE` bounded by
//   `MAX_EVENTS_PER_TICK` (NASA JPL Power-of-10 bounded loop rule) to prevent an event storm
//   from freezing the GNOME Shell compositor thread. Every source ID is deterministically
//   removed on `.stop()` during `disable()`.

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
            this.#event_loop = null;
            let processed = 0;
            while (this.#events.length > 0 && processed < MAX_EVENTS_PER_TICK) {
                const pair = this.#events.shift();
                processed += 1;
                if (pair && pair[1])
                    pair[0].run(pair[1]);
            }
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

export class OnceExecutor {
    #iterable;
    #signal = null;
    #then_signal = null;

    constructor(iterable) {
        this.#iterable = iterable;
    }

    start(delay, apply, then) {
        this.stop();
        const iterator = this.#iterable[Symbol.iterator]();
        this.#signal = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            const next = iterator.next().value;
            if (typeof next === 'undefined') {
                this.#signal = null;
                if (then) {
                    this.#then_signal = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                        this.#then_signal = null;
                        then();
                        return GLib.SOURCE_REMOVE;
                    });
                }
                return GLib.SOURCE_REMOVE;
            }
            const keep_going = apply(next);
            if (!keep_going)
                this.#signal = null;
            return keep_going;
        });
    }

    stop() {
        if (this.#signal !== null) {
            GLib.source_remove(this.#signal);
            this.#signal = null;
        }
        if (this.#then_signal !== null) {
            GLib.source_remove(this.#then_signal);
            this.#then_signal = null;
        }
    }
}

export class ChannelExecutor {
    #channel = [];
    #signal = null;

    clear() {
        this.#channel.splice(0);
    }

    get length() {
        return this.#channel.length;
    }

    send(v) {
        this.#channel.push(v);
    }

    start(delay, apply) {
        this.stop();
        this.#signal = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            const e = this.#channel.shift();
            if (typeof e === 'undefined')
                return GLib.SOURCE_CONTINUE;
            const keep_going = apply(e);
            if (!keep_going)
                this.#signal = null;
            return keep_going;
        });
    }

    stop() {
        this.clear();
        if (this.#signal !== null) {
            GLib.source_remove(this.#signal);
            this.#signal = null;
        }
    }
}
