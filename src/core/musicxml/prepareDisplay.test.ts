import { describe, expect, it } from 'vitest';
import { partIds, prepareDisplayXml } from './prepareDisplay';
import { parseXml, xmlEnv } from '../../test/xmlEnv';
import { filterParts } from './filterParts';
import { groupMultiRests } from './multiRests';

const rest = '<note><rest measure="yes"/><duration>4</duration></note>';
const play = '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>';
const SCORE = `<score-partwise version="4.0"><part-list>
  <score-part id="P1"><part-name>Trumpet</part-name><part-abbreviation>Tpt.</part-abbreviation></score-part>
  <score-part id="P2"><part-name>Piano</part-name><part-name-display><display-text>Pno</display-text></part-name-display></score-part>
</part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>${play}</measure><measure number="2">${rest}</measure><measure number="3">${rest}</measure><measure number="4">${play}</measure></part>
<part id="P2"><measure number="1"><attributes><divisions>1</divisions><staves>2</staves></attributes>${play}</measure><measure number="2">${play}</measure><measure number="3">${play}</measure><measure number="4">${play}</measure></part>
</score-partwise>`;

const opts = { selectedParts: [] as string[], multiRests: true, partNames: 'auto' as const };

describe('prepareDisplayXml', () => {
  it('lists part ids', () => expect(partIds(SCORE, xmlEnv)).toEqual(['P1', 'P2']));

  it('gives the same XML as the separate steps, in a single parse', () => {
    const steps = groupMultiRests(filterParts(SCORE, ['P1'], xmlEnv).xml, xmlEnv);
    const r = prepareDisplayXml(SCORE, { selectedParts: ['P1'], multiRests: true, partNames: 'full' }, xmlEnv);
    expect(r.xml).toBe(steps.xml);
    expect(r.multiRestGroups).toEqual(steps.groups);
  });

  it('returns the stored XML untouched when there is nothing to change', () => {
    const r = prepareDisplayXml(SCORE, { selectedParts: [], multiRests: true, partNames: 'full' }, xmlEnv);
    expect(r.xml).toBe(SCORE);
  });

  it('keeps everything and counts staves (piano = 2) when no part is selected', () => {
    const r = prepareDisplayXml(SCORE, opts, xmlEnv);
    expect(partIds(r.xml, xmlEnv)).toEqual(['P1', 'P2']);
    expect(r.staves).toBe(3);
    expect(r.multiRestGroups).toEqual([]); // the piano plays in measures 2-3
    expect(parseXml(r.xml).getElementsByTagName('part-name')[0]?.textContent).toBe('Trumpet');
  });

  it('filters, groups rests of the remaining part and hides the single instrument name', () => {
    const r = prepareDisplayXml(SCORE, { ...opts, selectedParts: ['P1'] }, xmlEnv);
    const doc = parseXml(r.xml);
    expect(partIds(r.xml, xmlEnv)).toEqual(['P1']);
    expect(r.staves).toBe(1);
    expect(r.multiRestGroups).toEqual([{ start: 1, length: 2 }]);
    expect(doc.getElementsByTagName('part-name')[0]?.textContent).toBe('');
    expect(doc.getElementsByTagName('part-abbreviation')[0]?.textContent).toBe('');
  });

  it('respects partNames=full and multiRests=false', () => {
    const r = prepareDisplayXml(SCORE, { selectedParts: ['P1'], multiRests: false, partNames: 'full' }, xmlEnv);
    expect(r.multiRestGroups).toEqual([]);
    expect(parseXml(r.xml).getElementsByTagName('part-name')[0]?.textContent).toBe('Trumpet');
  });

  it('ignores unknown selected ids', () => {
    expect(partIds(prepareDisplayXml(SCORE, { ...opts, selectedParts: ['P9'] }, xmlEnv).xml, xmlEnv)).toEqual(['P1', 'P2']);
  });
});
