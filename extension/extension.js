// SPDX-License-Identifier: GPL-3.0-or-later
// GNOME Shell extension entrypoint (`KelpExtension extends Extension`) managing enable/disable.

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { Ext } from './window/controller.js';

export default class KelpExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this.ext = null;
        this.exception_dialog = null;
    }

    enable() {
        if (this.ext !== null) return;
        this.ext = new Ext(this);
        this.exception_dialog = this.ext.exception_dialog;
    }

    disable() {
        if (this.exception_dialog !== null) {
            this.exception_dialog.close();
            this.exception_dialog = null;
        }
        if (this.ext !== null) {
            this.unload_theme();
            this.ext.destroy();
            this.ext = null;
        }
    }

    unload_theme() {
        if (this.ext !== null) {
            this.ext.unload_theme();
        }
    }
}
