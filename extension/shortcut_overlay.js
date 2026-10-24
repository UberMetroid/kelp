import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Lib from './lib.js';
const { separator } = Lib;
export class Shortcut {
    constructor(description) {
        this.description = description;
        this.bindings = new Array();
    }
    add(binding) {
        this.bindings.push(binding);
        return this;
    }
}
export class Section {
    constructor(header, shortcuts) {
        this.header = header;
        this.shortcuts = shortcuts;
    }
}
export class Column {
    constructor(sections) {
        this.sections = sections;
    }
}
export var ShortcutOverlay = GObject.registerClass(class ShortcutOverlay extends St.BoxLayout {
    constructor() {
        super();
        this.title = '';
        this.columns = new Array();
    }
    _init(title, columns) {
        super._init({
            styleClass: 'pop-shell-shortcuts',
            destroyOnClose: false,
            shellReactive: true,
            shouldFadeIn: true,
            shouldFadeOut: true,
        });
        let columns_layout = new St.BoxLayout({
            styleClass: 'pop-shell-shortcuts-columns',
            orientation: Clutter.Orientation.HORIZONTAL,
        });
        for (const column of columns) {
            let column_layout = new St.BoxLayout({
                styleClass: 'pop-shell-shortcuts-column',
            });
            for (const section of column.sections) {
                column_layout.add_child(this.gen_section(section));
            }
            columns_layout.add_child(column_layout);
        }
        this.add_child(new St.Label({
            styleClass: 'pop-shell-shortcuts-title',
            text: title,
        }));
        this.add_child(columns_layout);
    }
    gen_combination(combination) {
        let layout = new St.BoxLayout({
            styleClass: 'pop-shell-binding',
            orientation: Clutter.Orientation.HORIZONTAL,
        });
        for (const key of combination) {
            layout.add_child(new St.Label({ text: key }));
        }
        return layout;
    }
    gen_section(section) {
        let layout = new St.BoxLayout({
            styleClass: 'pop-shell-section',
        });
        layout.add_child(new St.Label({
            styleClass: 'pop-shell-section-header',
            text: section.header,
        }));
        for (const subsection of section.shortcuts) {
            layout.add_child(separator());
            layout.add_child(this.gen_shortcut(subsection));
        }
        return layout;
    }
    gen_shortcut(shortcut) {
        let layout = new St.BoxLayout({
            styleClass: 'pop-shell-shortcut',
            orientation: Clutter.Orientation.HORIZONTAL,
        });
        layout.add_child(new St.Label({
            text: shortcut.description,
        }));
        return layout;
    }
});
