import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * A browser's cookie jar, enough of one: `document.cookie` reads every live
 * cookie and a write sets or (Max-Age=0) deletes one. Attributes are recorded
 * so the domain and Secure handling can be checked.
 */
function installBrowser(hostname: string, protocol = 'https:') {
  const jar = new Map<string, string>();
  const writes: string[] = [];
  const store = new Map<string, string>();
  vi.stubGlobal('document', {
    get cookie() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    set cookie(line: string) {
      writes.push(line);
      const [pair, ...attrs] = line.split(';').map((s) => s.trim());
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      if (attrs.includes('Max-Age=0')) jar.delete(name);
      else jar.set(name, pair.slice(eq + 1));
    },
    documentElement: { classList: { toggle: () => {} } },
  });
  vi.stubGlobal('location', { hostname, protocol });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  });
  return { jar, writes, store };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const load = async () => ({
  ...(await import('../src/suite/suiteCookie')),
  ...(await import('../src/suite/suiteSession')),
  ...(await import('../src/machine/touchPlate')),
});

describe('suite cookies', () => {
  it('scope to physbox.io from any app, host-only on localhost', async () => {
    const { suiteCookieDomain } = await load();
    expect(suiteCookieDomain('mesh.physbox.io')).toBe('physbox.io');
    expect(suiteCookieDomain('physbox.io')).toBe('physbox.io');
    expect(suiteCookieDomain('localhost')).toBeNull();
    expect(suiteCookieDomain('evilphysbox.io')).toBeNull();
  });

  it('write with the parent domain and Secure in production', async () => {
    const b = installBrowser('etch.physbox.io');
    const { writeSuiteCookie, readSuiteCookie } = await load();
    writeSuiteCookie('physbox_dark_mode', 'true');
    expect(b.writes[0]).toContain('Domain=physbox.io');
    expect(b.writes[0]).toContain('Secure');
    expect(readSuiteCookie('physbox_dark_mode')).toBe('true');
  });

  it('adopt an app’s own older value once, then keep the shared one', async () => {
    const b = installBrowser('localhost', 'http:');
    b.store.set('circuit_dark_mode', 'true');
    const { readSuiteValue, writeSuiteCookie } = await load();
    expect(readSuiteValue('physbox_dark_mode', ['circuit_dark_mode'])).toBe('true');
    expect(b.writes[0]).not.toContain('Domain=');
    expect(b.writes[0]).not.toContain('Secure');
    writeSuiteCookie('physbox_dark_mode', 'false');
    expect(readSuiteValue('physbox_dark_mode', ['circuit_dark_mode'])).toBe('false');
  });

  it('push only the account-synced settings, and adopt the account’s copies', async () => {
    installBrowser('volt.physbox.io');
    const { setSuiteParameterPusher, writeSyncedSuiteValue, adoptSuiteParameters, readSuiteCookie } = await load();
    const pushed: Record<string, string>[] = [];
    setSuiteParameterPusher((p) => pushed.push(p));
    writeSyncedSuiteValue('physbox_touch_plate_mm', '15');
    writeSyncedSuiteValue('physbox_machine_link', 'cloud');
    expect(pushed).toEqual([{ physbox_touch_plate_mm: '15' }]);
    expect(adoptSuiteParameters({ physbox_touch_plate_mm: 15, physbox_shim_mm: 0.2, other: 1 })).toBe(1);
    expect(readSuiteCookie('physbox_shim_mm')).toBe('0.2');
  });
});

describe('shared session', () => {
  it('moves an app’s own session into the suite cookie on first read', async () => {
    const b = installBrowser('mesh.physbox.io');
    b.store.set('physbox_auth_token', 'tok1');
    b.store.set('physbox_user_profile', JSON.stringify({ email: 'a@b.c' }));
    const { getSessionToken, getSessionUser } = await load();
    expect(getSessionToken()).toBe('tok1');
    expect(b.jar.get('physbox_session')).toBe('tok1');
    expect(b.store.has('physbox_auth_token')).toBe(false);
    expect(getSessionUser()?.email).toBe('a@b.c');
  });

  it('does not sign back in an app whose stale session outlived a sign-out elsewhere', async () => {
    const b = installBrowser('volt.physbox.io');
    b.jar.set('physbox_session_shared', '1');
    b.store.set('physbox_auth_token', 'stale');
    const { getSessionToken } = await load();
    expect(getSessionToken()).toBeNull();
    expect(b.store.has('physbox_auth_token')).toBe(false);
  });

  it('signs in and out of every app at once', async () => {
    const b = installBrowser('etch.physbox.io');
    const { setSession, clearSession, getSessionToken, getSessionUser } = await load();
    setSession('tok2', { email: 'x@y.z' });
    expect(getSessionToken()).toBe('tok2');
    expect(getSessionUser()?.email).toBe('x@y.z');
    // Another app signs in as somebody else: this app's cached profile is not theirs.
    b.jar.set('physbox_session', 'tok3');
    expect(getSessionUser()).toBeNull();
    clearSession();
    expect(getSessionToken()).toBeNull();
  });
});

