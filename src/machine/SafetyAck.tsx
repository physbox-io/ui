import React, { useCallback, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * The warning shown once per app before its first machine connection.
 *
 * Each app asks for itself, under its own key: acknowledging in Etch says
 * nothing about having read it in Mesh.
 */

export interface SafetyAckDialogProps {
  laser?: boolean;
  /** Opens the app's own license page; without it the dialog says where to find it. */
  onOpenLicense?: () => void;
  onAcknowledge: () => void;
  onDecline: () => void;
}

export function SafetyAckDialog({ laser, onOpenLicense, onAcknowledge, onDecline }: SafetyAckDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="physbox-safety-title"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 id="physbox-safety-title" className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Before you connect a machine
          </h3>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          This connects to a real machine that moves and cuts under its own power. Keep clear of moving
          parts, wear eye protection{laser ? ' rated for the beam' : ''}, and never leave a running job
          unattended. Use your own judgment. You are responsible for the machine&apos;s safe operation.
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          Provided with no warranty and no liability for injury, loss, or damage of any kind. Full terms:{' '}
          {onOpenLicense ? (
            <button
              type="button"
              onClick={onOpenLicense}
              className="underline hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer"
            >
              PhysBox Permissive Public License (PPPL-1.0)
            </button>
          ) : (
            <>PhysBox Permissive Public License (PPPL-1.0), under License &amp; Disclaimers in this app&apos;s Help</>
          )}
          .
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onDecline}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            No Machine Control
          </button>
          <button
            type="button"
            onClick={onAcknowledge}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg cursor-pointer"
          >
            Acknowledged
          </button>
        </div>
      </div>
    </div>
  );
}

export function hasSafetyAck(storageKey: string): boolean {
  try {
    return Boolean(localStorage.getItem(storageKey));
  } catch {
    return false;
  }
}

export interface SafetyGate {
  /** Resolves true at once if already acknowledged, else after the dialog answers. */
  request(): Promise<boolean>;
  /** The dialog, or null; render it anywhere. */
  dialog: React.ReactElement | null;
}

/**
 * The gate in front of an app's first connect. `storageKey` is the app's own,
 * so each app shows the warning once.
 */
export function useSafetyGate(
  storageKey: string,
  options: { laser?: boolean; onOpenLicense?: () => void } = {}
): SafetyGate {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ack: boolean) => void) | null>(null);

  const settle = useCallback((ack: boolean) => {
    setOpen(false);
    resolver.current?.(ack);
    resolver.current = null;
  }, []);

  const request = useCallback((): Promise<boolean> => {
    if (hasSafetyAck(storageKey)) return Promise.resolve(true);
    resolver.current?.(false);
    setOpen(true);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, [storageKey]);

  const { laser, onOpenLicense } = options;
  const dialog = open ? (
    <SafetyAckDialog
      laser={laser}
      onOpenLicense={
        onOpenLicense
          ? () => {
              settle(false);
              onOpenLicense();
            }
          : undefined
      }
      onDecline={() => settle(false)}
      onAcknowledge={() => {
        try {
          localStorage.setItem(storageKey, '1');
        } catch {
          // Private window: acknowledged for this visit.
        }
        settle(true);
      }}
    />
  ) : null;

  return { request, dialog };
}
