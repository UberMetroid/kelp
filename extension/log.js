export const LOG_LEVELS = {
    0: 'OFF',
    1: 'ERROR',
    2: 'WARN',
    3: 'INFO',
    4: 'DEBUG',
    OFF: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4,
};

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
        console.log(`kelp: ${text}`);
}

export function error(text) {
    if (LOG_ENABLED && cached_level > LOG_LEVELS.OFF)
        console.error(`kelp: [ERROR] ${text}`);
}

export function warn(text) {
    if (LOG_ENABLED && cached_level > LOG_LEVELS.ERROR)
        console.warn(`kelp: [WARN] ${text}`);
}

export function info(text) {
    if (LOG_ENABLED && cached_level > LOG_LEVELS.WARN)
        console.info(`kelp: [INFO] ${text}`);
}

export function debug(text) {
    if (LOG_ENABLED && cached_level > LOG_LEVELS.INFO)
        console.debug(`kelp: [DEBUG] ${text}`);
}
