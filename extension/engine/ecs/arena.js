// SPDX-License-Identifier: GPL-3.0-or-later
// Generational Arena for O(1) indexed slot insertion, removal, and dense UI component iteration.

export class Arena {
    constructor() {
        this.slots = [];
        this.unused = [];
    }

    truncate(n) {
        this.slots.length = n;
        this.unused = this.unused.filter((s) => s < n);
    }

    get(n) {
        return this.slots[n] ?? null;
    }

    insert(v) {
        const slot = this.unused.pop();
        if (slot !== undefined) {
            this.slots[slot] = v;
            return slot;
        }
        const n = this.slots.length;
        this.slots.push(v);
        return n;
    }

    remove(n) {
        if (this.slots[n] === null || this.slots[n] === undefined)
            return null;
        const v = this.slots[n];
        this.slots[n] = null;
        this.unused.push(n);
        return v;
    }

    *values() {
        for (const v of this.slots) {
            if (v !== null && v !== undefined)
                yield v;
        }
    }
}
