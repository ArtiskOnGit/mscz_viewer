import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { IMPORTER_VERSION, ImportError, importScore, reimportScore } from './importScore';
import type { ScoreEngine } from './scoreEngine';
import { LibraryRepository } from '../storage/libraryRepository';
import { MemoryFileStore } from '../storage/fileStore';
import { xmlEnv } from '../../test/xmlEnv';
import { parseMidi } from '../audio/midiFile';

const MUSICXML = `<?xml version="1.0"?><score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Trumpet in B♭</part-name></score-part><score-part id="P2"><part-name>Tuba</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction><direction-type><rehearsal>A</rehearsal></direction-type></direction></measure>
    <measure number="2"/>
  </part>
  <part id="P2"><measure number="1"/><measure number="2"/></part>
</score-partwise>`;

const fakeEngine = (overrides: Partial<Awaited<ReturnType<ScoreEngine['convert']>>['metadata']> = {}): ScoreEngine & { calls: number } => {
  const engine = {
    calls: 0,
    async convert() {
      engine.calls++;
      return {
        musicXml: MUSICXML,
        positions: { events: [{ elid: 0, position: 0 }, { elid: 1, position: 2000 }] },
        metadata: { title: 'Toccata', composer: 'Composer / arranger', mscoreVersion: '3.6.2', duration: 4, tempo: 120, parts: [{ name: 'Trumpet', instrumentId: 'bb-trumpet', program: 56 }, { name: 'Tuba' }], ...overrides },
      };
    },
  };
  return engine;
};

const MSCX = '<museScore version="3.02"><Score><Part><trackName>Trumpet</trackName></Part><Part><show>0</show><trackName>Tuba</trackName></Part></Score></museScore>';
const msczBytes = () => zipSync({ 'score.mscx': strToU8(MSCX), 'Thumbnails/thumbnail.png': new Uint8Array([137, 80, 78, 71]) });

function setup(engine: ScoreEngine = fakeEngine()) {
  const fs = new MemoryFileStore();
  const repo = new LibraryRepository(fs);
  const deps = { repo, engine, xml: xmlEnv, now: () => new Date('2026-11-25T10:00:00Z'), newId: () => 'id-1' };
  return { fs, repo, engine, deps };
}

describe('importScore', () => {
  it('imports a .mscz: score entry, files, parts, rehearsal marks, timeline, thumbnail', async () => {
    const { fs, repo, deps } = setup();
    const outcome = await importScore({ name: 'Toccata_v2.mscz', bytes: msczBytes() }, deps);
    expect(outcome.status).toBe('imported');
    const score = (await repo.list())[0]!;
    expect(score).toMatchObject({
      id: 'id-1', title: 'Toccata', composer: undefined, sourceFormat: 'mscz', museScoreVersion: '3.6.2',
      measures: 2, durationSec: 4, initialTempoBpm: 120, importedAt: '2026-11-25T10:00:00.000Z',
      rehearsalMarks: [{ label: 'A', measureIndex: 0 }],
    });
    expect(score.parts).toEqual([
      { index: 0, musicXmlId: 'P1', name: 'Trumpet in B♭', instrumentId: 'bb-trumpet', midiProgram: 56 },
      { index: 1, musicXmlId: 'P2', name: 'Tuba', instrumentId: undefined, midiProgram: undefined, hiddenInSource: true },
    ]);
    expect(score.importerVersion).toBe(IMPORTER_VERSION);
    expect([...fs.files.keys()].sort()).toEqual([
      'library.json', 'scores/id-1/original.mscz', 'scores/id-1/score.musicxml', 'scores/id-1/thumbnail.png', 'scores/id-1/timeline.json',
    ]);
    expect((await repo.readTimeline('id-1'))?.events.map((e) => e.durationMs)).toEqual([2000, 2000]);
  });

  it('falls back to the file name when the title is a MuseScore placeholder', async () => {
    const { deps } = setup(fakeEngine({ title: 'Untitled score' }));
    const outcome = await importScore({ name: 'unity_transposé_.mscz', bytes: msczBytes() }, deps);
    expect(outcome.status === 'imported' && outcome.score.title).toBe('unity transposé');
  });

  it('detects duplicates by content hash without calling the engine again', async () => {
    const engine = fakeEngine();
    const { deps } = setup(engine);
    await importScore({ name: 'a.mscz', bytes: msczBytes() }, deps);
    const second = await importScore({ name: 'copy.mscz', bytes: msczBytes() }, { ...deps, newId: () => 'id-2' });
    expect(second.status).toBe('duplicate');
    expect(engine.calls).toBe(1);
  });

  it('rejects unknown formats and empty files with typed errors', async () => {
    const { deps } = setup();
    await expect(importScore({ name: 'notes.pdf', bytes: new Uint8Array([1, 2, 3]) }, deps)).rejects.toMatchObject({ code: 'unsupportedFormat' });
    await expect(importScore({ name: 'empty.mscz', bytes: new Uint8Array() }, deps)).rejects.toBeInstanceOf(ImportError);
  });

  it('wraps engine failures', async () => {
    const { deps } = setup({ async convert() { throw new Error('null function or function signature mismatch'); } });
    await expect(importScore({ name: 'x.mscz', bytes: msczBytes() }, deps)).rejects.toMatchObject({ code: 'engineFailed' });
  });
});

