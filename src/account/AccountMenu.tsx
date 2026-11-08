import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle, History, LogOut, Radio, ShieldCheck, Sparkles, User } from 'lucide-react';

/**
 * The avatar in each app's top bar, its menu, and the sign-in window.
 *
 * The session itself is shared (see suiteSession); this is the one place it is
 * drawn. Apps supply how they sign in, what their saved work is called, and
 * the modals the menu opens.
 */

/**
 * Asks for the sign-in window from elsewhere in the app, with an optional
 * `detail.reason`; `SIGNED_IN_EVENT` carries the reason back when it is done.
 */
export const SIGN_IN_REQUESTED_EVENT = 'physbox:sign-in-requested';
export const SIGNED_IN_EVENT = 'physbox:signed-in';

export interface AccountMenuUser {
  email: string;
  name?: string;
  picture?: string;
  subscription_tier?: string;
}

export type AccountSignIn =
  /** A window of the app's own (Mesh: its page is cross-origin isolated). Resolves once signed in. */
  | { kind: 'popup'; start: () => Promise<void> }
  /** Google's button drawn in the modal; `exchange` trades the credential for a session. */
  | {
      kind: 'google-button';
      configured: boolean;
      render: (el: HTMLElement, onCredential: (credential: string) => void, onError: (message: string) => void) => Promise<void>;
      exchange: (credential: string) => Promise<void>;
    };

export type AccountAccent = 'indigo' | 'emerald' | 'cyan';

const ACCENTS: Record<AccountAccent, { icon: string; ring: string; badge: string; button: string }> = {
  indigo: {
    icon: 'text-indigo-600 dark:text-indigo-400',
    ring: 'border-indigo-500/30',
    badge: 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400',
    button: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20',
  },
  emerald: {
    icon: 'text-emerald-600 dark:text-emerald-400',
    ring: 'border-emerald-500/30',
    badge: 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    button: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20',
  },
  cyan: {
    icon: 'text-cyan-600 dark:text-cyan-400',
    ring: 'border-cyan-500/30',
    badge: 'bg-cyan-50 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400',
    button: 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-600/20',
  },
};

export interface AccountMenuProps {
  user: AccountMenuUser | null;
  accent: AccountAccent;
  /** What the app's saved work is called, plural: "designs", "circuits", "scenes". */
  workNoun: string;
  /** A same-origin copy of the avatar, where the page cannot load Google's (Mesh). */
  avatarDataUri?: string | null;
  sync: { summary: string | null; failed: boolean };
  signIn: AccountSignIn;
  /**
   * After a sign-in; `reason` is set when something else asked for it. Awaited
   * before `SIGNED_IN_EVENT` goes out, so the account's state is down first.
   */
  onSignedIn: (reason: string | null) => void | Promise<void>;
  onSignOut: () => void;
  onOpenRemote: () => void;
  onOpenHistory: () => void;
  onOpenGuestList: () => void;
  /** Rendered beside the menu: the app's modals. */
  children?: React.ReactNode;
}

function Avatar({
  src,
  dataUri,
  className,
  fallback,
}: {
  src: string | null;
  dataUri: boolean;
  className: string;
  fallback: React.ReactNode;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (!src || broken) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt="Avatar"
      // CORS mode, so a cross-origin isolated page will accept Google's image.
      crossOrigin={dataUri ? undefined : 'anonymous'}
      // Google's avatar 403s on an unexpected Referer.
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setBroken(true)}
    />
  );
}

const GoogleG = () => (
  <svg className="w-4 h-4" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.33A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.95 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.16 6.65 3.58 9 3.58z" />
  </svg>
);

const errorMessage = (err: unknown, fallback: string) =>
  (err as { message?: string } | null)?.message || fallback;

