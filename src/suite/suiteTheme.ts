import { SUITE_KEYS, readSuiteValue, writeSyncedSuiteValue } from './suiteCookie';

/**
 * Dark mode, one switch for every PhysBox app.
 *
 * `legacyKey` is the app's own key from before, read once so the theme
 * somebody already chose is the one they keep.
 */
export function readDarkMode(legacyKey?: string): boolean {
  return readSuiteValue(SUITE_KEYS.darkMode, legacyKey ? [legacyKey] : []) === 'true';
}

/** Sets the `dark` class Tailwind keys on. */
export function applyDarkClass(on: boolean): void {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', on);
}

export function setDarkMode(on: boolean): void {
  writeSyncedSuiteValue(SUITE_KEYS.darkMode, String(on));
  applyDarkClass(on);
}
