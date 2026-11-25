// Group consecutive empty measures into multi-measure rests ("11" bars) for the filtered part view.
//
// MuseScore never exports <multiple-rest> to MusicXML, so a single part shows long runs of whole-measure
// rests. Verovio does render <measure-style><multiple-rest>N</multiple-rest></measure-style> (validated in
// phase 0) and merges the N measures into one: callers must map measure indices accordingly.
import type { XmlEnv } from './filterParts';

export interface MultiRestGroup {
  /** 0-based rank of the first measure of the group (identical in every part). */
  start: number;
  /** Number of measures in the group (>= minMeasures). */
  length: number;
}

export interface MultiRestResult {
  xml: string;
  groups: MultiRestGroup[];
}

export interface MultiRestOptions {
  /** Minimum number of measures to form a group. Default 2. */
  minMeasures?: number;
}

const DOUBLE_BAR_STYLES = new Set(['light-light', 'light-heavy', 'heavy-light', 'heavy-heavy']);
/** Attribute changes that must stay visible: they end a group and can only open a new one. */
const BREAKING_ATTRIBUTES = ['key', 'time', 'clef', 'transpose'];

/**
 * Add multi-measure rests to every run of measures that are empty in all parts.
 *
 * Idempotence: if the score already contains a <multiple-rest>, it is returned untouched and the groups
 * are read from the existing marks (first part), so calling the function twice is harmless.
 */
export function groupMultiRests(xml: string, env: XmlEnv = globalThis, opts: MultiRestOptions = {}): MultiRestResult {
  const minMeasures = Math.max(2, opts.minMeasures ?? 2);
  const doc = new env.DOMParser().parseFromString(xml, 'application/xml');
  const parts = Array.from(doc.getElementsByTagName('part'));
  if (parts.length === 0) return { xml, groups: [] };
  const measuresByPart = parts.map((p) => childElements(p, 'measure'));

  if (doc.getElementsByTagName('multiple-rest').length > 0) {
    return { xml, groups: existingGroups(measuresByPart[0] ?? []) };
  }

  const count = Math.min(...measuresByPart.map((m) => m.length));
  const groups: MultiRestGroup[] = [];
  let start = -1;
  const close = (endExclusive: number) => {
    if (start >= 0 && endExclusive - start >= minMeasures) groups.push({ start, length: endExclusive - start });
    start = -1;
  };

  for (let i = 0; i < count; i++) {
    const column = measuresByPart.map((ms) => ms[i]).filter((m): m is Element => m !== undefined);
    const empty = column.every(isEmptyMeasure);
    if (!empty) {
      close(i);
    } else if (start >= 0 && column.some(breaksOnLeft)) {
      close(i);
      start = i;
    } else if (start < 0) {
      start = i;
    }
    if (column.some(breaksOnRight)) close(i + 1);
  }
  close(count);

  if (groups.length === 0) return { xml, groups };
  for (const measures of measuresByPart) {
    for (const g of groups) {
      const first = measures[g.start];
      if (first) addMultipleRest(doc, first, g.length);
    }
  }
  return { xml: new env.XMLSerializer().serializeToString(doc), groups };
}

/** Only rests, no direction / harmony / sound, and not a pickup measure. */
function isEmptyMeasure(measure: Element): boolean {
  if (measure.getAttribute('implicit') === 'yes') return false;
  for (const el of childElements(measure)) {
    switch (el.tagName) {
      case 'note':
        if (!first(el, 'rest')) return false;
        break;
      case 'direction':
      case 'harmony':
      case 'figured-bass':
      case 'sound':
        return false;
      default:
        break;
    }
  }
  return true;
}

/** Key/time/clef/transpose change or left barline with repeat, volta or double bar. */
function breaksOnLeft(measure: Element): boolean {
  const attributeChange = childElements(measure, 'attributes').some((a) => BREAKING_ATTRIBUTES.some((t) => first(a, t)));
  return attributeChange || childElements(measure, 'barline').some((b) => barlineLocation(b) === 'left' && isBreakingBarline(b));
}

/** Right barline (default location) with repeat, volta or double bar. */
function breaksOnRight(measure: Element): boolean {
  return childElements(measure, 'barline').some((b) => barlineLocation(b) === 'right' && isBreakingBarline(b));
}

const barlineLocation = (barline: Element) => barline.getAttribute('location') || 'right';

function isBreakingBarline(barline: Element): boolean {
  const style = first(barline, 'bar-style')?.textContent?.trim() ?? '';
  return Boolean(first(barline, 'repeat') || first(barline, 'ending') || DOUBLE_BAR_STYLES.has(style));
}

function addMultipleRest(doc: Document, measure: Element, length: number): void {
  let attributes = childElements(measure, 'attributes')[0];
  if (!attributes) {
    attributes = doc.createElement('attributes');
    const firstContent = childElements(measure).find((el) => el.tagName !== 'print');
    if (firstContent) measure.insertBefore(attributes, firstContent);
    else measure.appendChild(attributes);
  }
  const style = doc.createElement('measure-style');
  const rest = doc.createElement('multiple-rest');
  rest.appendChild(doc.createTextNode(String(length)));
  style.appendChild(rest);
  attributes.appendChild(style);
}

function existingGroups(measures: Element[]): MultiRestGroup[] {
  const groups: MultiRestGroup[] = [];
  measures.forEach((m, i) => {
    const n = Number(first(m, 'multiple-rest')?.textContent ?? 0);
    if (n > 0) groups.push({ start: i, length: n });
  });
  return groups;
}

const first = (el: Element, tag: string): Element | undefined => el.getElementsByTagName(tag)[0] ?? undefined;
const childElements = (el: Element, tag?: string): Element[] =>
  Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (!tag || (n as Element).tagName === tag));
