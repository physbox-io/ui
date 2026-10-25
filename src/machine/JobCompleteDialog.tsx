import React, { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';

/** "1h 04m", "12m 30s", "45s". */
export function formatJobDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(r).padStart(2, '0')}s`;
  return `${r}s`;
}

export interface CompletedJobSummary {
  /** Distinguishes one finish from the next, so a dismissal does not hide the next. */
  finishedAt: number;
  elapsedSeconds: number;
  estimatedSeconds?: number | null;
  totalLines: number;
  jobName?: string;
}

export interface JobCompleteDialogProps {
  job: CompletedJobSummary;
  machine: 'cnc' | 'laser';
  onClose: () => void;
}

/**
 * The job ran to its last line.
 *
 * A finish used to be a status flipping quietly from running to idle, which on
 * a job that has been cutting for an hour, watched from across the workshop,
 * is the one moment nobody is looking at the status bar. Apps show this only
 * for a job that really reached its final acknowledged line — an E-stop, an
 * alarm or a dropped connection never raise it.
 */
export const JobCompleteDialog: React.FC<JobCompleteDialogProps> = ({ job, machine, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-complete-title"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center gap-3 p-6">
          <CheckCircle2 className="w-14 h-14 text-emerald-500" />
          <h3 id="job-complete-title" className="font-bold text-slate-800 dark:text-slate-100 text-lg">
            Job complete
          </h3>
          {job.jobName && (
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 break-words">{job.jobName}</p>
          )}
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Ran to the end in{' '}
            <span className="font-mono font-semibold tabular-nums">{formatJobDuration(job.elapsedSeconds)}</span>
            {job.estimatedSeconds != null && (
              <span className="text-slate-400"> (estimated {formatJobDuration(job.estimatedSeconds)})</span>
            )}
            , {job.totalLines.toLocaleString()} lines.
          </p>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {machine === 'laser'
              ? 'Let the extraction clear the smoke before you open the lid, then lift the work out.'
              : 'Let the spindle stop before reaching in, then clear the chips and unclamp the work.'}
          </p>
        </div>
        <div className="flex justify-center p-4 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm rounded-lg cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
