import { describe, expect, it } from 'vitest';
import { SetlistRepository } from './setlistRepository';
import { MemoryFileStore } from './fileStore';

function setup() {
  const fs = new MemoryFileStore();
  let n = 0;
  const repo = new SetlistRepository(fs, () => new Date('2026-11-25T10:00:00Z'), () => `id${++n}`);
  return { fs, repo };
}

describe('SetlistRepository', () => {
  it('creates, renames and persists setlists', async () => {
    const { fs, repo } = setup();
    const s = await repo.create('  Christmas concert ', '2026-12-20');
    expect(s).toMatchObject({ id: 'id1', name: 'Christmas concert', date: '2026-12-20', items: [] });
    await repo.rename(s.id, 'Christmas');
    await repo.rename(s.id, '   '); // an empty name keeps the previous one
    expect((await new SetlistRepository(fs).get(s.id))?.name).toBe('Christmas');
  });

  it('adds items (same score allowed twice), removes and reorders them', async () => {
    const { repo } = setup();
    const s = await repo.create('Rehearsal');
    await repo.addScores(s.id, ['a', 'b', 'a']);
    const items = (await repo.get(s.id))!.items;
    expect(items.map((i) => i.scoreId)).toEqual(['a', 'b', 'a']);
    expect(items.map((i) => i.id)).toEqual(['id2', 'id3', 'id4']);
    await repo.moveItem(s.id, 2, 0);
    expect((await repo.get(s.id))!.items.map((i) => i.id)).toEqual(['id4', 'id2', 'id3']);
    await repo.moveItem(s.id, 0, 99);
    expect((await repo.get(s.id))!.items.map((i) => i.id)).toEqual(['id2', 'id3', 'id4']);
    await repo.removeItem(s.id, 'id3');
    expect((await repo.get(s.id))!.items.map((i) => i.scoreId)).toEqual(['a', 'a']);
  });

  it('sets and clears notes and overrides', async () => {
    const { repo } = setup();
    const s = await repo.create('Gig');
    await repo.addScores(s.id, ['a']);
    const itemId = (await repo.get(s.id))!.items[0]!.id;
    await repo.setNote(s.id, itemId, ' Start on the conductor ');
    await repo.setOverride(s.id, itemId, { selectedParts: ['P2'], transposeSemitones: 2 });
    await repo.setOverride(s.id, itemId, { transposeSemitones: undefined });
    let item = (await repo.get(s.id))!.items[0]!;
    expect(item).toMatchObject({ note: 'Start on the conductor', override: { selectedParts: ['P2'] } });
    expect(item.override).not.toHaveProperty('transposeSemitones');
    await repo.setNote(s.id, itemId, '');
    await repo.setOverride(s.id, itemId, { selectedParts: undefined });
    item = (await repo.get(s.id))!.items[0]!;
    expect(item).not.toHaveProperty('note');
    expect(item).not.toHaveProperty('override');
  });

  it('duplicates with new ids and copied overrides', async () => {
    const { repo } = setup();
    const s = await repo.create('A');
    await repo.addScores(s.id, ['x']);
    const itemId = (await repo.get(s.id))!.items[0]!.id;
    await repo.setOverride(s.id, itemId, { selectedParts: ['P1'] });
    const copy = (await repo.duplicate(s.id, 'A (copy)'))!;
    expect(copy.name).toBe('A (copy)');
    expect(copy.id).not.toBe(s.id);
    expect(copy.items[0]!.id).not.toBe(itemId);
    expect(copy.items[0]!.override).toEqual({ selectedParts: ['P1'] });
    expect(await repo.list()).toHaveLength(2);
  });

  it('removes a deleted score everywhere and reports the affected setlists', async () => {
    const { repo } = setup();
    const a = await repo.create('A');
    const b = await repo.create('B');
    await repo.create('C');
    await repo.addScores(a.id, ['x', 'y', 'x']);
    await repo.addScores(b.id, ['x']);
    expect(await repo.removeScoreEverywhere('x')).toEqual(['A', 'B']);
    expect((await repo.get(a.id))!.items.map((i) => i.scoreId)).toEqual(['y']);
    expect((await repo.get(b.id))!.items).toEqual([]);
    expect(await repo.removeScoreEverywhere('zzz')).toEqual([]);
  });

  it('deletes a setlist', async () => {
    const { repo } = setup();
    const s = await repo.create('A');
    await repo.remove(s.id);
    expect(await repo.list()).toEqual([]);
  });
});
