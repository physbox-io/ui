import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Link2, RefreshCw, Unlink } from 'lucide-react';

/**
 * Choosing a Tekno Box, and claiming one that has not been claimed yet.
 *
 * Every app carries the whole flow, not just the picker: somebody may only
 * ever open Etch, and sending them to another app to claim the box on their
 * own bench is a dead end. The account calls come from the app's apiClient.
 */

export interface TeknoBoxDevice {
  deviceId: string;
  name: string;
  online: boolean;
}

export interface TeknoBoxApi {
  signedIn: boolean;
  list(): Promise<TeknoBoxDevice[]>;
  claim(code: string): Promise<{ deviceId: string }>;
  forget(deviceId: string): Promise<boolean>;
}

export interface TeknoBoxPickerProps {
  api: TeknoBoxApi;
  /** Currently selected device id, or '' for none. */
  value: string;
  onChange: (deviceId: string, name?: string) => void;
  /** Locked while a machine is connected. */
  disabled?: boolean;
  /** Called once a machine has just been claimed, so the app can connect to it. */
  onPaired?: (deviceId: string) => void;
  /** Tailwind classes for the primary action, in the app's palette. */
  accentClass?: string;
}

function UnpairConfirm({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const modal = (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100000] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Unpair ${name}?`}
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h2 className="font-bold text-slate-800 dark:text-slate-100 text-base">Unpair {name}?</h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          It will stop being reachable from your apps, and pairing it again means reading a new code off
          the machine&apos;s own screen.
        </p>
        <div className="flex justify-end gap-2 text-xs">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg font-bold bg-red-500 hover:bg-red-600 text-white cursor-pointer"
          >
            Unpair machine
          </button>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
}

export function TeknoBoxPicker({
  api,
  value,
  onChange,
  disabled = false,
  onPaired,
  accentClass = 'bg-blue-500 hover:bg-blue-600 text-slate-950',
}: TeknoBoxPickerProps) {
  const [devices, setDevices] = useState<TeknoBoxDevice[]>([]);
  const [pairCode, setPairCode] = useState('');
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmUnpair, setConfirmUnpair] = useState<TeknoBoxDevice | null>(null);
  const { signedIn } = api;

  /** Keeps the current pick if it still exists, else something switched on, else the first. */
  const settle = useCallback(
    (list: TeknoBoxDevice[], current: string) => {
      const keep = current && list.some((d) => d.deviceId === current);
      const chosen = keep ? current : list.find((d) => d.online)?.deviceId ?? list[0]?.deviceId ?? '';
      if (chosen !== current) onChange(chosen, list.find((d) => d.deviceId === chosen)?.name);
      return chosen;
    },
    [onChange]
  );

  const load = useCallback(async () => {
    if (!signedIn) return;
    setLoading(true);
    try {
      const list = await api.list();
      setDevices(list);
      settle(list, value);
    } finally {
      setLoading(false);
    }
    // `value` is read, not depended on: depending on it would reload the list on every pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, settle, api]);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void api.list().then((list) => {
      if (!live) return;
      setDevices(list);
      settle(list, value);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const handleForget = async (device: TeknoBoxDevice) => {
    setError(null);
    if (!(await api.forget(device.deviceId))) {
      setError('Could not unpair that machine. Try again in a moment.');
      return;
    }
    const list = await api.list();
    setDevices(list);
    settle(list, '');
  };

  const handlePair = async () => {
    const code = pairCode.trim().toUpperCase();
    if (!code) return;
    setPairing(true);
    setError(null);
    try {
      const { deviceId } = await api.claim(code);
      setPairCode('');
      const list = await api.list();
      setDevices(list);
      onChange(deviceId, list.find((d) => d.deviceId === deviceId)?.name);
      onPaired?.(deviceId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not pair that machine.');
    } finally {
      setPairing(false);
    }
  };

  if (!signedIn) {
    return (
      <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
        Sign in to reach a Tekno Box over the internet. The connection is made through your account.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {confirmUnpair && (
        <UnpairConfirm
          name={confirmUnpair.name}
          onCancel={() => setConfirmUnpair(null)}
          onConfirm={() => {
            const dev = confirmUnpair;
            setConfirmUnpair(null);
            void handleForget(dev);
          }}
        />
      )}
      {devices.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value, devices.find((d) => d.deviceId === e.target.value)?.name)}
            className="flex-1 min-w-[11rem] px-2 py-1 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 disabled:opacity-40 cursor-pointer"
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.name} {d.online ? '(online)' : '(offline)'}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            title="Check again which machines are online"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => {
              const device = devices.find((d) => d.deviceId === value);
              if (device) setConfirmUnpair(device);
            }}
            disabled={disabled || !value}
            title="Unpair this machine from your account"
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
          >
            <Unlink className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">No Tekno Box paired to this account yet.</p>
      )}

      <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
        <strong>On the Tekno Box:</strong> tap through to page 2 of the menu, open <strong>MACHINE CTRL</strong>,
        and it shows a six-character code. Type that in here.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="w-3.5 h-3.5 text-slate-400" />
        <input
          value={pairCode}
          onChange={(e) => setPairCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handlePair();
          }}
          placeholder="Code from MACHINE CTRL"
          maxLength={8}
          spellCheck={false}
          aria-label="Pairing code"
          className="flex-1 min-w-[10rem] px-2 py-1 text-xs font-mono tracking-widest uppercase rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={() => void handlePair()}
          disabled={!pairCode.trim() || pairing}
          className={`px-3 py-1 rounded-lg text-xs font-bold disabled:opacity-40 cursor-pointer ${accentClass}`}
        >
          {pairing ? 'Pairing…' : 'Pair'}
        </button>
      </div>

      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}

      <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
        The machine connects out to physbox itself, so this works from anywhere and needs nothing opened on
        your router. A job sent this way is cut by the machine on its own, so you can close this page and the
        cut carries on.
      </p>
    </div>
  );
}