describe('MIDI file (audio playback)', () => {
  // webmscore: one track per staff named after the part; trumpet on channels 0 (open) and 1 (mute), tuba on 2.
  const track = (name: string, channel: number) => {
    const body = [0, 0xff, 0x03, name.length, ...[...name].map((c) => c.charCodeAt(0)), 0, 0x90 | channel, 60, 100, 0x60, 0x80 | channel, 60, 0, 0, 0xff, 0x2f, 0];
    return [0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, body.length, ...body];
  };
  const midi = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 3, 1, 0xe0, ...track('Trumpet', 0), ...track('Trumpet', 1), ...track('Tuba', 2)]);
  const withMidi = (): ScoreEngine => {
    const base = fakeEngine();
    return { convert: async (format, bytes) => ({ ...(await base.convert(format, bytes)), midi }) };
  };

  it('stores the MIDI file and the channels of each part', async () => {
    const { fs, repo, deps } = setup(withMidi());
    await importScore({ name: 'a.mscz', bytes: msczBytes() }, deps);
    const score = (await repo.list())[0]!;
    expect(score.hasMidi).toBe(true);
    // 3 tracks for 2 parts of one staff: matched by name.
    expect(score.parts.map((p) => p.midiChannels)).toEqual([[0, 1], [2]]);
    expect(fs.files.has('scores/id-1/score.mid')).toBe(true);
    expect(await repo.readMidi('id-1')).toEqual(midi);
  });

  it('separates channels shared by two parts (past 16 channels) before storing the MIDI file', async () => {
    const shared = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 1, 0xe0, ...track('Trumpet', 0), ...track('Tuba', 0)]);
    const base = fakeEngine();
    const { repo, deps } = setup({ convert: async (f, b) => ({ ...(await base.convert(f, b)), midi: shared }) });
    await importScore({ name: 'a.mscz', bytes: msczBytes() }, deps);
    const score = (await repo.list())[0]!;
    expect(score.parts.map((p) => p.midiChannels)).toEqual([[0], [1]]);
    const stored = await repo.readMidi('id-1');
    expect(stored).not.toEqual(shared);
    expect(parseMidi(stored!).tracks.map((t) => t.channels)).toEqual([[0], [1]]);
  });

  it('imports without audio when the engine gives no (readable) MIDI file', async () => {
    const base = fakeEngine();
    const { repo, deps } = setup({ convert: async (f, b) => ({ ...(await base.convert(f, b)), midi: new Uint8Array([1, 2, 3]) }) });
    await importScore({ name: 'a.mscz', bytes: msczBytes() }, deps);
    const score = (await repo.list())[0]!;
    expect(score.hasMidi).toBe(false);
    expect(await repo.readMidi('id-1')).toBeUndefined();
  });
});

describe('reimportScore', () => {
  it('converts the stored original again, keeping id, title and import date', async () => {
    const engine = fakeEngine();
    const { repo, deps } = setup(engine);
    await importScore({ name: 'a.mscz', bytes: msczBytes() }, deps);
    await repo.update('id-1', { title: 'My title', importerVersion: 1, parts: [] });
    const updated = await reimportScore((await repo.get('id-1'))!, deps);
    expect(engine.calls).toBe(2);
    expect(updated).toMatchObject({ id: 'id-1', title: 'My title', importedAt: '2026-11-25T10:00:00.000Z', importerVersion: IMPORTER_VERSION });
    expect(updated.parts).toHaveLength(2);
    expect((await repo.get('id-1'))?.parts[1]?.hiddenInSource).toBe(true);
  });
});

describe('LibraryRepository', () => {
  it('persists the index and removes score files', async () => {
    const { fs, repo, deps } = setup();
    await importScore({ name: 'a.mscz', bytes: msczBytes() }, deps);
    await repo.update('id-1', { title: 'Renamed' });
    const reloaded = new LibraryRepository(fs);
    expect((await reloaded.get('id-1'))?.title).toBe('Renamed');
    await reloaded.remove('id-1');
    expect([...fs.files.keys()]).toEqual(['library.json']);
    expect(await new LibraryRepository(fs).list()).toEqual([]);
  });
});