export function AccountMenu({
  user,
  accent,
  workNoun,
  avatarDataUri,
  sync,
  signIn,
  onSignedIn,
  onSignOut,
  onOpenRemote,
  onOpenHistory,
  onOpenGuestList,
  children,
}: AccountMenuProps) {
  const a = ACCENTS[accent];
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const googleRef = useRef<HTMLDivElement>(null);
  /** Why the window was opened, when something else opened it. */
  const reason = useRef<string | null>(null);

  const avatarSrc = user ? (avatarDataUri ?? user.picture ?? null) : null;
  const isActiveSub = user?.subscription_tier === 'active';

  useEffect(() => {
    const open = (e: Event) => {
      reason.current = (e as CustomEvent<{ reason?: string }>).detail?.reason ?? 'unspecified';
      setError(null);
      setLoginOpen(true);
    };
    window.addEventListener(SIGN_IN_REQUESTED_EVENT, open);
    return () => window.removeEventListener(SIGN_IN_REQUESTED_EVENT, open);
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!buttonRef.current?.contains(t) && !menuRef.current?.contains(t)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (!loginOpen || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLoginOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loginOpen, busy]);

  /** A session turning up, here or in another app, closes the window. */
  useEffect(() => {
    if (user && loginOpen && !busy) setLoginOpen(false);
  }, [user, loginOpen, busy]);

  const finish = useCallback(async () => {
    setLoginOpen(false);
    setMenuOpen(false);
    const asked = reason.current;
    reason.current = null;
    await onSignedIn(asked);
    if (asked) window.dispatchEvent(new CustomEvent(SIGNED_IN_EVENT, { detail: { reason: asked } }));
  }, [onSignedIn]);

  const run = useCallback(
    async (step: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await step();
      } catch (err) {
        setError(errorMessage(err, 'Sign in failed. Please try again.'));
        setBusy(false);
        return;
      }
      setBusy(false);
      try {
        await finish();
      } catch (err) {
        console.warn('[PhysBox] After sign-in:', err);
      }
    },
    [finish]
  );

  useEffect(() => {
    if (!loginOpen || signIn.kind !== 'google-button' || !signIn.configured || !googleRef.current) return;
    let cancelled = false;
    signIn
      .render(
        googleRef.current,
        (credential) => {
          if (!cancelled) void run(() => signIn.exchange(credential));
        },
        (message) => {
          if (!cancelled) setError(message);
        }
      )
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, 'Could not load Google sign-in.'));
      });
    return () => {
      cancelled = true;
    };
  }, [loginOpen, signIn, run]);

  const item =
    'w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer';
  const close = (then: () => void) => () => {
    setMenuOpen(false);
    then();
  };

  const menu = (
    <div
      ref={menuRef}
      style={anchor ? { top: anchor.top, right: anchor.right } : undefined}
      className="fixed w-72 max-lg:inset-x-2 max-lg:top-1/2 max-lg:-translate-y-1/2 max-lg:w-auto max-lg:max-h-[85dvh] max-lg:overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[130] p-3 space-y-3 text-slate-800 dark:text-slate-100"
    >
      {user ? (
        <>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <Avatar
                src={avatarSrc}
                dataUri={Boolean(user && avatarDataUri)}
                className={`w-8 h-8 rounded-full border ${a.ring}`}
                fallback={
                  <div className={`p-2 rounded-lg ${a.badge}`}>
                    <User className="w-4 h-4" />
                  </div>
                }
              />
              <div className="overflow-hidden">
                <p className="font-bold text-slate-800 dark:text-slate-100 text-xs truncate">{user.name || 'PhysBox Member'}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Subscription Status</span>
              {isActiveSub ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                  <ShieldCheck className="w-3 h-3" /> Active Subscription
                </span>
              ) : (
                <button
                  type="button"
                  onClick={close(onOpenGuestList)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" /> On the Guest List 🎉
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <button type="button" onClick={close(onOpenRemote)} className={item}>
              <Radio className={`w-4 h-4 ${a.icon}`} />
              <span>View Remote Machining Telemetry</span>
            </button>
            <button type="button" onClick={close(onOpenHistory)} className={item}>
              <History className={`w-4 h-4 ${a.icon}`} />
              <span>Job History</span>
            </button>
            <div className="px-3 py-1.5 text-[10px] text-slate-500 flex items-center gap-1.5">
              {sync.failed ? (
                <AlertCircle className="w-3 h-3 text-amber-500 dark:text-amber-400" />
              ) : (
                <CheckCircle className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
              )}
              <span>{sync.summary ?? `Syncing settings and ${workNoun}…`}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={close(onSignOut)}
              title="Signs you out of every PhysBox app in this browser"
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-3 p-1">
          <div className="text-center">
            <p className="font-bold text-slate-800 dark:text-slate-100 text-xs">PhysBox Account Sign In</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Sign in to sync settings, saved {workNoun}, and remote telemetry across the PhysBox apps.
            </p>
          </div>
          <button
            type="button"
            onClick={close(() => {
              setError(null);
              setLoginOpen(true);
            })}
            className={`w-full py-2 px-3 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition shadow-md cursor-pointer ${a.button}`}
          >
            <User className="w-4 h-4" />
            <span>Sign In / Early Access</span>
          </button>
        </div>
      )}
    </div>
  );

  const login = (
    <div
      className="fixed inset-0 z-[99999] bg-slate-900/50 dark:bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      onClick={() => {
        if (!busy) setLoginOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="PhysBox Account Sign In"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl relative max-h-[90dvh] overflow-y-auto my-auto text-slate-800 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setLoginOpen(false)}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          title="Close (Esc)"
        >
          ✕
        </button>
        <div className="text-center space-y-1">
          <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">PhysBox Account Sign In</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sign in with your Google account to sync your settings and saved {workNoun}, or to join the early
            access guest list. One sign-in covers every PhysBox app.
          </p>
        </div>
        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs text-center">
            {error}
          </div>
        )}
        {signIn.kind === 'popup' ? (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => void run(signIn.start)}
              disabled={busy}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white dark:bg-slate-100 hover:bg-slate-50 dark:hover:bg-white border border-slate-300 text-slate-800 text-sm font-semibold shadow-sm disabled:opacity-50 cursor-pointer transition-colors"
            >
              <GoogleG />
              <span>Sign in with Google</span>
            </button>
          </div>
        ) : signIn.configured ? (
          <div ref={googleRef} className="flex justify-center min-h-[44px] pt-1" />
        ) : (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] space-y-1">
            <p className="font-semibold">Google sign-in is not configured for this build.</p>
            <p>
              Set <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> to the OAuth Web client id and rebuild. It
              must match the <code className="font-mono">GOOGLE_CLIENT_ID</code> the API runs with.
            </p>
          </div>
        )}
        {busy && <p className="text-center text-xs text-slate-500 dark:text-slate-400">Signing in…</p>}
      </div>
    </div>
  );

  const portal = (node: React.ReactNode) => (typeof document === 'undefined' ? node : createPortal(node, document.body));

  return (
    <div className="relative" ref={buttonRef}>
      <button
        type="button"
        onClick={(e) => {
          // Below `lg` the top bar wraps, so the menu becomes a centred sheet instead.
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor(
            window.matchMedia('(min-width: 1024px)').matches ? { top: r.bottom + 8, right: window.innerWidth - r.right } : null
          );
          setMenuOpen((o) => !o);
        }}
        className="relative flex items-center justify-center w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:outline-none flex-shrink-0 cursor-pointer shadow-xs"
        title={user ? `Account (${user.email})` : 'Sign In / Early Access'}
      >
        <Avatar
          src={avatarSrc}
          dataUri={Boolean(user && avatarDataUri)}
          className="absolute inset-0 h-full w-full rounded-full object-cover"
          fallback={<User className={`w-4 h-4 ${a.icon}`} />}
        />
        <span
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${
            user ? (isActiveSub ? 'bg-emerald-400' : 'bg-amber-400') : 'bg-slate-400'
          }`}
        />
      </button>
      {menuOpen && portal(menu)}
      {loginOpen && portal(login)}
      {children}
    </div>
  );
}
