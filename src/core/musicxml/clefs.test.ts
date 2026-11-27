import { describe, expect, it } from 'vitest';
import { applyClefsInDocument, clefsKeyOf, originalClefs, parseClefsKey } from './clefs';
import { prepareDisplayXml } from './prepareDisplay';
import { parseXml, xmlEnv } from '../../test/xmlEnv';

const clef = (sign: string, line: number, extra = '', attrs = '') => `<clef${attrs}><sign>${sign}</sign><line>${line}</line>${extra}</clef>`;
const note = '<note><pitch><step>B</step><alter>-1</alter><octave>2</octave></pitch><duration>4</duration></note>';
const rest = '<note><rest measure="yes"/><duration>4</duration></note>';
const KEY_TIME = '<key><fifths>-2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>';

const SCORE = `<score-partwise version="4.0"><part-list>
  <score-part id="P1"><part-name>Trombone</part-name></score-part>
  <score-part id="P2"><part-name>Piano</part-name></score-part>
  <score-part id="P3"><part-name>Drums</part-name></score-part>
  <score-part id="P4"><part-name>Flute</part-name></score-part>
</part-list>
<part id="P1">
  <measure number="1"><attributes><divisions>1</divisions>${KEY_TIME}${clef('F', 4)}<transpose><chromatic>0</chromatic></transpose></attributes>${note}</measure>
  <measure number="2">${rest}</measure>
  <measure number="3"><attributes>${clef('C', 4)}</attributes>${rest}</measure>
  <measure number="4">${note}</measure>
</part>
<part id="P2">
  <measure number="1"><attributes><divisions>1</divisions>${KEY_TIME}<staves>2</staves>${clef('G', 2, '', ' number="1"')}${clef('F', 4, '', ' number="2"')}</attributes>${note}</measure>
  <measure number="2"><attributes>${clef('G', 2, '', ' number="2"')}</attributes>${note}</measure>
</part>
<part id="P3">
  <measure number="1"><attributes><divisions>1</divisions><clef><sign>percussion</sign></clef></attributes>${note}</measure>
</part>
<part id="P4">
  <measure number="1"><attributes><divisions>1</divisions>${KEY_TIME}</attributes>${note}</measure>
</part>
</score-partwise>`;

/** "sign line [octave]" of every clef of a part, in document order, with its staff number. */
function clefsOf(xml: string, partId: string): string[] {
  const part = Array.from(parseXml(xml).getElementsByTagName('part')).find((p) => p.getAttribute('id') === partId)!;
  return Array.from(part.getElementsByTagName('clef')).map((c) => {
    const t = (tag: string) => c.getElementsByTagName(tag)[0]?.textContent ?? '';
    return [c.getAttribute('number') ?? '', t('sign'), t('line'), t('clef-octave-change')].filter(Boolean).join(' ');
  });
}

const apply = (overrides: Parameters<typeof applyClefsInDocument>[1], xml = SCORE) => {
  const doc = parseXml(xml);
  const changed = applyClefsInDocument(doc, overrides);
  return { changed, xml: new xmlEnv.XMLSerializer().serializeToString(doc) };
};