describe('touch plate, shim and machine link', () => {
  it('take the first app’s older value and clamp what is written', async () => {
    const b = installBrowser('mesh.physbox.io');
    b.store.set('meshTouchPlateMm', '9.5');
    b.store.set('meshZeroShimMm', '0');
    const { readTouchPlateMm, readShimMm, setShimMm, setTouchPlateMm } = await load();
    expect(readTouchPlateMm()).toBe(9.5);
    expect(readShimMm()).toBe(0);
    expect(setShimMm(50)).toBe(10);
    expect(setTouchPlateMm(-1)).toBe(12);
  });

  it('defaults when nothing was ever set', async () => {
    installBrowser('etch.physbox.io');
    const { readTouchPlateMm, readShimMm, readMachineLink } = await load();
    expect(readTouchPlateMm()).toBe(12);
    expect(readShimMm()).toBe(0.1);
    expect(readMachineLink()).toEqual({ kind: 'usb', deviceId: null });
  });

  it('read Etch and Volt’s "wifi" as the cloud link', async () => {
    const b = installBrowser('etch.physbox.io');
    b.store.set('etchTransport', 'wifi');
    b.store.set('etchCloudDeviceId', 'dev-1');
    const { readMachineLink, setMachineLink } = await load();
    expect(readMachineLink()).toEqual({ kind: 'cloud', deviceId: 'dev-1' });
    setMachineLink({ kind: 'usb' });
    expect(readMachineLink()).toEqual({ kind: 'usb', deviceId: 'dev-1' });
  });
});

describe('shared components', () => {
  it('safety warning names the beam only for a laser, and links the license when it can', async () => {
    const { SafetyAckDialog } = await import('../src/machine/SafetyAck');
    const noop = () => {};
    const laser = renderToStaticMarkup(<SafetyAckDialog laser onOpenLicense={noop} onAcknowledge={noop} onDecline={noop} />);
    const cnc = renderToStaticMarkup(<SafetyAckDialog onAcknowledge={noop} onDecline={noop} />);
    expect(laser).toContain('rated for the beam');
    expect(laser).toContain('<button type="button" class="underline');
    expect(cnc).not.toContain('rated for the beam');
    expect(cnc).toContain('in this app&#x27;s Help');
    expect(cnc).toContain('No Machine Control');
  });

  it('account menu button shows the signed-in state', async () => {
    const { AccountMenu } = await import('../src/account/AccountMenu');
    const noop = () => {};
    const props = {
      accent: 'emerald' as const,
      workNoun: 'circuits',
      sync: { summary: null, failed: false },
      signIn: { kind: 'popup' as const, start: async () => {} },
      onSignedIn: noop,
      onSignOut: noop,
      onOpenRemote: noop,
      onOpenHistory: noop,
      onOpenGuestList: noop,
    };
    expect(renderToStaticMarkup(<AccountMenu {...props} user={null} />)).toContain('Sign In / Early Access');
    const html = renderToStaticMarkup(<AccountMenu {...props} user={{ email: 'a@b.c', subscription_tier: 'active' }} />);
    expect(html).toContain('Account (a@b.c)');
    expect(html).toContain('bg-emerald-400');
  });

  it('Tekno Box picker asks a signed-out visitor to sign in', async () => {
    const { TeknoBoxPicker } = await import('../src/machine/TeknoBoxPicker');
    const api = { signedIn: false, list: async () => [], claim: async () => ({ deviceId: '' }), forget: async () => true };
    expect(renderToStaticMarkup(<TeknoBoxPicker api={api} value="" onChange={() => {}} />)).toContain('Sign in to reach a Tekno Box');
  });

  it('sync summary counts settings and saved work', async () => {
    const { syncSummaryText } = await import('../src/account/useAccountSession');
    expect(syncSummaryText(0, 0, 'scenes')).toBe('Account is up to date');
    expect(syncSummaryText(2, 1, 'scenes')).toBe('Restored 2 settings and synced 1 scene');
    expect(syncSummaryText(1, 0, 'designs')).toBe('Restored 1 setting');
  });
});
