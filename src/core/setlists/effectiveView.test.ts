import { describe, expect, it } from 'vitest';
import { effectiveViewState } from './effectiveView';
import { defaultViewState } from '../storage/viewStateRepository';

describe('effectiveViewState', () => {
  const view = { ...defaultViewState('s1'), selectedParts: ['P1'], zoom: 1.3, lastPage: 4 };

  it('returns the score view state without override', () => {
    expect(effectiveViewState(view)).toBe(view);
  });

  it('lets the override win only for its own keys', () => {
    const r = effectiveViewState(view, { selectedParts: ['P2', 'P3'], transposeSemitones: 2 });
    expect(r).toMatchObject({ selectedParts: ['P2', 'P3'], transposeSemitones: 2, zoom: 1.3, lastPage: 4, concertPitch: false });
    expect(view.selectedParts).toEqual(['P1']);
  });

  it('ignores undefined override values', () => {
    expect(effectiveViewState(view, { selectedParts: undefined }).selectedParts).toEqual(['P1']);
  });
});
