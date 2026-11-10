import React from 'react';
import { Radio } from 'lucide-react';

/**
 * A job another tab or machine is streaming right now, as its checkpoint last
 * said. Mirrors `RemoteJob` in `@physbox-io/machining`, so this package does
 * not depend on that one.
 */
export interface RemoteJobLike {
  jobName: string | null;
  fromLine: number;
  totalLines: number;
  /** When its tab last wrote. */
  at: number;
  where: 'tab' | 'device';
}

export interface RemoteJobChipProps {
  /** The checkpoint store's `subscribeRemoteJob`. */
  subscribe: (fn: (job: RemoteJobLike | null) => void) => () => void;
  /**
   * Looks again: the machine's `restoreInterruptedJob`. When the job finishes
   * the chip goes; when its tab stops writing (the laptop shut mid-job) the
   * next look finds it abandoned and offers it here as a stopped job.
   */
  recheck: () => void;
  /** How often to look again while showing. */
  recheckMs?: number;
}

/**
 * A job is being cut from another tab or another computer.
 *
 * Without it, opening the app on a second computer while the first one cut
 * showed nothing at all: the checkpoint lookup rightly does not offer a job
 * whose own tab wrote recently, and nothing said why. For the status bar.
 */
export const RemoteJobChip: React.FC<RemoteJobChipProps> = ({ subscribe, recheck, recheckMs = 30_000 }) => {
  const [job, setJob] = React.useState<RemoteJobLike | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => subscribe(setJob), [subscribe]);

  React.useEffect(() => {
    if (!job) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      recheck();
    }, recheckMs);
    return () => clearInterval(timer);
  }, [job, recheck, recheckMs]);

  if (!job) return null;

  const ago = Math.max(0, Math.round((now - job.at) / 1000));
  const heard = ago < 60 ? `${ago} s ago` : `${Math.round(ago / 60)} min ago`;
  const where = job.where === 'tab' ? 'another tab' : 'another device';

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/40 text-sky-700 dark:text-sky-300 text-[11px]"
      title={`${job.jobName || 'A job'} is streaming from ${where}. Control it there.`}
    >
      <Radio className="w-3.5 h-3.5" />
      <span className="font-semibold">Job running on {where}</span>
      <span className="text-sky-600/80 dark:text-sky-400/80">
        line {job.fromLine}/{job.totalLines} · heard {heard}
      </span>
    </div>
  );
};
