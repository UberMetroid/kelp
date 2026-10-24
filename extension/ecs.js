export function entity_eq(a, b) {
    return a[0] === b[0] && a[1] === b[1];
}

export function entity_new(pos, gen) {
    return [pos, gen];
}

export class Storage {
    constructor() {
        this.store = new Array();
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
        return this.get(entity) != null;
    }

    get(entity) {
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
        for (const slot of this.store)
            if (slot)
                return false;
        return true;
    }

    remove(entity) {
        const comp = this.get(entity);
        if (comp) {
            this.store[entity[0]] = null;
        }
        return comp;
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
        this.entities_ = new Array();
        this.storages = new Array();
        this.tags_ = new Array();
        this.free_slots = new Array();
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
            if (!(this.free_slots.indexOf(entity[0]) > -1))
                yield entity;
        }
    }

    create_entity() {
        const slot = this.free_slots.pop();
        let entity;
        if (slot !== undefined) {
            entity = this.entities_[slot];
            entity[1] += 1;
        }
        else {
            entity = entity_new(this.capacity, 0);
            this.entities_.push(entity);
            this.tags_.push(new Set());
        }
        return entity;
    }

    delete_entity(entity) {
        this.tags(entity).clear();
        for (const storage of this.storages) {
            storage.remove(entity);
        }
        this.free_slots.push(entity[0]);
    }

    add_tag(entity, tag) {
        this.tags(entity).add(tag);
    }

    contains_tag(entity, tag) {
        return this.tags(entity).has(tag);
    }

    delete_tag(entity, tag) {
        this.tags(entity).delete(tag);
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

function swap_remove(array, index) {
    array[index] = array[array.length - 1];
    return array.pop();
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

    run(_event) { }
}
