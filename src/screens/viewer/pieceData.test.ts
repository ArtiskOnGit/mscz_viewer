import { describe, expect, it } from 'vitest';
import { layoutStep, type RequestedLayout } from './pieceData';
import type { ViewportOptions } from '../../core/render/renderService';

const A: ViewportOptions = { width: 393, height: 600, scale: 24, transpose: '', concertPitch: false };
const B: ViewportOptions = { ...A, height: 680 }; // Safari toolbar collapsed, rotation, zoom…

describe('layoutStep', () => {
  it('loads new content, relayouts a new geometry, does nothing when already shown', () => {
    expect(layoutStep({ content: undefined, viewport: undefined, applied: false }, 'c', A)).toBe('load');
    expect(layoutStep({ content: 'c', viewport: A, applied: true }, 'c2', A)).toBe('load');
    expect(layoutStep({ content: 'c', viewport: A, applied: true }, 'c', B)).toBe('relayout');
    expect(layoutStep({ content: 'c', viewport: A, applied: true }, 'c', { ...A })).toBe('none');
    // Preloaded renderer (setlists) or a run cancelled after asking: wait for that layout.
    expect(layoutStep({ content: 'c', viewport: A, applied: false }, 'c', A)).toBe('wait');
  });

  it('A → B → A before B is laid out: A is laid out again (the renderer is at B)', () => {
    let last: RequestedLayout = { content: 'c', viewport: A, applied: true };
    expect(layoutStep(last, 'c', B)).toBe('relayout');
    last = { content: 'c', viewport: B, applied: false }; // asked, cancelled before done
    expect(layoutStep(last, 'c', A)).toBe('relayout');
  });
});
