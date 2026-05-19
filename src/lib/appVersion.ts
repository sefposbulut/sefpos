import pkg from '../../package.json';

/** package.json ile senkron uygulama surumu (destek / footer). */
export const APP_VERSION = String(pkg.version || '0.0.0');

export const APP_DISPLAY_VERSION = `v${APP_VERSION}`;
