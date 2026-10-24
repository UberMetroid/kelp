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
export function is_dark(color) {
    let color_val = '';
    let r = 255;
    let g = 255;
    let b = 255;
    if (color.indexOf('rgb') >= 0) {
        color = color.replace('rgba', 'rgb').replace('rgb(', '').replace(')', '');
        let colors = color.split(',');
        r = parseInt(colors[0].trim());
        g = parseInt(colors[1].trim());
        b = parseInt(colors[2].trim());
    }
    else if (color.charAt(0) === '#') {
        color_val = color.substring(1, 7);
        r = parseInt(color_val.substring(0, 2), 16);
        g = parseInt(color_val.substring(2, 4), 16);
        b = parseInt(color_val.substring(4, 6), 16);
    }
    let uicolors = [r / 255, g / 255, b / 255];
    let c = uicolors.map((col) => {
        if (col <= 0.03928) {
            return col / 12.92;
        }
        return Math.pow((col + 0.055) / 1.055, 2.4);
    });
    let L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return L <= 0.179;
}
export function map_eq(map1, map2) {
    if (map1.size !== map2.size) {
        return false;
    }
    let cmp;
    for (let [key, val] of map1) {
        cmp = map2.get(key);
        if (cmp !== val || (cmp === undefined && !map2.has(key))) {
            return false;
        }
    }
    return true;
}
