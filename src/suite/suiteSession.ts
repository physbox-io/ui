import { SUITE_KEYS, readSuiteCookie, subscribeSuiteCookies, writeSuiteCookie } from './suiteCookie';

/**
 * One sign-in for every PhysBox app in this browser.
 *
 * The session token lives in a suite cookie, so signing in or out of any app
 * (or physbox.io) does it for all of them. The profile is a per-app cache next
 * to the token it belongs to, and is refetched when the token changes under it.
 */

export interface SessionUser {
  id?: string;
  email: string;
  name?: string;
  picture?: string;
  subscription_tier?: string;
}

/** Where each app kept its own session before this. */
const LEGACY_TOKEN_KEY = 'physbox_auth_token';
const PROFILE_KEY = 'physbox_user_profile';
const PROFILE_TOKEN_KEY = 'physbox_user_profile_token';
/**
 * Set once any app has moved to the shared session. From then on a per-app
 * token left in localStorage is stale, not a session to adopt: adopting it
 * would sign somebody back in who signed out in another app.
 */
const SHARED_MARKER = 'physbox_session_shared';

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function getSessionToken(): string | null {
  const token = readSuiteCookie(SUITE_KEYS.session);
  if (token) return token;
  const ls = local();
  const legacy = ls?.getItem(LEGACY_TOKEN_KEY) ?? null;
  if (!legacy) return null;
  ls?.removeItem(LEGACY_TOKEN_KEY);
  if (readSuiteCookie(SHARED_MARKER)) return null;
  writeSuiteCookie(SHARED_MARKER, '1', true);
  writeSuiteCookie(SUITE_KEYS.session, legacy, true);
  ls?.setItem(PROFILE_TOKEN_KEY, legacy);
  return legacy;
}

/** The cached profile, if it belongs to the current session. */
export function getSessionUser<U extends SessionUser = SessionUser>(): U | null {
  const token = getSessionToken();
  const ls = local();
  if (!token || !ls) return null;
  if (ls.getItem(PROFILE_TOKEN_KEY) !== token) return null;
  try {
    const raw = ls.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as U) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: SessionUser): void {
  writeSuiteCookie(SHARED_MARKER, '1');
  writeSuiteCookie(SUITE_KEYS.session, token);
  const ls = local();
  try {
    ls?.removeItem(LEGACY_TOKEN_KEY);
    ls?.setItem(PROFILE_KEY, JSON.stringify(user));
    ls?.setItem(PROFILE_TOKEN_KEY, token);
  } catch {
    // Full storage: the session still holds, the profile is refetched.
  }
}

/** Signs out of every app. */
export function clearSession(): void {
  writeSuiteCookie(SHARED_MARKER, '1');
  writeSuiteCookie(SUITE_KEYS.session, null);
  const ls = local();
  ls?.removeItem(LEGACY_TOKEN_KEY);
  ls?.removeItem(PROFILE_KEY);
  ls?.removeItem(PROFILE_TOKEN_KEY);
}

/** Calls back when the session may have changed, in this app or another. */
export function subscribeSession(listener: () => void): () => void {
  let last = getSessionToken();
  return subscribeSuiteCookies(() => {
    const now = getSessionToken();
    if (now === last) return;
    last = now;
    listener();
  });
}
