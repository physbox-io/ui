import React, { useState } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ChevronsUp, ChevronsDown, Octagon } from 'lucide-react';
import { NumberInput } from '../NumberInput';

export interface JogDelta {
  x: number;
  y: number;
  z: number;
}

export interface JogPadProps {
  /** Sends one jog. A rejection is the app's to report; it is caught here. */
  onJog: (delta: JogDelta, feedRate: number) => unknown;
  /** Stops a jog in progress (GRBL's jog cancel). */
  onStop: () => unknown;
  /** Disables the moves. The stop button stays live while `connected`. */
  disabled?: boolean;
  connected: boolean;
  /** A laser's Z sets focus, and is labelled for it. */
  isLaser?: boolean;
}

/**
 * Driving the machine by hand: XY on the left cluster, Z on its own column, as
 * on a pendant, with a coarse/medium/fine step ladder so the last approach to
 * the work is a tenth at a time.
 *
 * Etch, Volt and Mesh each grew one, and each tool-change prompt told the
 * operator to bring the new bit down to the work from a window that had no pad
 * in it. One pad, driven by callbacks, so it can sit wherever it is needed.
 */
export const JogPad: React.FC<JogPadProps> = ({ onJog, onStop, disabled = false, connected, isLaser = false }) => {
  const [step, setStep] = useState(1);
  const [feedRate, setFeedRate] = useState(1000);

  const jog = (x: number, y: number, z: number) => {
    try {
      const sent = onJog({ x: x * step, y: y * step, z: z * step }, feedRate);
      if (sent instanceof Promise) sent.catch(() => {});
    } catch {
      // Refusals are reported by the app (an alarm, a job holding the machine).
    }
  };

  const jogBtn =
    'flex items-center justify-center h-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 ' +
    'dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 ' +
    'disabled:cursor-not-allowed text-slate-700 dark:text-slate-200 transition-colors cursor-pointer';
  const fieldLabel = 'block text-[10px] uppercase font-bold tracking-wide text-slate-400 dark:text-slate-500';

  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
      <div className="flex items-start gap-3">
        <div className="grid grid-cols-3 gap-1.5 w-[144px]">
          <span />
          <button type="button" disabled={disabled} onClick={() => jog(0, 1, 0)} title={`Y +${step} mm`} className={jogBtn}>
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <span />
          <button type="button" disabled={disabled} onClick={() => jog(-1, 0, 0)} title={`X -${step} mm`} className={jogBtn}>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!connected}
            onClick={() => void onStop()}
            title="Stop the current jog"
            className={`${jogBtn} text-red-500`}
          >
            <Octagon className="w-3.5 h-3.5" />
          </button>
          <button type="button" disabled={disabled} onClick={() => jog(1, 0, 0)} title={`X +${step} mm`} className={jogBtn}>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <span />
          <button type="button" disabled={disabled} onClick={() => jog(0, -1, 0)} title={`Y -${step} mm`} className={jogBtn}>
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <span />
        </div>

        {/* Z stays on a laser — a diode head still focuses by height — but it
            is labelled for what it does there. */}
        <div className="grid grid-cols-1 gap-1.5 w-11">
          <button
            type="button"
            disabled={disabled}
            onClick={() => jog(0, 0, 1)}
            title={isLaser ? `Raise head ${step} mm` : `Z +${step} mm`}
            className={jogBtn}
          >
            <ChevronsUp className="w-3.5 h-3.5" />
          </button>
          <span className="text-[9px] text-center text-slate-400 dark:text-slate-500 font-bold leading-9">
            {isLaser ? 'FOC' : 'Z'}
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => jog(0, 0, -1)}
            title={isLaser ? `Lower head ${step} mm` : `Z -${step} mm`}
            className={jogBtn}
          >
            <ChevronsDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-2 pt-0.5 flex-1 min-w-[12rem] max-w-xs">
        <div>
          <span className={`${fieldLabel} mb-1`}>Jog step (mm)</span>
          <div className="flex gap-1.5">
            {[0.1, 1, 10].map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setStep(s)}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                  step === s
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={`${fieldLabel} mb-1`}>Feed rate</span>
          <div className="flex items-center gap-2">
            <NumberInput
              min={10}
              max={5000}
              step={50}
              integer
              value={feedRate}
              onChange={(v) => setFeedRate(v ?? 1000)}
              className="flex-1 min-w-0 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200"
            />
            <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">mm/min</span>
          </div>
        </div>
      </div>
    </div>
  );
};
