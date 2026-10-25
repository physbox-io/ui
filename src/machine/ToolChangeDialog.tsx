import React, { useState } from 'react';
import { Wrench, Minus, Play, Square, ChevronsDown, Hand, Check, CircleAlert } from 'lucide-react';
import { NumberInput } from '../NumberInput';
import { JogPad, type JogDelta } from './JogPad';

export interface ZeroResult {
  success: boolean;
  message: string;
}

export interface ToolChangeZeroing {
  /** Whether work Z0 already describes the bit now in the spindle. */
  zeroed: boolean;
  /** Probe down onto a touch plate of known thickness. */
  plate?: {
    mm: number;
    onMmChange: (mm: number) => void;
    onProbe: (mm: number) => Promise<ZeroResult>;
  };
  /**
   * Probe the work itself — copper on a PCB blank, with the clip on it. The
   * label and hint say what is being touched.
   */
  surface?: {
    label: string;
    hint: string;
    onProbe: () => Promise<ZeroResult>;
  };
  /**
   * Take Z0 where the tip stands now. With `shimMm`, the tip was brought down
   * onto paper or a feeler of that thickness.
   */
  byHand?: {
    onZeroHere: (shimMm: number) => Promise<ZeroResult>;
    shimMm?: number;
    onShimMmChange?: (mm: number) => void;
  };
  /** The probe input, from the status report's `Pn:P`. */
  probeCircuit?: { active: boolean; seen: boolean };
  /** A line under the options, e.g. how well the last probe agreed with itself. */
  note?: React.ReactNode;
}

export interface ToolChangeDialogProps {
  machine: 'cnc' | 'laser';
  /** What the program asked for, e.g. "Tool change: fit T1 — 3.175 mm flat end mill". */
  message: string;
  /** Where the job is parked, for the header. */
  progress?: { line: number; total: number };
  /** Work position, for the readout under the pad. */
  position: { x: number; y: number; z: number };
  connected: boolean;
  onJog: (delta: JogDelta, feedRate: number) => unknown;
  onJogStop: () => unknown;
  /** Z touch-off. Omitted on a laser, which has no Z datum to re-take. */
  zero?: ToolChangeZeroing;
  /** Why Resume would be refused right now, or null when it is ready. */
  resumeBlockedReason: string | null;
  onResume: () => unknown;
  onStop: () => unknown;
  /** Tucks the dialog away for this stop. Omit for no Hide button. */
  onHide?: () => void;
  /** App-specific notes, shown above the footer. */
  children?: React.ReactNode;
  /** App-specific buttons, at the start of the footer. */
  footerExtra?: React.ReactNode;
}

/**
 * A tool change, as its own dialog.
 *
 * It used to be one line of a generic pause notice — or, in Etch, a banner that
 * sent the operator to another window to jog and re-zero, and back again to
 * resume. A tool change is the one stop with a fixed procedure: fit the bit,
 * bring it to the work, take Z from the new tip, carry on. All of it happens
 * here, in that order, and Resume stays greyed — with the reason on it — until
 * the Z datum describes the bit in the spindle, because two bits are never the
 * same length and the job would otherwise cut at the old one's depth.
 */
