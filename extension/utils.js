import * as result from './result.js';
import * as error from './error.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';

const { Ok, Err } = result;
const { Error } = error;

export function is_wayland() {
    if (typeof Meta.is_wayland_compositor === 'function') {
        return Meta.is_wayland_compositor();
    }
    return true;
}

export function block_signal(object, signal) {
    GObject.signal_handler_block(object, signal);
}

export function unblock_signal(object, signal) {
    GObject.signal_handler_unblock(object, signal);
}

export function read_to_string(path) {
    const file = Gio.File.new_for_path(path);
    try {
        const [ok, contents] = file.load_contents(null);
        if (ok) {
            return Ok(new TextDecoder().decode(contents));
        }
        else {
            return Err(new Error(`failed to load contents of ${path}`));
        }
    }
    catch (e) {
        return Err(new Error(String(e)).context(`failed to load contents of ${path}`));
    }
}

export function source_remove(id) {
    return GLib.source_remove(id);
}

export function exists(path) {
    return Gio.File.new_for_path(path).query_exists(null);
}

export function parse_rgba(color) {
    if (typeof color !== 'string')
        return null;
    const trimmed = color.trim();
    const rgb_match = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*(?:\.\d+)?))?\s*\)$/i.exec(trimmed);
    if (rgb_match) {
        const r = Math.min(255, parseInt(rgb_match[1], 10));
        const g = Math.min(255, parseInt(rgb_match[2], 10));
        const b = Math.min(255, parseInt(rgb_match[3], 10));
        const a = rgb_match[4] !== undefined ? Math.min(1, Math.max(0, parseFloat(rgb_match[4]))) : 1;
        return { r, g, b, a };
    }
    const hex6_match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(trimmed);
    if (hex6_match) {
        const r = parseInt(hex6_match[1], 16);
        const g = parseInt(hex6_match[2], 16);
        const b = parseInt(hex6_match[3], 16);
        const a = hex6_match[4] !== undefined ? parseInt(hex6_match[4], 16) / 255 : 1;
        return { r, g, b, a };
    }
    const hex3_match = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
    if (hex3_match) {
        const r = parseInt(hex3_match[1] + hex3_match[1], 16);
        const g = parseInt(hex3_match[2] + hex3_match[2], 16);
        const b = parseInt(hex3_match[3] + hex3_match[3], 16);
        return { r, g, b, a: 1 };
    }
    return null;
}

export function is_valid_color(color) {
    return parse_rgba(color) !== null;
}

export function is_dark(color) {
    const parsed = parse_rgba(color);
    const r = parsed ? parsed.r : 255;
    const g = parsed ? parsed.g : 255;
    const b = parsed ? parsed.b : 255;
    const uicolors = [r / 255, g / 255, b / 255];
    const c = uicolors.map((col) => {
        if (col <= 0.03928) {
            return col / 12.92;
        }
        return Math.pow((col + 0.055) / 1.055, 2.4);
    });
    const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return L <= 0.179;
}

export function map_eq(map1, map2) {
    if (map1.size !== map2.size) {
        return false;
    }
    let cmp;
    for (const [key, val] of map1) {
        cmp = map2.get(key);
        if (cmp !== val || (cmp === undefined && !map2.has(key))) {
            return false;
        }
    }
    return true;
}
