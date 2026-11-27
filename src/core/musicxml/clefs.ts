// Clef chosen by the user for a part (e.g. a trombonist who reads treble clef). Only the clef changes: the
// written pitches stay the same and Verovio places them on the staff for the new clef. See
// SPECIFICATIONS_TECHNIQUES §5 and ADR-028.
//
// A choice applies to every pitched staff of the part (piano: both staves). Percussion, tablature and other
// unpitched staves are never touched. The first clef of each staff is replaced; later clef changes of that staff
// are removed (the chosen clef holds for the whole piece; redundant clef changes would also break multi-measure
// rests).

import type { ClefChoice } from '../model/types';

export type { ClefChoice };

export const CLEF_CHOICES: readonly ClefChoice[] = ['treble', 'treble8vb', 'bass', 'alto', 'tenor'];

/** Clef found at the start of a part in the score (its first staff); 'other' = unusual pitched clef. */
export type OriginalClef = ClefChoice | 'other' | 'unpitched';

interface ClefSpec {
  sign: 'G' | 'F' | 'C';
  line: number;
  octaveChange?: number;
}

const SPECS: Record<ClefChoice, ClefSpec> = {
  treble: { sign: 'G', line: 2 },
  treble8vb: { sign: 'G', line: 2, octaveChange: -1 },
  bass: { sign: 'F', line: 4 },
  alto: { sign: 'C', line: 3 },
  tenor: { sign: 'C', line: 4 },
};

const PITCHED_SIGNS = new Set(['G', 'F', 'C']);

export const isClefChoice = (v: unknown): v is ClefChoice => typeof v === 'string' && (CLEF_CHOICES as readonly string[]).includes(v);

/** Stable text of the overrides ("P1=treble,P3=bass", sorted, invalid entries dropped): part of the display key. */
export function clefsKeyOf(overrides: Readonly<Record<string, unknown>> | undefined): string {
  if (!overrides) return '';
  return Object.keys(overrides)
    .filter((id) => isClefChoice(overrides[id]))
    .sort()
    .map((id) => `${id}=${overrides[id] as string}`)
    .join(',');
}

export function parseClefsKey(key: string): Record<string, ClefChoice> {
  const out: Record<string, ClefChoice> = {};
  for (const entry of key ? key.split(',') : []) {
    const i = entry.lastIndexOf('=');
    const choice = entry.slice(i + 1);
    if (i > 0 && isClefChoice(choice)) out[entry.slice(0, i)] = choice;
  }
  return out;
}

const childElements = (el: Element, tag?: string): Element[] =>
  Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (!tag || (n as Element).tagName === tag));
const childText = (el: Element, tag: string) => childElements(el, tag)[0]?.textContent?.trim() ?? '';

function choiceOf(clef: Element): OriginalClef {
  const sign = childText(clef, 'sign');
  if (!PITCHED_SIGNS.has(sign)) return 'unpitched';
  const line = Number(childText(clef, 'line')) || (sign === 'G' ? 2 : sign === 'F' ? 4 : 3);
  const octave = Number(childText(clef, 'clef-octave-change')) || 0;
  const found = CLEF_CHOICES.find((c) => SPECS[c].sign === sign && SPECS[c].line === line && (SPECS[c].octaveChange ?? 0) === octave);
  return found ?? 'other';
}

/** First clef of each part (by MusicXML part id); treble when a part has no clef (MusicXML default). */
export function originalClefs(doc: Document): Record<string, OriginalClef> {
  const out: Record<string, OriginalClef> = {};
  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    const id = part.getAttribute('id') ?? '';
    const first = Array.from(part.getElementsByTagName('clef')).find((c) => (c.getAttribute('number') ?? '1') === '1');
    out[id] = first ? choiceOf(first) : 'treble';
  }
  return out;
}

function fillClef(doc: Document, clef: Element, spec: ClefSpec): void {
  for (const child of Array.from(clef.childNodes)) clef.removeChild(child);
  const add = (tag: string, value: string | number) => {
    const el = doc.createElement(tag);
    el.appendChild(doc.createTextNode(String(value)));
    clef.appendChild(el);
  };
  add('sign', spec.sign);
  add('line', spec.line);
  if (spec.octaveChange) add('clef-octave-change', spec.octaveChange);
  // Meaningless for a clef that is now the first one of its staff.
  for (const attr of ['after-barline', 'additional', 'size', 'cancel']) clef.removeAttribute(attr);
}

/** Children of <attributes> that come after <clef> (MusicXML order). */
const AFTER_CLEF = new Set(['staff-details', 'transpose', 'for-part', 'directive', 'measure-style']);

/** Applies the chosen clefs to the parts of a parsed document (in place); true when the document changed. */
export function applyClefsInDocument(doc: Document, overrides: Readonly<Record<string, ClefChoice>>): boolean {
  let changed = false;
  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    const choice = overrides[part.getAttribute('id') ?? ''];
    if (!choice || !isClefChoice(choice)) continue;
    const spec = SPECS[choice];
    const before = clefsSnapshot(part);
    // Staves whose first clef was seen: pitched (replaced) or unpitched (left alone, with its later changes).
    const seen = new Map<string, 'pitched' | 'unpitched'>();
    for (const clef of Array.from(part.getElementsByTagName('clef'))) {
      const staff = clef.getAttribute('number') ?? '1';
      const pitched = choiceOf(clef) !== 'unpitched';
      const state = seen.get(staff);
      if (state === 'unpitched') continue;
      if (!state) {
        seen.set(staff, pitched ? 'pitched' : 'unpitched');
        if (pitched) fillClef(doc, clef, spec);
        continue;
      }
      if (!pitched) continue; // switch to percussion mid-piece: kept as is
      const attributes = clef.parentNode as Element | null;
      attributes?.removeChild(clef);
      if (attributes && childElements(attributes).length === 0) attributes.parentNode?.removeChild(attributes);
    }
    // Staves without any clef (treble by MusicXML default): add one to the first <attributes>.
    const firstMeasure = childElements(part, 'measure')[0];
    if (firstMeasure) {
      let attributes = childElements(firstMeasure, 'attributes')[0];
      const staves = Math.max(1, Number(attributes && childText(attributes, 'staves')) || 1);
      for (let n = 1; n <= staves; n++) {
        const staff = String(n);
        if (seen.has(staff)) continue;
        if (!attributes) {
          attributes = doc.createElement('attributes');
          const firstContent = childElements(firstMeasure).find((el) => el.tagName !== 'print');
          if (firstContent) firstMeasure.insertBefore(attributes, firstContent);
          else firstMeasure.appendChild(attributes);
        }
        const clef = doc.createElement('clef');
        if (staves > 1) clef.setAttribute('number', staff);
        fillClef(doc, clef, spec);
        const next = childElements(attributes).find((el) => AFTER_CLEF.has(el.tagName));
        if (next) attributes.insertBefore(clef, next);
        else attributes.appendChild(clef);
      }
    }
    changed ||= clefsSnapshot(part) !== before;
  }
  return changed;
}

/** Text of the clefs of a part, to tell whether applying the choice changed anything. */
function clefsSnapshot(part: Element): string {
  return Array.from(part.getElementsByTagName('clef'))
    .map((c) => `${Array.from(c.attributes).map((a) => `${a.name}=${a.value}`).join(';')}:${childElements(c).map((e) => `${e.tagName}=${e.textContent?.trim() ?? ''}`).join(';')}`)
    .join('/');
}
