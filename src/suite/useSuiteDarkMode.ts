import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { subscribeSuiteCookies } from './suiteCookie';
import { applyDarkClass, readDarkMode, setDarkMode } from './suiteTheme';

/**
 * The switch as React state, following changes made in another app's tab.
 * Keeps the `dark` class on <html> in step.
 */
export function useSuiteDarkMode(legacyKey?: string): [boolean, () => void, (on: boolean) => void] {
  const dark = useSyncExternalStore(
    subscribeSuiteCookies,
    () => readDarkMode(legacyKey),
    () => false
  );
  useEffect(() => applyDarkClass(dark), [dark]);
  const toggle = useCallback(() => setDarkMode(!readDarkMode(legacyKey)), [legacyKey]);
  return [dark, toggle, setDarkMode];
}
