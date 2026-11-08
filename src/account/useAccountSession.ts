import { useCallback, useEffect, useRef, useState } from 'react';
import { getSessionToken, subscribeSession } from '../suite/suiteSession';

/** Tab focus fires far more often than the account's state can change. */
export const ACCOUNT_RESYNC_INTERVAL_MS = 30_000;

/** What a pull did, for the account menu. */
export function syncSummaryText(parameters: number, items: number, workNoun: string): string {
  if (parameters === 0 && items === 0) return 'Account is up to date';
  const settings = `Restored ${parameters} setting${parameters === 1 ? '' : 's'}`;
  if (items === 0) return settings;
  const noun = items === 1 ? workNoun.replace(/s$/, '') : workNoun;
  return `${settings} and synced ${items} ${noun}`;
}

export interface AccountSessionOptions<U> {
  /** The cached profile for the current session, or null. */
  storedUser: () => U | null;
  /** Asks the API who the session belongs to; null when signed out or refused. */
  fetchUser: () => Promise<U | null>;
  /** Brings the account's settings and saved work down; throws when unreachable. */
  pull: () => Promise<{ parameters: number; items: number }>;
  workNoun: string;
}

/**
 * The signed-in account as React state, kept current with sign-ins and
 * sign-outs in any PhysBox app, and pulled from on mount, on sign-in and when
 * the tab comes back.
 */
export function useAccountSession<U>({ storedUser, fetchUser, pull, workNoun }: AccountSessionOptions<U>) {
  const [user, setUser] = useState<U | null>(storedUser);
  const [sync, setSync] = useState<{ summary: string | null; failed: boolean }>({ summary: null, failed: false });
  const opts = useRef({ storedUser, fetchUser, pull, workNoun });
  opts.current = { storedUser, fetchUser, pull, workNoun };
  const lastPull = useRef(0);

  const pullNow = useCallback(async () => {
    if (!getSessionToken()) return;
    lastPull.current = Date.now();
    try {
      const { parameters, items } = await opts.current.pull();
      setSync({ summary: syncSummaryText(parameters, items, opts.current.workNoun), failed: false });
    } catch (e) {
      console.warn('[PhysBox Cloud] Could not pull account state:', e);
      setSync({ summary: 'Could not reach the sync service', failed: true });
    }
  }, []);

  /** One refresh per session token at a time: a sign-in both notifies and is reported. */
  const inFlight = useRef<{ token: string | null; run: Promise<void> } | null>(null);
  const refresh = useCallback((): Promise<void> => {
    const token = getSessionToken();
    if (inFlight.current && inFlight.current.token === token) return inFlight.current.run;
    const run = (async () => {
      if (!token) {
        setUser(null);
        setSync({ summary: null, failed: false });
        return;
      }
      setUser(opts.current.storedUser());
      const fetched = await opts.current.fetchUser();
      if (fetched) setUser(fetched);
      else if (!getSessionToken()) setUser(null);
      await pullNow();
    })().finally(() => {
      if (inFlight.current?.run === run) inFlight.current = null;
    });
    inFlight.current = { token, run };
    return run;
  }, [pullNow]);

  useEffect(() => {
    void refresh();
    return subscribeSession(() => void refresh());
  }, [refresh]);

  useEffect(() => {
    const resync = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastPull.current < ACCOUNT_RESYNC_INTERVAL_MS) return;
      void pullNow();
    };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);
    window.addEventListener('online', resync);
    return () => {
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('focus', resync);
      window.removeEventListener('online', resync);
    };
  }, [pullNow]);

  /** Call after this app signs in or out; the same as what another app's change triggers. */
  return { user, sync, pullNow, refresh };
}
