// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Generational Arena (`Arena`) for O(1) indexed slot insertion, removal, and dense
//   iteration of UI components (such as stack tab widgets) without array compaction shifts.
// - Zero-Trust Boundary & Invariants:
//   Pure ES2022 data structure with zero GObject/Shell dependencies and zero import-time
//   side effects. Removed slots are nulled and recycled via `this.unused` so existing
//   numeric handles remain stable until `truncate(0)` is invoked during teardown.

export class Arena {
    constructor() {
        this.slots = [];
        this.unused = [];
    }

    truncate(n) {
        this.slots.splice(n);
        this.unused.splice(n);
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
