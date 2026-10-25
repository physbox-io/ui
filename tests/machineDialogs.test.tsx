import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToolChangeDialog, type ToolChangeDialogProps } from '../src/machine/ToolChangeDialog';
import { JobCompleteDialog, formatJobDuration } from '../src/machine/JobCompleteDialog';

const noop = () => {};
const ok = async () => ({ success: true, message: 'ok' });

const base: ToolChangeDialogProps = {
  machine: 'cnc',
  message: 'Tool change: fit T1 — 3.175 mm flat end mill',
  progress: { line: 990, total: 3123 },
  position: { x: 1, y: 2, z: 3 },
  connected: true,
  onJog: noop,
  onJogStop: noop,
  zero: {
    zeroed: false,
    plate: { mm: 13, onMmChange: noop, onProbe: ok },
    byHand: { onZeroHere: ok, shimMm: 0.1, onShimMmChange: noop },
    probeCircuit: { active: false, seen: true },
  },
  resumeBlockedReason: 'Re-zero Z before resuming.',
  onResume: noop,
  onStop: noop,
};

const render = (props: Partial<ToolChangeDialogProps> = {}) =>
  renderToStaticMarkup(<ToolChangeDialog {...base} {...props} />);

/** The Resume button's opening tag. */
const resumeTag = (html: string) => {
  const end = html.indexOf('Resume job');
  return html.slice(html.lastIndexOf('<button', end), end);
};

describe('ToolChangeDialog', () => {
  it('holds Resume, with the reason on it, until Z describes the new bit', () => {
    const html = render();
    expect(resumeTag(html)).toContain('disabled=""');
    expect(html).toContain('Re-zero Z before resuming.');
    expect(html).toContain('Zero Z on the new bit');
  });

  it('lets the job go on once the datum is retaken', () => {
    const html = render({ resumeBlockedReason: null, zero: { ...base.zero!, zeroed: true } });
    expect(resumeTag(html)).not.toContain('disabled=""');
    expect(html).toContain('Z is zeroed on this bit');
  });

  it('offers both ways to take Z, and a pad to get there', () => {
    const html = render();
    expect(html).toContain('Probe Z zero');
    expect(html).toContain('Set Z zero here');
    expect(html).toContain('Paper / shim');
    expect(html).toContain('X +1 mm');
    expect(html).toContain('Z -1 mm');
  });

  it('will not offer a probe on a circuit nobody has proved', () => {
    const html = render({ zero: { ...base.zero!, probeCircuit: { active: false, seen: false } } });
    const probe = html.slice(html.lastIndexOf('<button', html.indexOf('Probe Z zero')), html.indexOf('Probe Z zero'));
    expect(probe).toContain('disabled=""');
    expect(html).toContain('touch the bit to the plate or work once');
  });

  it('offers a probe on the work itself where the work conducts', () => {
    const html = render({
      zero: {
        zeroed: false,
        surface: { label: 'On the copper', hint: 'Clip on the board.', onProbe: ok },
        probeCircuit: { active: false, seen: true },
      },
    });
    expect(html).toContain('On the copper');
    expect(html).not.toContain('Set Z zero here');
  });

  it('asks a laser to set focus, not to zero Z', () => {
    const html = render({ machine: 'laser', zero: undefined, resumeBlockedReason: null });
    expect(html).not.toContain('Probe Z zero');
    expect(html).toContain('Jog to set focus');
    expect(html).toContain('Raise head');
  });
});

describe('JobCompleteDialog', () => {
  it('says how long it took and how much ran', () => {
    const html = renderToStaticMarkup(
      <JobCompleteDialog
        job={{ finishedAt: 1, elapsedSeconds: 754, estimatedSeconds: 700, totalLines: 3123, jobName: 'Rheo cell' }}
        machine="cnc"
        onClose={noop}
      />
    );
    expect(html).toContain('Job complete');
    expect(html).toContain('12m 34s');
    expect(html).toContain('3,123 lines');
    expect(html).toContain('Rheo cell');
  });

  it('formats durations the way a person reads them', () => {
    expect(formatJobDuration(45)).toBe('45s');
    expect(formatJobDuration(3840)).toBe('1h 04m');
  });
});
