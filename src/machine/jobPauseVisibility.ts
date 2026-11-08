import { useSyncExternalStore } from 'react';

/**
 * Which paused job's dialog has been hidden, shared between the dialog and the
 * status bar's `JobWaitingButton`, which puts it back.
 *
 * Keyed by the stop rather than a flag, so a hidden tool change never hides
 * the next one: a new stop has a new key and opens on its own. One instance
 * per app, at module level.
 */
export interface JobPauseVisibility {
  hide(key: string): void;
  show(): void;
  hiddenKey(): string | null;
  /** The hidden key, as React state. */
  useHiddenKey(): string | null;
}

/** A stop's identity: what it is, where, and what it said. */
export function jobStopKey(status: string, line: number, message?: string | null): string {
  return `${status}|${line}|${message ?? ''}`;
}

export function createJobPauseVisibility(): JobPauseVisibility {
  let hidden: string | null = null;
  const listeners = new Set<() => void>();
  const set = (next: string | null) => {
    if (next === hidden) return;
    hidden = next;
    listeners.forEach((l) => l());
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const get = () => hidden;
  return {
    hide: (key) => set(key),
    show: () => set(null),
    hiddenKey: get,
    useHiddenKey: () => useSyncExternalStore(subscribe, get, get),
  };
}
