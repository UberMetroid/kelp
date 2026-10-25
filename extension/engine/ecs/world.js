// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   Generational Entity-Component-System (`Storage`, `World`, `System`) and entity state
//   tags (`Tiled`, `Floating`, `Blocked`, `ForceTile`) backing all window and fork entities.
// - Zero-Trust Boundary & Invariants:
//   Every entity is a `[slot_index, generation]` tuple (`entity_new`). Accessing or removing
//   a component checks `slot[0] === generation`, preventing use-after-free bugs when an
//   entity slot is recycled after a window closes. Zero import-time GObject allocations.

export const Tiled = 0;
export const Floating = 1;
export const Blocked = 2;
export const ForceTile = 3;

export function entity_eq(a, b) {
    return Boolean(a && b && a[0] === b[0] && a[1] === b[1]);
}

export function entity_new(pos, gen) {
    return [pos, gen];
}

function swap_remove(array, index) {
    array[index] = array[array.length - 1];
    return array.pop();
}

export class Storage {
    constructor() {
        this.store = [];
    }

    *_iter() {
        let idx = 0;
        for (const slot of this.store) {
            if (slot)
                yield [idx, slot];
            idx += 1;
        }
    }

    *iter() {
        for (const [idx, [gen, value]] of this._iter()) {
            yield [entity_new(idx, gen), value];
        }
    }

    *find(func) {
        for (const [idx, [gen, value]] of this._iter()) {
            if (func(value))
                yield entity_new(idx, gen);
        }
    }

    *values() {
        for (const [, [, value]] of this._iter()) {
            yield value;
        }
    }

    contains(entity) {
        return this.get(entity) !== null;
    }

    get(entity) {
        if (!entity)
            return null;
        const [id, gen] = entity;
        const val = this.store[id];
        return val && val[0] === gen ? val[1] : null;
    }

    get_or(entity, init) {
        let value = this.get(entity);
        if (!value) {
            value = init();
            this.insert(entity, value);
        }
        return value;
    }

    insert(entity, component) {
        const [id, gen] = entity;
        const length = this.store.length;
        if (length >= id) {
            this.store.fill(null, length, id);
        }
        this.store[id] = [gen, component];
    }

    is_empty() {
        for (const slot of this.store) {
            if (slot)
                return false;
        }
        return true;
    }

    remove(entity) {
        const comp = this.get(entity);
        if (comp) {
            this.store[entity[0]] = null;
        }
        return comp;
    }

    clear() {
        this.store.splice(0);
    }

    take_with(entity, func) {
        const component = this.remove(entity);
        return component ? func(component) : null;
    }

    with(entity, func) {
        const component = this.get(entity);
        return component ? func(component) : null;
    }
}

export class World {
    constructor() {
        this.entities_ = [];
        this.storages = [];
        this.tags_ = [];
        this.free_slots = [];
    }

    get capacity() {
        return this.entities_.length;
    }

    get free() {
        return this.free_slots.length;
    }

    get length() {
        return this.capacity - this.free;
    }

    tags(entity) {
        return this.tags_[entity[0]];
    }

    *entities() {
        for (const entity of this.entities_.values()) {
            if (this.free_slots.indexOf(entity[0]) === -1)
                yield entity;
        }
    }

    create_entity() {
        const slot = this.free_slots.pop();
        if (slot !== undefined) {
            const entity = this.entities_[slot];
            entity[1] += 1;
            return entity;
        }
        const entity = entity_new(this.capacity, 0);
        this.entities_.push(entity);
        this.tags_.push(new Set());
        return entity;
    }

    delete_entity(entity) {
        this.tags(entity)?.clear();
        for (const storage of this.storages) {
            storage.remove(entity);
        }
        this.free_slots.push(entity[0]);
    }

    add_tag(entity, tag) {
        this.tags(entity)?.add(tag);
    }

    contains_tag(entity, tag) {
        return Boolean(this.tags(entity)?.has(tag));
    }

    delete_tag(entity, tag) {
        this.tags(entity)?.delete(tag);
    }

    register_storage() {
        const storage = new Storage();
        this.storages.push(storage);
        return storage;
    }

    unregister_storage(storage) {
        const matched = this.storages.indexOf(storage);
        if (matched !== -1) {
            swap_remove(this.storages, matched);
        }
    }
}

export class System extends World {
    #executor;

    constructor(executor) {
        super();
        this.#executor = executor;
    }

    get executor() {
        return this.#executor;
    }

    register(event) {
        this.#executor.wake(this, event);
    }

    run(_event) {}
}
