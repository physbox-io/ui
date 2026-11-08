/**
 * Settings shared by every PhysBox app in this browser.
 *
 * Each app is its own origin (etch., volt., mesh.physbox.io), so localStorage
 * cannot carry anything between them. A cookie scoped to the parent domain can,
 * and is readable synchronously at boot, so a dark theme is applied before the
 * first paint. On localhost the cookie is host-only, and cookies ignore the
 * port, so the dev servers on 5173-5176 share it the same way.
 *
 * Nothing on the server reads these: the API authenticates by header.
 */

const MAX_AGE_S = 400 * 24 * 60 * 60; // the longest a browser keeps a cookie

/** The parent domain the cookie is scoped to, or null for host-only. */
export function suiteCookieDomain(hostname: string): string | null {
  if (hostname === 'physbox.io' || hostname.endsWith('.physbox.io')) return 'physbox.io';
  return null;
}

function doc(): Document | null {
  return typeof document === 'undefined' ? null : document;
}

export function readSuiteCookie(name: string): string | null {
  const d = doc();
  if (!d) return null;
  let raw: string;
  try {
    raw = d.cookie;
  } catch {
    return null;
  }
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Writes (or, with null, deletes) a suite cookie, then tells this page's
 * listeners. `silent` is for writes made while reading, which may happen
 * during a React render, where notifying would update other components.
 */
export function writeSuiteCookie(name: string, value: string | null, silent = false): void {
  const d = doc();
  if (!d) return;
  const loc = typeof location === 'undefined' ? null : location;
  const domain = loc ? suiteCookieDomain(loc.hostname) : null;
  const attrs = [
    'Path=/',
    value === null ? 'Max-Age=0' : `Max-Age=${MAX_AGE_S}`,
    'SameSite=Lax',
    ...(domain ? [`Domain=${domain}`] : []),
    ...(loc?.protocol === 'https:' ? ['Secure'] : []),
  ];
  try {
    d.cookie = `${name}=${value === null ? '' : encodeURIComponent(value)}; ${attrs.join('; ')}`;
  } catch {
    return;
  }
  if (!silent) notify();
}

const listeners = new Set<() => void>();
let snapshot = '';
let watching = false;

function notify(): void {
  const d = doc();
  try {
    snapshot = d ? d.cookie : '';
  } catch {
    snapshot = '';
  }
  listeners.forEach((l) => l());
}

/**
 * Another app's tab may change a suite cookie at any time, and cookies raise no
 * event in the other tabs (cookieStore does, where it exists). Coming back to a
 * tab is when it matters, so that is when the cookies are compared.
 */
function check(): void {
  const d = doc();
  if (!d) return;
  let now = '';
  try {
    now = d.cookie;
  } catch {
    return;
  }
  if (now !== snapshot) notify();
}

function watch(): void {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  try {
    snapshot = document.cookie;
  } catch {
    snapshot = '';
  }
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  const store = (window as unknown as { cookieStore?: EventTarget }).cookieStore;
  store?.addEventListener?.('change', check);
}

/** Calls back whenever any suite cookie may have changed, here or in another app. */
export function subscribeSuiteCookies(listener: () => void): () => void {
  watch();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Reads a suite cookie, adopting this app's older per-origin value the first
 * time, so nobody's setting changes on the day the apps start sharing it.
 */
export function readSuiteValue(name: string, legacyKeys: readonly string[] = []): string | null {
  const shared = readSuiteCookie(name);
  if (shared !== null) return shared;
  for (const key of legacyKeys) {
    let legacy: string | null = null;
    try {
      legacy = localStorage.getItem(key);
    } catch {
      legacy = null;
    }
    if (legacy !== null) {
      writeSuiteCookie(name, legacy, true);
      return legacy;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Account sync
// ---------------------------------------------------------------------------

type Pusher = (parameters: Record<string, string>) => void;
let pusher: Pusher | null = null;

/** Every shared setting, by cookie name. */
export const SUITE_KEYS = {
  darkMode: 'physbox_dark_mode',
  touchPlateMm: 'physbox_touch_plate_mm',
  shimMm: 'physbox_shim_mm',
  machineLink: 'physbox_machine_link',
  cloudDeviceId: 'physbox_cloud_device_id',
  session: 'physbox_session',
} as const;

/**
 * The ones that also follow the account to other devices, as `global`
 * parameters under the same names. The machine link stays per computer: the
 * box on the bench here is not necessarily the one at home.
 */
export const SUITE_SYNCED_KEYS: readonly string[] = [SUITE_KEYS.darkMode, SUITE_KEYS.touchPlateMm, SUITE_KEYS.shimMm];
const syncedNames = new Set(SUITE_SYNCED_KEYS);

/**
 * Each app registers how to send a setting to the account's `global` scope.
 * Fire-and-forget on the app's side, and a no-op when signed out.
 */
export function setSuiteParameterPusher(push: Pusher | null): void {
  pusher = push;
}

/** Writes a shared value here and, when signed in, to the account. */
export function writeSyncedSuiteValue(name: string, value: string): void {
  writeSuiteCookie(name, value);
  if (syncedNames.has(name)) pusher?.({ [name]: value });
}

/**
 * Takes the account's copies of the shared values, from its `global`
 * parameters. Returns how many changed here.
 */
export function adoptSuiteParameters(params: Record<string, unknown>): number {
  let changed = 0;
  for (const name of syncedNames) {
    const value = params[name];
    if (value === undefined || value === null) continue;
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (readSuiteCookie(name) === text) continue;
    writeSuiteCookie(name, text);
    changed += 1;
  }
  return changed;
}
