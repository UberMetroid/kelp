// SPDX-License-Identifier: GPL-3.0-or-later
// GLib main-loop event scheduler (GLibExecutor / WakeupExecutor) for batched layout events.

import GLib from 'gi://GLib';
import * as log from '../../ui/settings/log.js';

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
            try {
                while (this.#events.length > 0 && processed < MAX_EVENTS_PER_TICK) {
                    const pair = this.#events.shift();
                    processed += 1;
                    if (pair && pair[1])
                        pair[0].run(pair[1]);
                }
            } catch (e) {
                log.error(`GLibExecutor task failed: ${e}`);
            }
            if (this.#event_loop !== null && this.#events.length > 0)
                return GLib.SOURCE_CONTINUE;
            this.#event_loop = null;
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this.#event_loop, '[kelp] wakeup-executor');
    }

    send(event, run_fn) {
        this.wake({ run: run_fn }, event);
    }

    stop() {
        this.#events.splice(0);
        if (this.#event_loop !== null) {
            const id = this.#event_loop;
            this.#event_loop = null;
            GLib.source_remove(id);
        }
    }
}

export { GLibExecutor as WakeupExecutor };
