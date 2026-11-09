/**
 * Which stop the operator needs, if any. React-free, so a machine manager or a
 * gate module can import it from `@physbox-io/ui/suite`.
 */

export type StopKind = 'job' | 'machine';

/** The fields every app's machine state has (machining's shared state). */
export interface StoppableState {
  connected: boolean;
  status: string;
  grblState?: string;
  spindleSpeed?: number;
  /** A lit laser guide spot reports an S word too, and has its own off. */
  guideSpot?: boolean;
}

/** The controller's words for something in motion or waiting to carry on. */
const BUSY_WORD = /^(Run|Jog|Home|Hold|Door)/;

/**
 * The job's stop from its first line until it ends, paused or not; the
 * machine's when it is moving with no job (a probe, a go-to-origin, homing, a
 * frame) or was left with a spindle on; otherwise none.
 */
export function stopControl(s: StoppableState): StopKind | null {
  if (!s.connected) return null;
  if (s.status === 'RUNNING' || s.status.startsWith('PAUSED')) return 'job';
  if (BUSY_WORD.test(s.grblState ?? '')) return 'machine';
  return (s.spindleSpeed ?? 0) > 0 && !s.guideSpot ? 'machine' : null;
}
