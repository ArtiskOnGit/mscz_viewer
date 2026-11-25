// MusicXML measure rank → index of the measure drawn by Verovio.
// Verovio merges the N measures of a multi-measure rest into one <measure> (phase 0), so later indexes shift.
import type { MultiRestGroup } from '../musicxml/multiRests';

export function xmlToRenderedMeasure(xmlMeasureCount: number, groups: readonly MultiRestGroup[]): number[] {
  const map: number[] = [];
  const byStart = new Map(groups.map((g) => [g.start, g.length]));
  let rendered = -1;
  for (let i = 0; i < xmlMeasureCount; ) {
    rendered++;
    const len = byStart.get(i) ?? 1;
    for (let k = 0; k < len && i < xmlMeasureCount; k++, i++) map.push(rendered);
  }
  return map;
}
