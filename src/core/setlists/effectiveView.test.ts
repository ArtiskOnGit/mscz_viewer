import { describe, expect, it } from 'vitest';
import { effectiveViewState, hasTransposeOverride, transposeBadgeValue, transposeOverride } from './effectiveView';
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

describe('transposeOverride', () => {
  const base = { transposeSemitones: 0, transposeOctave: 0, concertPitch: false };

  it('stores a transposition different from the score', () => {
    expect(transposeOverride({ ...base, transposeSemitones: 2 }, base)).toEqual({ transposeSemitones: 2, transposeOctave: 0, concertPitch: false, accidentalPreference: 'auto' });
    // Explicit zero: overrides a score transposed by itself.
    expect(transposeOverride(base, { ...base, transposeSemitones: -3 })).toEqual({ ...base, accidentalPreference: 'auto' });
    expect(transposeOverride({ ...base, accidentalPreference: 'sharps' }, base)).toMatchObject({ accidentalPreference: 'sharps' });
  });

  it('clears the override when back to the score settings', () => {
    expect(transposeOverride(base, base)).toEqual({ transposeSemitones: undefined, transposeOctave: undefined, concertPitch: undefined, accidentalPreference: undefined });
  });

  it('detects transposition overrides and formats badges', () => {
    expect(hasTransposeOverride(undefined)).toBe(false);
    expect(hasTransposeOverride({ selectedParts: ['P1'] })).toBe(false);
    expect(hasTransposeOverride({ transposeSemitones: 0 })).toBe(true);
    expect(hasTransposeOverride({ accidentalPreference: 'flats' })).toBe(true);
    expect(transposeBadgeValue({ ...base, transposeSemitones: 2 })).toBe(' +2');
    expect(transposeBadgeValue({ ...base, transposeSemitones: -3, transposeOctave: -1 })).toBe(' -15');
    expect(transposeBadgeValue({ ...base, concertPitch: true })).toBe(' C');
    expect(transposeBadgeValue(base)).toBe('');
  });
});
