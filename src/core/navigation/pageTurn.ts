// Page mode: when the auto-scroll turns the page, and how page turns are animated (§3.2.2, §3.2.5, §3.4).

/** Bars before the end of the page at which the auto-scroll turns it; "half": halfway through the last bar. */
export type TurnLookahead = 'half' | 0 | 1 | 2 | 3 | 4;
export const TURN_LOOKAHEADS: readonly TurnLookahead[] = ['half', 0, 1, 2, 3, 4];

export type PageTurnAnimation = 'none' | 'slide' | 'fade';
export const PAGE_TURN_ANIMATIONS: readonly PageTurnAnimation[] = ['none', 'slide', 'fade'];

/**
 * Page to show while the timeline event `eventIndex` is played (`progress` 0..1 in it).
 * `pageOf(j)`: page (1-based) of the j-th timeline event, undefined/0 if unknown (past the end, not rendered).
 * - "half": the next page as soon as half of the last bar of the page is played (also for repeats going back);
 * - N bars: the next page once the current bar is within N bars of the end of the page (0 = no anticipation).
 *   A repeat going back to an earlier page is never anticipated by more than half a bar (the end of the page is
 *   still being read), and not at all with 0.
 */
export function autoScrollPage(pageOf: (j: number) => number | undefined, eventIndex: number, progress: number, lookahead: TurnLookahead, currentPage: number): number {
  const here = pageOf(eventIndex) || currentPage;
  const halfway = (p: number | undefined) => (p && p !== here && progress > 0.5 ? p : here);
  if (lookahead === 'half') return halfway(pageOf(eventIndex + 1));
  for (let k = 1; k <= lookahead; k++) {
    const p = pageOf(eventIndex + k);
    if (!p) break;
    if (p === here) continue;
    return p > here ? p : k === 1 ? halfway(p) : here;
  }
  return here;
}

/** Direction of a page turn, for its animation (undefined: no animation). */
export function turnDirection(from: number | undefined, to: number, animation: PageTurnAnimation): 'next' | 'prev' | undefined {
  if (animation === 'none' || from === undefined || from === to) return undefined;
  return to > from ? 'next' : 'prev';
}
