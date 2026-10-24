export var LOG_LEVELS;
(function (LOG_LEVELS) {
    LOG_LEVELS[LOG_LEVELS["OFF"] = 0] = "OFF";
    LOG_LEVELS[LOG_LEVELS["ERROR"] = 1] = "ERROR";
    LOG_LEVELS[LOG_LEVELS["WARN"] = 2] = "WARN";
    LOG_LEVELS[LOG_LEVELS["INFO"] = 3] = "INFO";
    LOG_LEVELS[LOG_LEVELS["DEBUG"] = 4] = "DEBUG";
})(LOG_LEVELS || (LOG_LEVELS = {}));

export let LOG_ENABLED = false;
let cached_level = LOG_LEVELS.OFF;

export function set_log_level(level) {
    cached_level = Number(level) || 0;
    LOG_ENABLED = cached_level > LOG_LEVELS.OFF;
}

export function log_level() {
    return cached_level;
}

export function log(text) {
    if (LOG_ENABLED)
        globalThis.log('pop-shell: ' + text);
}

export function error(text) {
    if (LOG_ENABLED && cached_level > LOG_LEVELS.OFF)
        globalThis.log('pop-shell: [ERROR] ' + text);
}

export function warn(text) {
    if (LOG_ENABLED && cached_level > LOG_LEVELS.ERROR)
        globalThis.log('pop-shell: [WARN] ' + text);
}

export function info(text) {
    if (LOG_ENABLED && cached_level > LOG_LEVELS.WARN)
        globalThis.log('pop-shell: [INFO] ' + text);
}

export function debug(text) {
    if (LOG_ENABLED && cached_level > LOG_LEVELS.INFO)
        globalThis.log('pop-shell: [DEBUG] ' + text);
}
