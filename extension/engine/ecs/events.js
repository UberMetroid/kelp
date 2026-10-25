// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Typed ECS event tags (`GlobalEvent`, `WindowEvent`) and explicit `Result` (`Ok`, `Err`)
//   and chained `Error` value types for fallible operations without uncaught exceptions.
// - Zero-Trust Boundary & Invariants:
//   Pure value constructors (`Object.freeze` enums and tagged plain objects). `Error.chain()`
//   is bounded by `MAX_ERROR_CHAIN_DEPTH` (NASA JPL Power-of-10 bounded loop rule). Never
//   throws across compositor signal boundaries and allocates zero GObjects at import time.

export const OK = 1;
export const ERR = 2;
const MAX_ERROR_CHAIN_DEPTH = 32;

export function Ok(value) {
    return { kind: OK, value };
}

export function Err(value) {
    return { kind: ERR, value };
}

export class Error {
    constructor(reason) {
        this.cause = null;
        this.reason = reason;
    }

    context(why) {
        const error = new Error(why);
        error.cause = this;
        return error;
    }

    *chain() {
        let current = this;
        let depth = 0;
        while (current !== null && depth < MAX_ERROR_CHAIN_DEPTH) {
            yield current;
            current = current.cause;
            depth += 1;
        }
    }

    format() {
        const causes = this.chain();
        let buffer = causes.next().value.reason;
        for (const error of causes) {
            buffer += `\n    caused by: ${error.reason}`;
        }
        return `${buffer}\n`;
    }
}

export const GlobalEvent = Object.freeze({
    GtkShellChanged: 0,
    GtkThemeChanged: 1,
    MonitorsChanged: 2,
    OverviewShown: 3,
    OverviewHidden: 4,
    Changes: 5,
    Callback: 6,
    WindowCreate: 7,
    WindowMove: 8,
});

export const WindowEvent = Object.freeze({
    Size: 0,
    Workspace: 1,
    Minimize: 2,
    Maximize: 3,
    Fullscreen: 4,
});

export const ExtEvent = Object.freeze({
    Changes: () => ({ tag: 1, kind: GlobalEvent.Changes, callback: () => {} }),
    Callback: (callback, name) => ({ tag: 1, kind: GlobalEvent.Callback, callback, name }),
    WindowCreate: (window) => ({ tag: 3, kind: GlobalEvent.WindowCreate, window }),
    WindowMove: (func) => ({ tag: 1, kind: GlobalEvent.WindowMove, callback: func, func }),
    Global: (event) => ({ tag: 4, kind: event, event }),
});

export function global(event) {
    return ExtEvent.Global(event);
}

export function window_move(ext, window, rect) {
    ext.movements.insert(window.entity, rect);
    return { tag: 2, window, kind: { tag: 1 } };
}

export function window_event(window, event) {
    return { tag: 2, window, kind: { tag: 2, event } };
}
