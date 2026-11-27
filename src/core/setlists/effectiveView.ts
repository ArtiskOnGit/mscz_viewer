// Settings actually used to display a score: per-score view state, overridden by the setlist item (ADR-011).
import type { ClefChoice, ScoreViewState, SetlistItem } from '../model/types';
import { clefsKeyOf } from '../musicxml/clefs';

export type SetlistOverride = NonNullable<SetlistItem['override']>;

export function effectiveViewState(view: ScoreViewState, override?: SetlistOverride): ScoreViewState {
  if (!override) return view;
  const result: Record<string, unknown> = { ...view };
  for (const [k, v] of Object.entries(override)) if (v !== undefined) result[k] = v;
  return result as unknown as ScoreViewState;
}

export type TransposeSettings = Pick<ScoreViewState, 'transposeSemitones' | 'transposeOctave' | 'concertPitch'> &
  Partial<Pick<ScoreViewState, 'accidentalPreference'>>;

/**
 * Override patch for a transposition chosen for a setlist piece. Same as the score's own settings = no override
 * (undefined values clear the keys, see SetlistRepository.setOverride).
 */
export function transposeOverride(value: TransposeSettings, base: TransposeSettings): SetlistOverride {
  const pref = (t: TransposeSettings) => t.accidentalPreference ?? 'auto';
  const same =
    value.transposeSemitones === base.transposeSemitones &&
    value.transposeOctave === base.transposeOctave &&
    value.concertPitch === base.concertPitch &&
    pref(value) === pref(base);
  return same
    ? { transposeSemitones: undefined, transposeOctave: undefined, concertPitch: undefined, accidentalPreference: undefined }
    : { transposeSemitones: value.transposeSemitones, transposeOctave: value.transposeOctave, concertPitch: value.concertPitch, accidentalPreference: pref(value) };
}

/** The override changes the transposition of the piece. */
export function hasTransposeOverride(o: SetlistOverride | undefined): boolean {
  return !!o && (o.transposeSemitones !== undefined || o.transposeOctave !== undefined || o.concertPitch !== undefined || o.accidentalPreference !== undefined);
}

/** Toolbar/list badge value: " +2", " -15", " C" (concert pitch), "" (none). */
export function transposeBadgeValue(t: TransposeSettings): string {
  const total = t.transposeSemitones + 12 * t.transposeOctave;
  return total ? ` ${total > 0 ? '+' : ''}${total}` : t.concertPitch ? ' C' : '';
}

/**
 * Override patch for the clefs chosen for a setlist piece: none when they are the score's own (`base`); otherwise
 * the whole map, even empty (= the clefs of the score, while the score itself has other choices).
 */
export function clefOverride(value: Record<string, ClefChoice>, base: ScoreViewState['clefOverrides']): SetlistOverride {
  return { clefOverrides: clefsKeyOf(value) === clefsKeyOf(base) ? undefined : value };
}
