import GLib from 'gi://GLib';

export class GLibExecutor {
    #event_loop = null;
    #events = [];

    wake(system, event) {
        this.#events.push(event);
        if (this.#event_loop !== null)
            return;
        this.#event_loop = GLib.idle_add(GLib.PRIORITY_HIGH_IDLE, () => {
            while (this.#events.length > 0) {
                const next = this.#events.shift();
                if (next)
                    system.run(next);
            }
            this.#event_loop = null;
            return GLib.SOURCE_REMOVE;
        });
    }
}

export class OnceExecutor {
    #iterable;
    #signal = null;

    constructor(iterable) {
        this.#iterable = iterable;
    }

    start(delay, apply, then) {
        this.stop();
        const iterator = this.#iterable[Symbol.iterator]();
        this.#signal = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            const next = iterator.next().value;
            if (typeof next === 'undefined') {
                if (then)
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                        then();
                        return false;
                    });
                this.#signal = null;
                return false;
            }
            return apply(next);
        });
    }

    stop() {
        if (this.#signal !== null) {
            GLib.source_remove(this.#signal);
            this.#signal = null;
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
            return typeof e === 'undefined' ? true : apply(e);
        });
    }

    stop() {
        if (this.#signal !== null) {
            GLib.source_remove(this.#signal);
            this.#signal = null;
        }
    }
}
