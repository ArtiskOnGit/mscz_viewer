import { describe, expect, it } from 'vitest';
import { FolderCycleError, LIBRARY_SCHEMA_VERSION, LibraryRepository } from './libraryRepository';
import { MemoryFileStore } from './fileStore';
import type { Score } from '../model/types';
import { folderIdOfPath, folderPath, folderTree, itemCount } from '../model/folders';

const score = (id: string, folderId?: string): Score => ({
  id,
  title: id,
  originalTitle: id,
  sourceFormat: 'mscz',
  sourceFileName: `${id}.mscz`,
  sourceHash: `hash-${id}`,
  importedAt: '2026-11-01T10:00:00Z',
  importerVersion: 5,
  measures: 10,
  parts: [],
  rehearsalMarks: [],
  tags: [],
  ...(folderId ? { folderId } : {}),
});

function setup(fs = new MemoryFileStore()) {
  let n = 0;
  const repo = new LibraryRepository(fs, () => new Date('2026-11-28T10:00:00Z'), () => `f${++n}`);
  return { fs, repo };
}

const files = { original: { bytes: new Uint8Array([1]), ext: 'mscz' }, musicXml: '<score/>', timeline: { source: 'verovio' as const, events: [], totalMs: 0 } };
const index = (fs: MemoryFileStore) => JSON.parse(fs.files.get('library.json') as string);

