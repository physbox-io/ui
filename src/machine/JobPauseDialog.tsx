import React from 'react';
import { PauseCircle, Layers, Minus, Play, Square } from 'lucide-react';
import { JogPad, type JogDelta } from './JogPad';

/**
 * Why the job is waiting.
 *
 * - `hold`: a feed hold — someone pressed Pause. The tool is stopped in the
 *   cut, and GRBL refuses to jog in Hold, so there is no pad.
 * - `material`: the program's own M0/M1 — swap or flip the stock.
 * - `parked`: the job let go of the program and lifted clear (Mesh's park).
 */
export type JobPauseKind = 'hold' | 'material' | 'parked';

export interface JobPauseDialogProps {
  machine: 'cnc' | 'laser';
  kind: JobPauseKind;
  /** What the program or controller said, if anything. */
  message?: string | null;
  /** Where the job is parked, for the header. */
  progress?: { line: number; total: number };
  /** Work position and jogging. Omit to leave out the pad. Never shown on a hold. */
  jog?: {
    position: { x: number; y: number; z: number };
    connected: boolean;
    onJog: (delta: JogDelta, feedRate: number) => unknown;
    onJogStop: () => unknown;
  };
  /** Why Resume would be refused right now, or null when it is ready. */
  resumeBlockedReason: string | null;
  /** e.g. "Resume next sheet". Defaults to "Resume job". */
  resumeLabel?: string;
  /** Locks the footer while something the dialog started is in flight. */
  busy?: boolean;
  onResume: () => unknown;
  onStop: () => unknown;
  /** Tucks the dialog away for this stop. Omit for no Hide button. */
  onHide?: () => void;
  /** App-specific content: a re-zero, a checkpoint note, an error. */
  children?: React.ReactNode;
  /** App-specific buttons, at the start of the footer. */
  footerExtra?: React.ReactNode;
}

const TITLE: Record<JobPauseKind, string> = {
  hold: 'Paused',
  material: 'Material change',
  parked: 'Job parked',
};

/**
 * Every stop that is not a tool change, as one dialog in all three apps.
 *
 * Etch used to show a banner, Volt and Mesh each their own modal — with Volt's
 * describing a bit change at a plain program stop. The tool change has its own
 * procedure and its own dialog (`ToolChangeDialog`); this is everything else,
 * in the same frame, so a paused job looks the same whichever app sent it.
 */
export const JobPauseDialog: React.FC<JobPauseDialogProps> = ({
  machine,
  kind,
  message,
  progress,
  jog,
  resumeBlockedReason,
  resumeLabel = 'Resume job',
  busy = false,
  onResume,
  onStop,
  onHide,
  children,
  footerExtra,
}) => {
  const laser = machine === 'laser';
  const Icon = kind === 'hold' ? PauseCircle : Layers;
  const explain =
    kind === 'hold'
      ? laser
        ? 'Feed hold: the head is stopped where it was and the beam is off. Resume carries on from exactly here.'
        : 'Feed hold: the tool is stopped where it was, still in the cut. Resume carries on from exactly here.'
      : kind === 'material'
        ? 'The program stopped so the stock can be swapped or turned. Do that, then resume.'
        : 'The job lifted clear and let go of the machine. Resume goes back to where it parked and carries on.';
  const showJog = jog && kind !== 'hold';

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-pause-title"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 dark:border-slate-700">
          <h3
            id="job-pause-title"
            className="font-bold text-slate-800 dark:text-slate-100 text-base flex items-center gap-2"
          >
            <Icon className="w-5 h-5 text-amber-500" />
            {TITLE[kind]}
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
          <div className="rounded-xl border p-3 space-y-1.5 border-slate-200 dark:border-slate-700/70 bg-slate-50 dark:bg-slate-800/40">
            {message && (
              <p className="text-[13px] leading-relaxed font-semibold text-slate-800 dark:text-slate-100">{message}</p>
            )}
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{explain}</p>
          </div>

          {showJog && (
            <div className="rounded-xl border p-3 space-y-2.5 border-slate-200 dark:border-slate-700/70 bg-slate-50 dark:bg-slate-800/40">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Jog</span>
                <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400">WPos </span>X {jog.position.x.toFixed(2)} Y{' '}
                  {jog.position.y.toFixed(2)} Z {jog.position.z.toFixed(2)}
                </span>
              </div>
              <JogPad
                onJog={jog.onJog}
                onStop={jog.onJogStop}
                connected={jog.connected}
                disabled={!jog.connected || busy}
                isLaser={laser}
              />
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                Move freely. Resuming lifts back to the job&rsquo;s own clear height before it goes on.
              </p>
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
            disabled={!!resumeBlockedReason || busy}
            title={resumeBlockedReason ?? 'Carry on with the job'}
            onClick={() => void onResume()}
            className="py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            {resumeLabel}
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

/** The kind for a machine status, or null when the status is not a non-tool pause. */
export function jobPauseKind(status: string): JobPauseKind | null {
  if (status === 'PAUSED_OPERATOR') return 'hold';
  if (status === 'PAUSED_MATERIAL') return 'material';
  if (status === 'PAUSED_PARKED') return 'parked';
  return null;
}
