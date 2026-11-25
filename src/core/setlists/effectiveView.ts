// Settings actually used to display a score: per-score view state, overridden by the setlist item (ADR-011).
import type { ScoreViewState, SetlistItem } from '../model/types';

export type SetlistOverride = NonNullable<SetlistItem['override']>;

export function effectiveViewState(view: ScoreViewState, override?: SetlistOverride): ScoreViewState {
  if (!override) return view;
  const result: Record<string, unknown> = { ...view };
  for (const [k, v] of Object.entries(override)) if (v !== undefined) result[k] = v;
  return result as unknown as ScoreViewState;
}
