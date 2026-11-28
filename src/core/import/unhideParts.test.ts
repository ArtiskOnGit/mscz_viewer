import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { unhideParts } from './unhideParts';
import { xmlEnv } from '../../test/xmlEnv';

// MuseScore 3 style: an excerpt is nested as a <Score> inside the main <Score>, with its own <Part>s.
const MSCX = `<?xml version="1.0"?><museScore version="3.02"><Score>
  <Part id="1"><trackName>Tenor Sax</trackName></Part>
  <Part id="2"><Staff id="2"><isStaffVisible>0</isStaffVisible></Staff><show>0</show><trackName>Sousaphone 2</trackName></Part>
  <Part id="3"><trackName>Drums</trackName></Part>
  <Part id="4"><Staff id="4"><invisible>1</invisible></Staff><Staff id="5"><invisible>1</invisible></Staff><trackName>Piano (MS3)</trackName></Part>
  <Score><Part><show>0</show><trackName>Excerpt part</trackName></Part></Score>
</Score></museScore>`;

describe('unhideParts', () => {
  it('makes hidden top-level parts visible in a .mscz and reports them', () => {
    const mscz = zipSync({ 'META-INF/container.xml': strToU8('<rootfile full-path="song.mscx"/>'), 'song.mscx': strToU8(MSCX), 'Thumbnails/thumbnail.png': new Uint8Array([1]) });
    const r = unhideParts('mscz', mscz, xmlEnv);
    expect(r.hiddenPartIndexes).toEqual([1, 3]);
    const files = unzipSync(r.bytes);
    const text = strFromU8(files['song.mscx']!);
    expect(text).toContain('<trackName>Sousaphone 2</trackName>');
    expect(text).not.toContain('isStaffVisible');
    expect(text).not.toContain('<invisible>');
    expect(text.match(/<show>0<\/show>/g)).toHaveLength(1); // the nested excerpt is untouched
    expect(files['Thumbnails/thumbnail.png']).toEqual(new Uint8Array([1]));
  });

  it('works on a plain .mscx and returns the original bytes when nothing is hidden', () => {
    expect(unhideParts('mscx', strToU8(MSCX), xmlEnv).hiddenPartIndexes).toEqual([1, 3]);
    const plain = strToU8('<museScore><Score><Part><trackName>A</trackName></Part></Score></museScore>');
    const r = unhideParts('mscx', plain, xmlEnv);
    expect(r.hiddenPartIndexes).toEqual([]);
    expect(r.bytes).toBe(plain);
  });
});

describe('convertKeySignatures (MuseScore ≥ 4.4 key format)', () => {
  const ms47 = `<museScore version="4.70"><Score>
    <Part id="1"><Staff id="1"/><trackName>Trumpet</trackName></Part>
    <Staff id="1"><Measure><voice>
      <KeySig><concertKey>-4</concertKey><actualKey>-2</actualKey></KeySig>
    </voice></Measure></Staff>
    <Staff id="2"><Measure><voice><KeySig><concertKey>-4</concertKey></KeySig></voice></Measure></Staff>
    <Staff id="3"><Measure><voice><KeySig><custom>1</custom><mode>none</mode></KeySig></voice></Measure></Staff>
  </Score></museScore>`;

  it('rewrites concertKey/actualKey as the written key in <accidental> (MuseScore 3 format)', () => {
    const text = new TextDecoder().decode(unhideParts('mscx', strToU8(ms47), xmlEnv).bytes);
    const keys = [...text.matchAll(/<KeySig>([\s\S]*?)<\/KeySig>/g)].map((m) => m[1]!.replace(/\s+/g, ''));
    expect(keys).toEqual(['<accidental>-2</accidental>', '<accidental>-4</accidental>', '<custom>1</custom><mode>none</mode>']);
  });

  it('leaves MuseScore 3 key signatures untouched', () => {
    const ms3 = strToU8('<museScore version="3.02"><Score><Part><trackName>A</trackName></Part><Staff id="1"><Measure><voice><KeySig><accidental>2</accidental></KeySig></voice></Measure></Staff></Score></museScore>');
    expect(unhideParts('mscx', ms3, xmlEnv).bytes).toBe(ms3);
  });
});
