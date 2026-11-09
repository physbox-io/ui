import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FloatingStop } from '../src/machine/FloatingStop';
import { stopControl } from '../src/machine/stopControl';

const noop = () => {};

describe('stopControl', () => {
  const idle = { connected: true, status: 'IDLE', grblState: 'Idle', spindleSpeed: 0 };

  it('offers nothing when disconnected or at rest', () => {
    expect(stopControl({ ...idle, connected: false, status: 'RUNNING' })).toBeNull();
    expect(stopControl(idle)).toBeNull();
  });

  it('stops the job while one runs or is paused', () => {
    expect(stopControl({ ...idle, status: 'RUNNING' })).toBe('job');
    expect(stopControl({ ...idle, status: 'PAUSED_TOOL' })).toBe('job');
  });

  it('stops the machine when it moves with no job, or a spindle is left on', () => {
    for (const grblState of ['Run', 'Jog', 'Home', 'Hold:0', 'Door:1']) {
      expect(stopControl({ ...idle, grblState })).toBe('machine');
    }
    expect(stopControl({ ...idle, spindleSpeed: 12000 })).toBe('machine');
    expect(stopControl({ connected: true, status: 'IDLE' })).toBeNull();
  });

  it('leaves a lit guide spot to its own off', () => {
    expect(stopControl({ ...idle, spindleSpeed: 10, guideSpot: true })).toBeNull();
  });
});

describe('FloatingStop', () => {
  it('draws nothing with no stop', () => {
    expect(renderToStaticMarkup(<FloatingStop stop={null} onCancelJob={noop} onEStop={noop} />)).toBe('');
  });

  it('is the E-Stop during a job and Stop machine otherwise, above the dialogs', () => {
    const job = renderToStaticMarkup(<FloatingStop stop="job" onCancelJob={noop} onEStop={noop} />);
    expect(job).toContain('E-Stop');
    expect(job).toContain('z-[100001]');
    const machine = renderToStaticMarkup(<FloatingStop stop="machine" onCancelJob={noop} onEStop={noop} />);
    expect(machine).toContain('Stop machine');
  });
});