export const ToolChangeDialog: React.FC<ToolChangeDialogProps> = ({
  machine,
  message,
  progress,
  position,
  connected,
  onJog,
  onJogStop,
  zero,
  resumeBlockedReason,
  onResume,
  onStop,
  onHide,
  children,
  footerExtra,
}) => {
  const [busy, setBusy] = useState<'probe' | 'surface' | 'here' | null>(null);
  const [result, setResult] = useState<ZeroResult | null>(null);
  const laser = machine === 'laser';

  const run = async (kind: 'probe' | 'surface' | 'here', action: () => Promise<ZeroResult>) => {
    if (busy) return;
    setBusy(kind);
    setResult(null);
    try {
      setResult(await action());
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const card = 'rounded-xl border p-3 space-y-2.5';
  const todo = `${card} border-slate-200 dark:border-slate-700/70 bg-slate-50 dark:bg-slate-800/40`;
  const done = `${card} border-emerald-400/70 dark:border-emerald-600/60 bg-emerald-50 dark:bg-emerald-950/30`;
  const stepTitle = 'flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300';
  const stepNo =
    'flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold shrink-0';
  const doneMark = (
    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white shrink-0">
      <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
    </span>
  );
  const fieldLabel = 'block text-[10px] uppercase font-bold tracking-wide text-slate-400 dark:text-slate-500';
  const numInput =
    'w-20 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200';
  const actionBtn =
    'w-full py-2 px-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ' +
    'hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed ' +
    'text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg flex items-center justify-center ' +
    'gap-1.5 cursor-pointer transition-colors';

  const option = 'space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5';
  const optionCount = zero ? [zero.plate, zero.surface, zero.byHand].filter(Boolean).length : 0;
  const circuit = zero?.probeCircuit;
  // Probes stop only when the circuit closes; one that is not proved, or that
  // reads closed in the air, would drive the bit into the work.
  const canProbe = connected && !busy && !(circuit && (circuit.active || !circuit.seen));
  // A probe stops only when the circuit closes, so one nobody has proved is
  // refused by every app — say which state it is in before the button is pressed.
  const circuitNote = !circuit
    ? null
    : circuit.active
      ? { ok: false, text: 'The probe input reads closed now. Lift the bit clear before probing.' }
      : circuit.seen
        ? { ok: true, text: 'Probe circuit proved on this connection.' }
        : { ok: false, text: 'Clip the lead on and touch the bit to the plate or work once, to prove the circuit.' };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tool-change-title"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 dark:border-slate-700">
          <h3
            id="tool-change-title"
            className="font-bold text-slate-800 dark:text-slate-100 text-base flex items-center gap-2"
          >
            <Wrench className="w-5 h-5 text-amber-500" />
            Tool change
          </h3>
          <div className="flex items-center gap-2">
            {progress && (
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                line {progress.line.toLocaleString()} / {progress.total.toLocaleString()}
              </span>
            )}
            {onHide && (
              <button
                type="button"
                onClick={onHide}
                title="Tuck this away. The job stays paused."
                className="px-2 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <Minus className="w-4 h-4" />
                Hide
              </button>
            )}
          </div>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <div className={todo}>
            <span className={stepTitle}>
              <span className={stepNo}>1</span>
              {laser ? 'Swap the head' : 'Fit the new bit'}
            </span>
            <p className="text-[13px] leading-relaxed font-semibold text-slate-800 dark:text-slate-100">{message}</p>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {laser
                ? 'The beam is off. Change what needs changing, then set focus below.'
                : 'The spindle is stopped and the tool is lifted clear. Let it stop turning before you reach in.'}
            </p>
          </div>

          <div className={todo}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className={stepTitle}>
                <span className={stepNo}>2</span>
                {laser ? 'Jog to set focus' : 'Bring the tip down to the work'}
              </span>
              <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                <span className="text-slate-400">WPos </span>X {position.x.toFixed(2)} Y {position.y.toFixed(2)} Z{' '}
                {position.z.toFixed(2)}
              </span>
            </div>
            <JogPad onJog={onJog} onStop={onJogStop} connected={connected} disabled={!connected || !!busy} isLaser={laser} />
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Move freely. Resuming lifts back to the job&rsquo;s own clear height before it goes on.
            </p>
          </div>

          {zero && (
            <div className={zero.zeroed ? done : todo}>
              <span className={zero.zeroed ? `${stepTitle} !text-emerald-700 dark:!text-emerald-300` : stepTitle}>
                {zero.zeroed ? doneMark : <span className={stepNo}>3</span>}
                {zero.zeroed ? 'Z is zeroed on this bit' : 'Zero Z on the new bit'}
              </span>
              {!zero.zeroed && (
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  The new bit is a different length, so the old Z zero no longer says where its tip is.
                </p>
              )}
              <div className={`grid grid-cols-1 gap-2.5 ${optionCount > 1 ? 'sm:grid-cols-2' : ''} ${optionCount > 2 ? 'lg:grid-cols-3' : ''}`}>
                {zero.plate && (
                  <div className={option}>
                    <span className={fieldLabel}>Touch plate</span>
                    <label className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      Thickness
                      <NumberInput
                        min={0}
                        max={100}
                        step={0.1}
                        value={zero.plate.mm}
                        onChange={(v) => v !== undefined && zero.plate?.onMmChange(v)}
                        className={numInput}
                      />
                      mm
                    </label>
                    <button
                      type="button"
                      disabled={!canProbe}
                      onClick={() => run('probe', () => zero.plate!.onProbe(zero.plate!.mm))}
                      className={actionBtn}
                    >
                      <ChevronsDown className="w-3.5 h-3.5 text-amber-500" />
                      {busy === 'probe' ? 'Probing…' : 'Probe Z zero'}
                    </button>
                  </div>
                )}
                {zero.surface && (
                  <div className={option}>
                    <span className={fieldLabel}>{zero.surface.label}</span>
                    <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">{zero.surface.hint}</p>
                    <button
                      type="button"
                      disabled={!canProbe}
                      onClick={() => run('surface', () => zero.surface!.onProbe())}
                      className={actionBtn}
                    >
                      <ChevronsDown className="w-3.5 h-3.5 text-amber-500" />
                      {busy === 'surface' ? 'Probing…' : 'Probe Z zero'}
                    </button>
                  </div>
                )}
                {zero.byHand && (
                  <div className={option}>
                    <span className={fieldLabel}>By hand</span>
                    {zero.byHand.shimMm !== undefined && zero.byHand.onShimMmChange ? (
                      <label className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        Paper / shim
                        <NumberInput
                          min={0}
                          max={10}
                          step={0.01}
                          value={zero.byHand.shimMm}
                          onChange={(v) => v !== undefined && zero.byHand?.onShimMmChange?.(v)}
                          className={numInput}
                        />
                        mm
                      </label>
                    ) : (
                      <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                        Jog the tip down until it just touches the work.
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={!connected || !!busy}
                      onClick={() => run('here', () => zero.byHand!.onZeroHere(zero.byHand!.shimMm ?? 0))}
                      className={actionBtn}
                    >
                      <Hand className="w-3.5 h-3.5 text-emerald-500" />
                      {busy === 'here' ? 'Setting…' : 'Set Z zero here'}
                    </button>
                  </div>
                )}
              </div>
              {(zero.plate || zero.surface) && circuitNote && (
                <p
                  className={`text-[10px] leading-snug ${
                    circuitNote.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {circuitNote.text}
                </p>
              )}
              {zero.note}
              {result && (
                <p
                  className={`text-[11px] leading-snug flex items-start gap-1.5 ${
                    result.success ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {result.success ? (
                    <Check className="w-3.5 h-3.5 shrink-0 mt-px" />
                  ) : (
                    <CircleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
                  )}
                  {result.message}
                </p>
              )}
            </div>
          )}

          {children}
        </div>

        <div className="flex items-center justify-end gap-2 flex-wrap px-4 py-3 border-t border-slate-200 dark:border-slate-700">
          {footerExtra}
          <button
            type="button"
            onClick={() => void onStop()}
            title="Stop the job"
            className="py-2 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Square className="w-3.5 h-3.5" />
            Stop job
          </button>
          <button
            type="button"
            disabled={!!resumeBlockedReason || !!busy}
            title={resumeBlockedReason ?? 'Carry on with the job'}
            onClick={() => void onResume()}
            className="py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            Resume job
          </button>
        </div>
        {resumeBlockedReason && (
          <p className="px-4 pb-3 -mt-1 text-right text-[11px] text-amber-700 dark:text-amber-400">
            {resumeBlockedReason}
          </p>
        )}
      </div>
    </div>
  );
};
