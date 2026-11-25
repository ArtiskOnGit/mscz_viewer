import { describe, expect, it } from 'vitest';
import { filterParts } from './filterParts';
import { parseXml, xmlEnv } from '../../test/xmlEnv';

// Two parts, as exported by MuseScore: tempo + rehearsal mark only in P1.
const SCORE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <part-group type="start" number="1"><group-symbol>bracket</group-symbol></part-group>
    <score-part id="P1"><part-name>Trumpet</part-name></score-part>
    <part-group type="stop" number="1"/>
    <score-part id="P2"><part-name>Tenor Sax</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <direction placement="above"><direction-type><rehearsal>A</rehearsal></direction-type></direction>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration></note>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type><sound tempo="90"/></direction>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration></note>
    </measure>
    <measure number="2">
      <direction><direction-type><words>espressivo</words></direction-type></direction>
      <note><rest measure="yes"/><duration>4</duration></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>2</divisions></attributes>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration></note>
      <backup><duration>8</duration></backup>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><voice>2</voice></note>
    </measure>
    <measure number="2">
      <note><rest measure="yes"/><duration>8</duration></note>
    </measure>
  </part>
</score-partwise>`;

const childTags = (el: Element) => Array.from(el.childNodes).filter((n) => n.nodeType === 1).map((n) => (n as Element).tagName);

describe('filterParts', () => {
  it('returns all parts untouched when everything is kept', () => {
    const { xml, copiedDirections } = filterParts(SCORE, ['P1', 'P2'], xmlEnv);
    expect(copiedDirections).toBe(0);
    expect(parseXml(xml).getElementsByTagName('part')).toHaveLength(2);
  });

  it('removes unselected parts and their declaration', () => {
    const doc = parseXml(filterParts(SCORE, ['P2'], xmlEnv).xml);
    const ids = Array.from(doc.getElementsByTagName('part')).map((p) => p.getAttribute('id'));
    expect(ids).toEqual(['P2']);
    expect(Array.from(doc.getElementsByTagName('score-part')).map((p) => p.getAttribute('id'))).toEqual(['P2']);
  });

  it('removes part groups that became empty', () => {
    const doc = parseXml(filterParts(SCORE, ['P2'], xmlEnv).xml);
    expect(doc.getElementsByTagName('part-group')).toHaveLength(0);
  });

  it('copies tempo and rehearsal marks to the first kept part, at the same rhythmic position', () => {
    const { xml, copiedDirections } = filterParts(SCORE, ['P2'], xmlEnv);
    expect(copiedDirections).toBe(2);
    const m1 = parseXml(xml).getElementsByTagName('part')[0]!.getElementsByTagName('measure')[0]!;
    // Rehearsal mark before the 1st note; tempo at beat 3 (P1 divisions=1 → time 2 → P2 divisions=2 → time 4),
    // i.e. before the G, and never inside voice 2.
    expect(childTags(m1)).toEqual(['attributes', 'direction', 'note', 'note', 'direction', 'note', 'backup', 'note']);
    expect(m1.getElementsByTagName('sound')[0]?.getAttribute('tempo')).toBe('90');
    expect(m1.getElementsByTagName('rehearsal')[0]?.textContent).toBe('A');
  });

  it('does not copy plain text directions (cannot tell system text from staff text)', () => {
    const m2 = parseXml(filterParts(SCORE, ['P2'], xmlEnv).xml).getElementsByTagName('part')[0]!.getElementsByTagName('measure')[1]!;
    expect(m2.getElementsByTagName('words')).toHaveLength(0);
  });

  it('throws when no requested part exists', () => {
    expect(() => filterParts(SCORE, ['P9'], xmlEnv)).toThrow();
  });
});
