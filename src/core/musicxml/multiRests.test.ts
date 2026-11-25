import { describe, expect, it } from 'vitest';
import { groupMultiRests } from './multiRests';
import { parseXml, xmlEnv } from '../../test/xmlEnv';

const R = '<note><rest measure="yes"/><duration>4</duration></note>';
const N = '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>';
const ATTRS = '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';

/** Build a score: each argument is a part, each string a measure content. Measure 0 gets the initial attributes. */
function score(...parts: string[][]): string {
  const partList = parts.map((_, p) => `<score-part id="P${p + 1}"><part-name>Part ${p + 1}</part-name></score-part>`).join('');
  const body = parts
    .map((measures, p) => {
      const ms = measures.map((content, i) => {
        const implicit = content.startsWith('PICKUP:');
        const inner = implicit ? content.slice('PICKUP:'.length) : content;
        return `<measure number="${i + 1}"${implicit ? ' implicit="yes"' : ''}>${i === 0 ? ATTRS : ''}${inner}</measure>`;
      });
      return `<part id="P${p + 1}">${ms.join('')}</part>`;
    })
    .join('');
  return `<?xml version="1.0"?><score-partwise version="4.0"><part-list>${partList}</part-list>${body}</score-partwise>`;
}

const run = (xml: string, minMeasures?: number) => groupMultiRests(xml, xmlEnv, minMeasures ? { minMeasures } : {});
const multiRests = (xml: string, part = 0) =>
  Array.from(parseXml(xml).getElementsByTagName('part')[part]!.getElementsByTagName('measure')).map(
    (m) => Number(m.getElementsByTagName('multiple-rest')[0]?.textContent ?? 0),
  );

describe('groupMultiRests', () => {
  it('groups a simple run of rests', () => {
    const { xml, groups } = run(score([N, R, R, R, N]));
    expect(groups).toEqual([{ start: 1, length: 3 }]);
    expect(multiRests(xml)).toEqual([0, 3, 0, 0, 0]);
  });

  it('can start at the first measure (which carries the initial attributes)', () => {
    const { xml, groups } = run(score([R, R, N]));
    expect(groups).toEqual([{ start: 0, length: 2 }]);
    const attrs = parseXml(xml).getElementsByTagName('measure')[0]!.getElementsByTagName('attributes');
    expect(attrs).toHaveLength(1); // merged into the existing <attributes>
    expect(attrs[0]!.lastChild?.nodeName).toBe('measure-style');
  });

  it('creates <attributes> after <print> when the measure has none', () => {
    const { xml } = run(score([N, `<print new-system="yes"/>${R}`, R]));
    const m1 = parseXml(xml).getElementsByTagName('measure')[1]!;
    const tags = Array.from(m1.childNodes).filter((n) => n.nodeType === 1).map((n) => n.nodeName);
    expect(tags).toEqual(['print', 'attributes', 'note']);
  });

  it('ignores runs shorter than minMeasures', () => {
    expect(run(score([N, R, N, R, R, R, N]), 3).groups).toEqual([{ start: 3, length: 3 }]);
    expect(run(score([N, R, N])).groups).toEqual([]);
  });

  it('finds several groups', () => {
    expect(run(score([R, R, N, R, R, R, N, R, R])).groups).toEqual([
      { start: 0, length: 2 },
      { start: 3, length: 3 },
      { start: 7, length: 2 },
    ]);
  });

  it('does not group when one part plays', () => {
    const { groups, xml } = run(score([N, R, R, R, R], [N, R, N, R, R]));
    expect(groups).toEqual([{ start: 3, length: 2 }]);
    expect(multiRests(xml, 0)).toEqual([0, 0, 0, 2, 0]);
    expect(multiRests(xml, 1)).toEqual([0, 0, 0, 2, 0]);
  });

  it('breaks on rehearsal marks and any direction', () => {
    const rehearsal = '<direction><direction-type><rehearsal>A</rehearsal></direction-type></direction>';
    const words = '<direction><direction-type><words>solo</words></direction-type></direction>';
    expect(run(score([R, R, rehearsal + R, R, R, words + R, R])).groups).toEqual([
      { start: 0, length: 2 },
      { start: 3, length: 2 },
    ]);
  });

  it('breaks on harmony and sound elements', () => {
    const harmony = '<harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>';
    expect(run(score([R, R, harmony + R, R, R, '<sound tempo="80"/>' + R, R])).groups).toEqual([
      { start: 0, length: 2 },
      { start: 3, length: 2 },
    ]);
  });

  it('a key / time / clef change ends the previous group and may start a new one', () => {
    const key = '<attributes><key><fifths>2</fifths></key></attributes>';
    const time = '<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>';
    expect(run(score([R, R, key + R, R, N, time + R, R, R])).groups).toEqual([
      { start: 0, length: 2 },
      { start: 2, length: 2 },
      { start: 5, length: 3 },
    ]);
  });

  it('ignores attributes without breaking elements (e.g. divisions only)', () => {
    expect(run(score([N, R, '<attributes><divisions>2</divisions></attributes>' + R, R])).groups).toEqual([{ start: 1, length: 3 }]);
  });

  it('breaks on a left repeat barline (starts a new group) and a right one (ends the group)', () => {
    const forward = '<barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>';
    const backward = '<barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"/></barline>';
    expect(run(score([N, R, R, forward + R, R, R + backward, R, R])).groups).toEqual([
      { start: 1, length: 2 },
      { start: 3, length: 3 },
      { start: 6, length: 2 },
    ]);
  });

  it('a barline without location is a right barline', () => {
    const dbl = '<barline><bar-style>light-light</bar-style></barline>';
    expect(run(score([R, R + dbl, R, R])).groups).toEqual([
      { start: 0, length: 2 },
      { start: 2, length: 2 },
    ]);
  });

  it('breaks on voltas (endings)', () => {
    const start1 = '<barline location="left"><ending number="1" type="start"/></barline>';
    const stop1 = '<barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>';
    const start2 = '<barline location="left"><ending number="2" type="start"/></barline>';
    expect(run(score([R, R, start1 + R, R + stop1, start2 + R, R])).groups).toEqual([
      { start: 0, length: 2 },
      { start: 2, length: 2 },
      { start: 4, length: 2 },
    ]);
  });

  it('a regular barline does not break', () => {
    const regular = '<barline location="right"><bar-style>regular</bar-style></barline>';
    expect(run(score([R + regular, R, R])).groups).toEqual([{ start: 0, length: 3 }]);
  });

  it('never groups a pickup (implicit) measure', () => {
    expect(run(score(['PICKUP:' + R, R, R])).groups).toEqual([{ start: 1, length: 2 }]);
  });

  it('is idempotent: an already grouped score is returned untouched with its groups', () => {
    const once = run(score([N, R, R, R, N]));
    const twice = run(once.xml);
    expect(twice.xml).toBe(once.xml);
    expect(twice.groups).toEqual([{ start: 1, length: 3 }]);
    expect(multiRests(twice.xml)).toEqual([0, 3, 0, 0, 0]);
  });

  it('returns the input unchanged when nothing can be grouped', () => {
    const xml = score([N, N, N]);
    expect(run(xml)).toEqual({ xml, groups: [] });
  });
});