describe('clef choice', () => {
  it('finds the clef of each part in the score', () => {
    expect(originalClefs(parseXml(SCORE))).toEqual({ P1: 'bass', P2: 'treble', P3: 'unpitched', P4: 'treble' });
  });

  it('replaces the first clef and removes later clef changes', () => {
    const r = apply({ P1: 'treble' });
    expect(r.changed).toBe(true);
    expect(clefsOf(r.xml, 'P1')).toEqual(['G 2']);
    // The emptied <attributes> of measure 3 is gone; key, time and transpose are untouched.
    const p1 = parseXml(r.xml).getElementsByTagName('part')[0]!;
    expect(p1.getElementsByTagName('attributes').length).toBe(1);
    expect(p1.getElementsByTagName('fifths')[0]?.textContent).toBe('-2');
    expect(p1.getElementsByTagName('beats')[0]?.textContent).toBe('4');
    expect(p1.getElementsByTagName('transpose').length).toBe(1);
    // Notes are unchanged (same written pitch).
    expect(p1.getElementsByTagName('octave')[0]?.textContent).toBe('2');
    expect(p1.getElementsByTagName('step')[0]?.textContent).toBe('B');
    // Other parts untouched.
    expect(clefsOf(r.xml, 'P2')).toEqual(clefsOf(SCORE, 'P2'));
  });

  it('writes octave clefs, alto and tenor clefs', () => {
    expect(clefsOf(apply({ P1: 'treble8vb' }).xml, 'P1')).toEqual(['G 2 -1']);
    expect(clefsOf(apply({ P1: 'alto' }).xml, 'P1')).toEqual(['C 3']);
    expect(clefsOf(apply({ P1: 'tenor' }).xml, 'P1')).toEqual(['C 4']);
    // From an octave clef back to a plain clef: the octave change is dropped.
    const once = apply({ P1: 'treble8vb' }).xml;
    expect(clefsOf(apply({ P1: 'bass' }, once).xml, 'P1')).toEqual(['F 4']);
  });

  it('applies the choice to every staff of a multi-staff part, keeping staff numbers', () => {
    const r = apply({ P2: 'bass' });
    expect(clefsOf(r.xml, 'P2')).toEqual(['1 F 4', '2 F 4']);
  });

  it('never touches percussion staves', () => {
    const r = apply({ P3: 'treble' });
    expect(r.changed).toBe(false);
    expect(clefsOf(r.xml, 'P3')).toEqual(['percussion']);
  });

  it('adds a clef to a part without one (treble by default)', () => {
    const r = apply({ P4: 'bass' });
    expect(clefsOf(r.xml, 'P4')).toEqual(['F 4']);
    // MusicXML order: <clef> after <key>/<time>.
    const attrs = parseXml(r.xml).getElementsByTagName('part')[3]!.getElementsByTagName('attributes')[0]!;
    expect(Array.from(attrs.childNodes).filter((n) => n.nodeType === 1).map((n) => (n as Element).tagName)).toEqual(['divisions', 'key', 'time', 'clef']);
  });

  it('is idempotent and reports no change when the clef is already the chosen one', () => {
    const once = apply({ P1: 'treble', P2: 'bass' }).xml;
    const twice = apply({ P1: 'treble', P2: 'bass' }, once);
    expect(twice.changed).toBe(false);
    expect(twice.xml).toBe(once);
    expect(apply({ P4: 'treble' }).changed).toBe(true); // explicit clef added
    expect(apply({ P2: 'treble' }).changed).toBe(true); // mid-piece change of staff 2 removed
  });

  it('ignores unknown parts and invalid choices', () => {
    expect(apply({ P9: 'bass' }).changed).toBe(false);
    expect(apply({ P1: 'banjo' } as never).changed).toBe(false);
  });

  it('keys the overrides in a stable way', () => {
    expect(clefsKeyOf({ P3: 'bass', P1: 'treble', P2: 'nope' })).toBe('P1=treble,P3=bass');
    expect(clefsKeyOf(undefined)).toBe('');
    expect(parseClefsKey('P1=treble,P3=bass,P4=x')).toEqual({ P1: 'treble', P3: 'bass' });
    expect(parseClefsKey('')).toEqual({});
  });
});

describe('prepareDisplayXml with clefs', () => {
  const opts = { selectedParts: [] as string[], multiRests: true, partNames: 'full' as const };

  it('reports the original clefs of all parts, even filtered out ones', () => {
    const r = prepareDisplayXml(SCORE, { ...opts, selectedParts: ['P1'], clefs: { P1: 'treble' } }, xmlEnv);
    expect(r.originalClefs).toEqual({ P1: 'bass', P2: 'treble', P3: 'unpitched', P4: 'treble' });
    expect(clefsOf(r.xml, 'P1')).toEqual(['G 2']);
  });

  it('lets the multi-measure rests run over a removed clef change', () => {
    const plain = prepareDisplayXml(SCORE, { ...opts, selectedParts: ['P1'] }, xmlEnv);
    expect(plain.multiRestGroups).toEqual([]); // measures 2-3 split by the clef change of measure 3
    const r = prepareDisplayXml(SCORE, { ...opts, selectedParts: ['P1'], clefs: { P1: 'treble' } }, xmlEnv);
    expect(r.multiRestGroups).toEqual([{ start: 1, length: 2 }]);
  });

  it('returns the stored XML untouched when the choice changes nothing', () => {
    expect(prepareDisplayXml(SCORE, { ...opts, multiRests: false, clefs: { P3: 'treble' } }, xmlEnv).xml).toBe(SCORE);
  });
});
