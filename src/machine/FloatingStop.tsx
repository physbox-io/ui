import React from 'react';
import { createPortal } from 'react-dom';
import { Square } from 'lucide-react';
import type { StopKind } from './stopControl';

export interface FloatingStopProps {
  /** From `stopControl(state)`; nothing is drawn when null. */
  stop: StopKind | null;
  /** The job's stop: a soft reset that keeps the line reached, to run from. */
  onCancelJob: () => void;
  /** The machine's stop: a soft reset with no job on it. */
  onEStop: () => void;
}

/**
 * The one stop, above every dialog.
 *
 * Portalled to the body above the machine dialogs (z 100000): a modal's
 * backdrop covers the status bar, and a frame, a probe or a tool change is
 * started from a modal. At the window's bottom-right corner, in the strip
 * below them, so it never sits on a modal's own Start.
 *
 * With no job to stop, jog-cancel does not stop a G0 or a probe, so this is the
 * one way to halt it short of the power switch. With a job it is not a twin of
 * Pause: it is a soft reset, which ends the piece and loses the position, so it
 * is labelled and coloured as the E-Stop it is and set apart from Pause.
 */
export const FloatingStop: React.FC<FloatingStopProps> = ({ stop, onCancelJob, onEStop }) => {
  if (!stop) return null;
  const button = (
    <button
      type="button"
      onClick={stop === 'job' ? onCancelJob : onEStop}
      title={
        stop === 'job'
          ? 'E-Stop: soft reset. Stops the machine now and loses the position. The line it reached is kept, to run from after re-homing and re-zeroing.'
          : 'Soft reset: stops the machine now. If it was moving, the position is lost and it wants homing.'
      }
      className="fixed bottom-1 right-4 z-[100001] flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold shadow-lg cursor-pointer"
    >
      <Square className="w-3.5 h-3.5" />
      <span>{stop === 'job' ? 'E-Stop' : 'Stop machine'}</span>
    </button>
  );
  return typeof document === 'undefined' ? button : createPortal(button, document.body);
};
