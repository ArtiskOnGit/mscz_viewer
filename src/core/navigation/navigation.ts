// Pure navigation helpers of the viewer: go to a bar / rehearsal mark, half-page turns.
import type { Timeline } from '../model/types';

/**
 * Bar numbers as printed (MusicXML `number` attribute of the first part's measures), by MusicXML measure rank.
 * Pickup bars usually have number "0" (or an `implicit` measure), so the rank is not always the printed number.
 */
export function measureNumbers(xml: string): string[] {
  const start = xml.search(/<part[\s>]/);
  if (start < 0) return [];
  const end = xml.indexOf('</part>', start);
  const part = xml.slice(start, end < 0 ? undefined : end);
  const numbers: string[] = [];
  for (const m of part.matchAll(/<measure(?=[\s/>])([^>]*)>/g)) {
    const attr = /\bnumber\s*=\s*["']([^"']*)["']/.exec(m[1] ?? '');
    numbers.push(attr?.[1] ?? String(numbers.length + 1));
  }
  return numbers;
}

/**
 * MusicXML measure rank of a bar typed by the user: first measure whose printed number matches,
 * otherwise the 1-based rank. Undefined if out of range.
 */
export function measureIndexForBar(input: string, numbers: readonly string[], measureCount: number): number | undefined {
  const value = input.trim();
  if (!value) return undefined;
  const exact = numbers.indexOf(value);
  if (exact >= 0) return exact;
  if (!/^\d+$/.test(value)) return undefined;
  const rank = Number(value) - 1;
  return rank >= 0 && rank < measureCount ? rank : undefined;
}

/** Page (1-based) showing a MusicXML measure, through the multi-rest map and the rendered measure → page map. */
export function pageOfMeasure(measureIndex: number, xmlToRendered: readonly number[], renderedPages: readonly number[]): number | undefined {
  const rendered = xmlToRendered[measureIndex];
  return rendered === undefined ? undefined : renderedPages[rendered] || undefined;
}

/**
 * Playing-order event to start from for a measure: its first occurrence,
 * otherwise the first event of a later measure (e.g. measure not in the timeline). -1 if none.
 */
export function firstEventOfMeasure(timeline: Timeline, measureIndex: number): number {
  const exact = timeline.events.findIndex((e) => e.measureIndex === measureIndex);
  return exact >= 0 ? exact : timeline.events.findIndex((e) => e.measureIndex >= measureIndex);
}

/**
 * Position in page mode. `half`: composite view between `page` and `page + 1`
 * (top half of the screen = top of the next page, bottom half = bottom of the current page).
 */
export interface PagePosition {
  page: number;
  half: boolean;
}

export function nextPosition(pos: PagePosition, pageCount: number, halfPageTurn: boolean): PagePosition {
  if (pos.half) return { page: Math.min(pos.page + 1, pageCount), half: false };
  if (pos.page >= pageCount) return { page: pageCount, half: false };
  return halfPageTurn ? { page: pos.page, half: true } : { page: pos.page + 1, half: false };
}

export function previousPosition(pos: PagePosition, halfPageTurn: boolean): PagePosition {
  if (pos.half) return { page: pos.page, half: false };
  if (pos.page <= 1) return { page: 1, half: false };
  return halfPageTurn ? { page: pos.page - 1, half: true } : { page: pos.page - 1, half: false };
}

export interface Band {
  top: number;
  bottom: number;
}

/**
 * Where to split the half-page composite view, from the vertical extent of the systems of both pages (screen px):
 * the top layer (next page) shows [0, topEnd), the bottom layer (current page) shows [bottomStart, height).
 * Splits between systems, as close as possible to the middle of the screen, so that no system is cut;
 * falls back to the exact middle when no split fits.
 */
export function halfPageSplit(current: readonly Band[], next: readonly Band[], height: number): { topEnd: number; bottomStart: number } {
  const middle = { topEnd: height / 2, bottomStart: height / 2 };
  const starts = current.map((s) => s.top).sort((a, b) => a - b).slice(1); // the first system of the current page is already played
  let best: { topEnd: number; bottomStart: number } | undefined;
  for (const b of starts) {
    const fitting = next.filter((s) => s.bottom <= b).map((s) => s.bottom);
    if (!fitting.length) continue;
    const candidate = { topEnd: Math.max(...fitting), bottomStart: b };
    if (!best || Math.abs(b - height / 2) < Math.abs(best.bottomStart - height / 2)) best = candidate;
  }
  return best ?? middle;
}

// --- start the auto-scroll from a bar picked by a long press ---

/**
 * MusicXML measure rank of a rendered (Verovio) measure id: the first MusicXML measure drawn by it (a merged
 * multi-measure rest stands for several). Undefined if the id is not a measure of the current layout.
 */
export function xmlMeasureOfId(id: string, measureIds: readonly string[], xmlToRendered: readonly number[]): number | undefined {
  const rendered = measureIds.indexOf(id);
  if (rendered < 0) return undefined;
  const xml = xmlToRendered.indexOf(rendered);
  return xml >= 0 ? xml : undefined;
}

/**
 * Playing-order event to start a picked bar from: its first occurrence at or after `from` (the current position),
 * otherwise its last occurrence before (e.g. second time through a repeat), otherwise the first event of a later
 * measure (measure missing from the timeline). -1 if none.
 */
export function eventOfMeasureFrom(timeline: Timeline, measureIndex: number, from: number): number {
  const events = timeline.events;
  const start = Math.max(0, from);
  for (let i = start; i < events.length; i++) if (events[i]!.measureIndex === measureIndex) return i;
  for (let i = Math.min(start, events.length) - 1; i >= 0; i--) if (events[i]!.measureIndex === measureIndex) return i;
  return firstEventOfMeasure(timeline, measureIndex);
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Index of the box under a point (the smallest one containing it), else of the nearest box of the same row
 * (a point in the margin of a system, or between two measures). -1 if none is close enough (`slack` px).
 */
export function boxAtPoint(boxes: readonly Box[], x: number, y: number, slack = 24): number {
  let best = -1;
  let bestArea = Infinity;
  boxes.forEach((b, i) => {
    if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) {
      const area = (b.right - b.left) * (b.bottom - b.top);
      if (area < bestArea) [best, bestArea] = [i, area];
    }
  });
  if (best >= 0) return best;
  let bestDistance = slack;
  boxes.forEach((b, i) => {
    if (y < b.top || y > b.bottom) return;
    const d = x < b.left ? b.left - x : x - b.right;
    if (d <= bestDistance) [best, bestDistance] = [i, d];
  });
  return best;
}
// --- end start from a picked bar ---
