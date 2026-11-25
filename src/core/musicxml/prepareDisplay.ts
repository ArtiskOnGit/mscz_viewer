// Turn the stored MusicXML into the XML actually rendered: selected parts, multi-measure rests,
// instrument names. See SPECIFICATIONS_TECHNIQUES §5.
import { filterParts, type XmlEnv } from './filterParts';
import { groupMultiRests, type MultiRestGroup } from './multiRests';
import { firstKeyFifths } from '../music/keys';

export type PartNamesMode = 'auto' | 'full' | 'hidden';

export interface DisplayOptions {
  /** musicXmlIds to show; empty = all parts. */
  selectedParts: readonly string[];
  multiRests: boolean;
  /** auto = hidden when a single part is displayed (the name is repeated on every system). */
  partNames: PartNamesMode;
}

export interface DisplayXml {
  xml: string;
  /** Number of staves displayed (piano = 2), used for the automatic zoom. */
  staves: number;
  multiRestGroups: MultiRestGroup[];
  /** First key signature of the first displayed part (written pitch). */
  key: ReturnType<typeof firstKeyFifths>;
}

export function prepareDisplayXml(xml: string, opts: DisplayOptions, env: XmlEnv = globalThis): DisplayXml {
  const allIds = partIds(xml, env);
  const keep = opts.selectedParts.filter((id) => allIds.includes(id));
  let out = keep.length > 0 && keep.length < allIds.length ? filterParts(xml, keep, env).xml : xml;
  const shownParts = keep.length > 0 ? keep.length : allIds.length;

  let multiRestGroups: MultiRestGroup[] = [];
  if (opts.multiRests) ({ xml: out, groups: multiRestGroups } = groupMultiRests(out, env));

  const hideNames = opts.partNames === 'hidden' || (opts.partNames === 'auto' && shownParts === 1);
  const doc = new env.DOMParser().parseFromString(out, 'application/xml');
  if (hideNames) {
    for (const sp of Array.from(doc.getElementsByTagName('score-part'))) {
      for (const tag of ['part-name', 'part-abbreviation']) {
        for (const el of Array.from(sp.getElementsByTagName(tag))) el.setAttribute('print-object', 'no');
        // Verovio ignores print-object on part names: empty them too.
        for (const el of Array.from(sp.getElementsByTagName(tag))) el.textContent = '';
      }
      for (const tag of ['part-name-display', 'part-abbreviation-display']) {
        for (const el of Array.from(sp.getElementsByTagName(tag))) el.parentNode?.removeChild(el);
      }
    }
    out = new env.XMLSerializer().serializeToString(doc);
  }
  return { xml: out, staves: countStaves(doc), multiRestGroups, key: firstKeyFifths(doc) };
}

export function partIds(xml: string, env: XmlEnv = globalThis): string[] {
  const doc = new env.DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('score-part')).map((sp) => sp.getAttribute('id') ?? '');
}

/** Sum of <staves> of each part (1 when absent). */
function countStaves(doc: Document): number {
  let total = 0;
  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    const staves = part.getElementsByTagName('staves')[0];
    total += staves ? Math.max(1, Number(staves.textContent) || 1) : 1;
  }
  return Math.max(1, total);
}
