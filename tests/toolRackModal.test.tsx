import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToolRackModal, rackLabel, type RackPresetLike, type RackToolLike, type ToolRackModalProps } from '../src/machine/ToolRackModal';

const tools: RackToolLike[] = [
  { uid: 'v', toolNumber: 3, name: '60° V-bit', shape: 'vbit', diameterMm: 0.2, tipAngleDeg: 60, available: true },
  {
    uid: 'a', toolNumber: 1, name: '1/8 flat', shape: 'flat', diameterMm: 3.175, flutes: 2,
    bestFor: ['cut'], guidance: 'Through-cuts.', available: true,
  },
  { uid: 'r', toolNumber: 7, name: 'Old drill', shape: 'drill', diameterMm: 0.8, available: false },
];

const presets: RackPresetLike[] = [
  { category: 'End Mills', label: '1/8" Flat', tool: { name: '1/8 flat', shape: 'flat', diameterMm: 3.175 } },
  { category: 'V-Bits', label: '60° V', tool: { name: '60° V', shape: 'vbit', diameterMm: 0.2, tipAngleDeg: 60 } },
];

const noop = () => {};
const render = (props: Partial<ToolRackModalProps<RackToolLike>> = {}) =>
  renderToStaticMarkup(
    <ToolRackModal open onClose={noop} tools={tools} onChange={noop} onReset={noop} presets={presets} {...props} />
  ).replace(/<!-- -->/g, '');

describe('ToolRackModal', () => {
  it('renders nothing while closed', () => {
    expect(render({ open: false })).toBe('');
  });

  it('lists every slot in T order, retired ones dimmed but still there', () => {
    const html = render();
    const slot = (n: number) => html.indexOf(`>T${n}</span>`);
    expect(slot(1)).toBeGreaterThan(-1);
    expect(slot(1)).toBeLessThan(slot(3));
    expect(slot(3)).toBeLessThan(slot(7));
    expect(html).toContain('Old drill');
    expect(html).toContain('retired');
    expect(html).toContain('opacity-50');
    expect(html.match(/Have it/g)).toHaveLength(3);
    expect(html).toContain('Tool rack T1–T7');
  });

  it('opens on the lowest slot and previews its kerf', () => {
    const html = render();
    expect(html).toContain('Configure Tool T1 — 1/8 flat');
    expect(html).toContain('3.17 mm');
    expect(html).toContain('Straight Cutter: constant 3.175 mm kerf width');
  });

  it('shows a V-bit widening with depth and the engaged width feeds will assume', () => {
    const html = render({ tools: tools.filter((t) => t.uid !== 'a') });
    // 0.2 + 2·1·tan(30°)
    expect(html).toContain('1.35 mm');
    expect(html).toContain('Tapered V-Bit');
    // 0.2 + 2·1.5·tan(30°)
    expect(html).toContain('Auto — 1.93 mm');
  });

  it('says what a blank limit falls back to', () => {
    const html = render({
      cuttingDefaults: () => ({ flutes: 2, maxStepdownRatio: 1, maxStepoverRatio: 0.45, maxPlungeRate: 400 }),
      tools: [{ uid: 'x', toolNumber: 1, name: 'Bare', shape: 'flat', diameterMm: 3, available: true }],
    });
    expect(html).toContain('Auto — 400');
    expect(html).toContain('400 mm/min Plunge');
  });

  it('asks what a tool is for only when the app has words for it', () => {
    expect(render()).not.toContain('Best Suited For');
    const html = render({ uses: [{ id: 'cut', label: 'Cut' }, { id: 'etch', label: 'Etch' }] });
    expect(html).toContain('Best Suited For');
    expect(html).toMatch(/checked=""[^>]*\/?>\s*<span>Cut<\/span>/);
  });

  it('carries the note and warns when the rack did not reach storage', () => {
    const html = render({ note: 'Shared with Etch, Volt and Mesh', unsaved: true });
    expect(html).toContain('Shared with Etch, Volt and Mesh');
    expect(html).toContain('could not be saved to browser storage');
    expect(render()).not.toContain('could not be saved');
  });

  it('offers the presets and a way back to the defaults', () => {
    const html = render();
    expect(html).toContain('Populate from Preset...');
    expect(html).toContain('Reset All to Defaults');
    expect(html).toContain('Add Tool Slot');
  });
});

describe('rackLabel', () => {
  it('names the span the rack actually covers', () => {
    expect(rackLabel([])).toBe('No tools');
    expect(rackLabel([{ toolNumber: 4 }])).toBe('Tool rack T4');
    expect(rackLabel([{ toolNumber: 9 }, { toolNumber: 2 }])).toBe('Tool rack T2–T9');
  });
});
