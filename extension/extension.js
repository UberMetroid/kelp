// SPDX-License-Identifier: GPL-3.0-or-later
// First-Principles & Zero-Trust Page Header
// - Page Responsibility / Functional Domain:
//   GNOME Shell Extension Entrypoint (`KelpExtension extends Extension`) managing the EGO
//   `enable()` / `disable()` lifecycle and delegating all runtime state to `Ext`.
// - Zero-Trust Boundary & Invariants:
//   Strictly adheres to EGO review rules: zero top-level GObject allocations, signal
//   connections, or file I/O at import time. Everything is constructed inside `enable()`
//   and deterministically destroyed inside `disable()` (`ext.destroy()`, `this.unload_theme()`,
//   `this.exception_dialog.close()`), nulling `this.ext` so lock-screen transitions are leak-free.

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

    unload_theme() {
        if (this.ext !== null) {
            this.ext.unload_theme();
        }
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
}
