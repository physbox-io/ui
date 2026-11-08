import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JobPauseDialog, JobWaitingButton, jobPauseKind, type JobPauseDialogProps, type JobWaitingButtonProps } from '../src/machine/JobPauseDialog';
import { createJobPauseVisibility, jobStopKey } from '../src/machine/jobPauseVisibility';

const noop = () => {};
const base: JobPauseDialogProps = {
  machine: 'cnc',
  kind: 'material',
  message: 'Flip the board',
  progress: { line: 1200, total: 3000 },
  jog: { position: { x: 0, y: 0, z: 5 }, connected: true, onJog: noop, onJogStop: noop },
  resumeBlockedReason: null,
  onResume: noop,
  onStop: noop,
};
const render = (p: Partial<JobPauseDialogProps> = {}) => renderToStaticMarkup(<JobPauseDialog {...base} {...p} />);
const resumeTag = (html: string, label = 'Resume job') => {
  const end = html.indexOf(label);
  return html.slice(html.lastIndexOf('<button', end), end);
};

describe('JobPauseDialog', () => {
  it('names the stop and says what to do, with no tool-change talk', () => {
    const html = render();
    expect(html).toContain('Material change');
    expect(html).toContain('Flip the board');
    expect(html).not.toMatch(/bit|tool change/i);
  });

  it('offers the jog pad at a program stop but never on a feed hold', () => {
    expect(render()).toContain('WPos');
    const hold = render({ kind: 'hold' });
    expect(hold).toContain('Paused');
    expect(hold).not.toContain('WPos');
  });

  it('holds Resume with the reason, and frees it when ready', () => {
    const blocked = render({ resumeBlockedReason: 'Zero Z first.' });
    expect(resumeTag(blocked)).toContain('disabled=""');
    expect(blocked).toContain('Zero Z first.');
    expect(resumeTag(render())).not.toContain('disabled=""');
  });

  it('takes a resume label and app content', () => {
    const html = render({ resumeLabel: 'Resume next sheet', children: <p>checkpointed</p> });
    expect(html).toContain('Resume next sheet');
    expect(html).toContain('checkpointed');
  });

  it('maps statuses to kinds, and a tool change to none', () => {
    expect(jobPauseKind('PAUSED_OPERATOR')).toBe('hold');
    expect(jobPauseKind('PAUSED_MATERIAL')).toBe('material');
    expect(jobPauseKind('PAUSED_PARKED')).toBe('parked');
    expect(jobPauseKind('PAUSED_TOOL')).toBeNull();
    expect(jobPauseKind('RUNNING')).toBeNull();
  });
});

describe('JobWaitingButton', () => {
  const html = (p: Partial<JobWaitingButtonProps>) =>
    renderToStaticMarkup(<JobWaitingButton kind="tool" onOpen={() => {}} {...p} />);
  it('says what is waiting', () => {
    expect(html({ needsZero: true })).toContain('Tool change: zero Z');
    expect(html({})).toContain('Tool change: resume');
    expect(html({ kind: 'hold' })).toContain('Paused: resume');
    expect(html({ kind: 'material' })).toContain('Material change');
  });
});

describe('createJobPauseVisibility', () => {
  it('hides one stop, and a new stop is not hidden', () => {
    const v = createJobPauseVisibility();
    const tool = jobStopKey('PAUSED_TOOL', 990, 'Fit T2');
    v.hide(tool);
    expect(v.hiddenKey()).toBe(tool);
    expect(jobStopKey('PAUSED_TOOL', 2100, 'Fit T3')).not.toBe(tool);
    v.show();
    expect(v.hiddenKey()).toBeNull();
  });
});