describe('LibraryRepository folders', () => {
  it('migrates a schema 1 library: no folders, every score at the root', async () => {
    const fs = new MemoryFileStore();
    fs.files.set('library.json', JSON.stringify({ schemaVersion: 1, scores: [score('a'), score('b')] }));
    const { repo } = setup(fs);
    expect(await repo.listFolders()).toEqual([]);
    expect((await repo.list()).map((s) => [s.id, s.folderId])).toEqual([['a', undefined], ['b', undefined]]);
    await repo.createFolder('Christmas');
    expect(index(fs).schemaVersion).toBe(LIBRARY_SCHEMA_VERSION);
    expect(index(fs).folders).toHaveLength(1);
    expect(index(fs).scores).toHaveLength(2);
  });

  it('refuses a library from a newer app', async () => {
    const fs = new MemoryFileStore();
    fs.files.set('library.json', JSON.stringify({ schemaVersion: LIBRARY_SCHEMA_VERSION + 1, scores: [] }));
    await expect(setup(fs).repo.list()).rejects.toThrow(/newer/);
  });

  it('repairs dangling references and cycles read from disk', async () => {
    const fs = new MemoryFileStore();
    fs.files.set(
      'library.json',
      JSON.stringify({
        schemaVersion: 2,
        folders: [
          { id: 'x', name: 'X', parentId: 'y', createdAt: '' },
          { id: 'y', name: 'Y', parentId: 'x', createdAt: '' },
          { id: 'z', name: 'Z', parentId: 'gone', createdAt: '' },
        ],
        scores: [score('a', 'gone'), score('b', 'x')],
      }),
    );
    const { repo } = setup(fs);
    const folders = await repo.listFolders();
    expect(folders.find((f) => f.id === 'z')!.parentId).toBeUndefined();
    expect(folders.filter((f) => !f.parentId).length).toBeGreaterThanOrEqual(2); // the cycle is broken
    expect(folderTree(folders, (a, b) => a.localeCompare(b))).toHaveLength(3); // every folder reachable from the root
    const scores = await repo.list();
    expect(scores.find((s) => s.id === 'a')!.folderId).toBeUndefined();
    expect(scores.find((s) => s.id === 'b')!.folderId).toBe('x');
  });

  it('creates nested folders, renames them and persists', async () => {
    const { fs, repo } = setup();
    const a = await repo.createFolder('  Concerts ');
    const b = await repo.createFolder('2026', a.id);
    const c = await repo.createFolder('Orphan', 'unknown');
    expect(a).toEqual({ id: 'f1', name: 'Concerts', createdAt: '2026-11-28T10:00:00.000Z' });
    expect(b.parentId).toBe(a.id);
    expect(c.parentId).toBeUndefined();
    await expect(repo.createFolder('   ')).rejects.toThrow();
    await repo.renameFolder(b.id, 'Season 2026');
    await repo.renameFolder(b.id, '  '); // an empty name keeps the previous one
    const reloaded = new LibraryRepository(fs);
    expect(folderPath(await reloaded.listFolders(), b.id).map((f) => f.name)).toEqual(['Concerts', 'Season 2026']);
  });

  it('creates a folder with a colour, changes it, back to the default, and persists it by name', async () => {
    const { fs, repo } = setup();
    const plain = await repo.createFolder('Plain');
    const red = await repo.createFolder('Red', undefined, 'red');
    expect(plain.color).toBeUndefined(); // default colour: no field
    expect(red.color).toBe('red');
    await repo.setFolderColor(plain.id, 'green');
    await repo.setFolderColor(red.id, undefined);
    const stored = index(fs).folders as { name: string; color?: string }[];
    expect(stored.map((f) => [f.name, f.color])).toEqual([['Plain', 'green'], ['Red', undefined]]);
    expect('color' in stored[1]!).toBe(false);
    expect(index(fs).schemaVersion).toBe(LIBRARY_SCHEMA_VERSION); // optional field: no schema change
    const reloaded = new LibraryRepository(fs);
    expect((await reloaded.listFolders()).map((f) => f.color)).toEqual(['green', undefined]);
  });

  it('ignores an unknown colour (in a call or read from disk): the default colour', async () => {
    const fs = new MemoryFileStore();
    fs.files.set(
      'library.json',
      JSON.stringify({ schemaVersion: 2, folders: [{ id: 'x', name: 'X', createdAt: '', color: 'chartreuse' }, { id: 'y', name: 'Y', createdAt: '', color: 'blue' }], scores: [] }),
    );
    const { repo } = setup(fs);
    expect((await repo.listFolders()).map((f) => f.color)).toEqual([undefined, 'blue']);
    await repo.setFolderColor('y', 'magenta' as never);
    expect((await repo.listFolders()).map((f) => f.color)).toEqual([undefined, undefined]);
    expect((await repo.createFolder('Z', undefined, 'teal' as never)).color).toBeUndefined();
  });

  it('keeps the colour of a folder when it is renamed or moved', async () => {
    const { repo } = setup();
    const a = await repo.createFolder('A', undefined, 'purple');
    const b = await repo.createFolder('B');
    await repo.renameFolder(a.id, 'A2');
    await repo.moveFolder(a.id, b.id);
    expect((await repo.listFolders()).find((f) => f.id === a.id)).toMatchObject({ name: 'A2', parentId: b.id, color: 'purple' });
  });

  it('moves scores into a folder and back to the root', async () => {
    const { fs, repo } = setup();
    await repo.add(score('a'), files);
    await repo.add(score('b'), files);
    const f = await repo.createFolder('Jazz');
    await repo.moveScores(['a', 'b'], f.id);
    expect((await repo.list()).map((s) => s.folderId)).toEqual([f.id, f.id]);
    await repo.moveScores(['b'], undefined);
    expect((await repo.list()).map((s) => s.folderId)).toEqual([f.id, undefined]);
    expect('folderId' in index(fs).scores[1]).toBe(false);
    await expect(repo.moveScores(['a'], 'nope')).rejects.toThrow();
    expect(itemCount(await repo.listFolders(), await repo.list(), f.id)).toBe(1);
  });

  it('deletes a folder: its scores and sub-folders move to the parent, no score is deleted', async () => {
    const { fs, repo } = setup();
    const top = await repo.createFolder('Top');
    const mid = await repo.createFolder('Mid', top.id);
    const low = await repo.createFolder('Low', mid.id);
    await repo.add(score('a', mid.id), files);
    await repo.add(score('b', low.id), files);
    await repo.deleteFolder(mid.id);
    expect((await repo.listFolders()).map((f) => [f.name, f.parentId])).toEqual([['Top', undefined], ['Low', top.id]]);
    expect((await repo.list()).map((s) => [s.id, s.folderId])).toEqual([['a', top.id], ['b', low.id]]);
    await repo.deleteFolder(top.id); // to the root
    expect((await repo.listFolders()).map((f) => [f.name, f.parentId])).toEqual([['Low', undefined]]);
    expect((await repo.list()).find((s) => s.id === 'a')!.folderId).toBeUndefined();
    expect(fs.files.has('scores/a/score.musicxml')).toBe(true);
  });

  it('moves folders and prevents cycles', async () => {
    const { repo } = setup();
    const a = await repo.createFolder('A');
    const b = await repo.createFolder('B', a.id);
    const c = await repo.createFolder('C', b.id);
    const d = await repo.createFolder('D');
    await expect(repo.moveFolder(a.id, a.id)).rejects.toBeInstanceOf(FolderCycleError);
    await expect(repo.moveFolder(a.id, c.id)).rejects.toBeInstanceOf(FolderCycleError);
    await expect(repo.moveFolder(b.id, 'nope')).rejects.toThrow();
    await repo.moveFolder(b.id, d.id);
    expect(folderPath(await repo.listFolders(), c.id).map((f) => f.name)).toEqual(['D', 'B', 'C']);
    await repo.moveFolder(a.id, c.id); // allowed now: C is no longer inside A
    await repo.moveFolder(b.id, undefined);
    expect(folderPath(await repo.listFolders(), a.id).map((f) => f.name)).toEqual(['B', 'C', 'A']);
  });

  it('keeps the folder of a score through rename and re-import', async () => {
    const { repo } = setup();
    const f = await repo.createFolder('F');
    await repo.add(score('a', f.id), files);
    await repo.update('a', { title: 'New' });
    await repo.replace({ ...score('a', f.id), importerVersion: 6 }, { musicXml: '<x/>', timeline: files.timeline });
    expect((await repo.get('a'))!.folderId).toBe(f.id);
    await repo.remove('a');
    expect(await repo.listFolders()).toHaveLength(1);
  });
});

describe('folderIdOfPath', () => {
  it('reads the folder of library URLs', () => {
    expect(folderIdOfPath('/library')).toBeUndefined();
    expect(folderIdOfPath('/viewer/abc')).toBeUndefined();
    expect(folderIdOfPath('/library/folder/abc')).toBe('abc');
    expect(folderIdOfPath('/mscz_viewer/library/folder/a%20b/')).toBe('a b');
  });
});
