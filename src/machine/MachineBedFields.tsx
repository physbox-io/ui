import React from 'react';
import { NumberInput } from '../NumberInput';

export interface MachineBed {
  widthMm: number;
  depthMm: number;
  heightMm: number;
}

/**
 * The machine's working envelope, X × Y × Z, edited the same way in every app.
 * It is shared through the account, so the note under it says so.
 */
export const MachineBedFields: React.FC<{
  bed: MachineBed;
  onChange: (bed: MachineBed) => void;
  note?: React.ReactNode;
}> = ({ bed, onChange, note }) => {
  const field = (label: string, key: keyof MachineBed) => (
    <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
      {label}
      <NumberInput
        min={20}
        max={3000}
        value={bed[key]}
        onChange={(v) => v !== undefined && onChange({ ...bed, [key]: v })}
        className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-xs font-mono text-slate-800 dark:text-slate-200"
      />
    </label>
  );
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        {field('X mm', 'widthMm')}
        {field('Y mm', 'depthMm')}
        {field('Z mm', 'heightMm')}
      </div>
      {note && <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">{note}</p>}
    </div>
  );
};
