import { describe, expect, it } from 'vitest';
import { MemoryFileStore } from '../storage/fileStore';
import { RenderCache, renderKey, sha256Hex, stableJson, type CachedLayout } from './renderCache';
import { verovioOptions } from './renderService';

const layout: CachedLayout = { pageCount: 2, measureIds: ['a', 'b'], measurePages: [1, 2] };

function setup(maxBytes = 1000) {
  const store = new MemoryFileStore();
  let t = 0;
  const cache = new RenderCache(store, maxBytes, () => ++t);
  return { store, cache };
}

describe('render cache key', () => {
  const viewport = { width: 412, height: 780, scale: 40, transpose: '', concertPitch: false };

  it('is stable whatever the order of the options', async () => {
    expect(stableJson({ b: 1, a: { d: [1, 'x'], c: true }, u: undefined })).toBe('{"a":{"c":true,"d":[1,"x"]},"b":1}');
    const h = await sha256Hex('<xml/>');
    expect(await renderKey(h, { scale: 40, breaks: 'auto' }, 'v')).toBe(await renderKey(h, { breaks: 'auto', scale: 40 }, 'v'));
  });

  it('changes with any Verovio option, the display XML and the renderer version', async () => {
    const h = await sha256Hex('<xml/>');
    const base = await renderKey(h, verovioOptions(viewport), 'v1');
    const variants = [
      await renderKey(h, verovioOptions({ ...viewport, scale: 41 }), 'v1'),
      await renderKey(h, verovioOptions({ ...viewport, width: 800 }), 'v1'),
      await renderKey(h, verovioOptions({ ...viewport, transpose: 'M2' }), 'v1'),
      await renderKey(h, verovioOptions({ ...viewport, concertPitch: true }), 'v1'),
      await renderKey(h, verovioOptions({ ...viewport, continuous: true }), 'v1'),
      // Any option added to verovioOptions later (music font…) is part of the key too.
      await renderKey(h, { ...verovioOptions(viewport), font: 'Bravura' }, 'v1'),
      await renderKey(await sha256Hex('<xml2/>'), verovioOptions(viewport), 'v1'),
      await renderKey(h, verovioOptions(viewport), 'v2'),
    ];
    expect(new Set([base, ...variants]).size).toBe(variants.length + 1);
  });
});

describe('RenderCache', () => {
  it('keeps the layout and the pages, also for a new instance (on disk)', async () => {
    const { store, cache } = setup();
    expect(await cache.getLayout('k')).toBeUndefined();
    await cache.putLayout('k', layout);
    await cache.putPage('k', 1, '<svg>1</svg>');
    expect(await cache.getLayout('k')).toEqual(layout);
    expect(await cache.getPage('k', 1)).toBe('<svg>1</svg>');
    expect(await cache.getPage('k', 2)).toBeUndefined();
    await cache.flush();
    const again = new RenderCache(store, 1000);
    expect(await again.getLayout('k')).toEqual(layout);
    expect(await again.getPage('k', 1)).toBe('<svg>1</svg>');
    expect(await again.size()).toBe(JSON.stringify(layout).length + '<svg>1</svg>'.length);
  });

  it('ignores pages of an unknown layout', async () => {
    const { cache } = setup();
    await cache.putPage('nope', 1, '<svg/>');
    expect(await cache.getPage('nope', 1)).toBeUndefined();
    expect(await cache.size()).toBe(0);
  });

  it('evicts the least recently used entries beyond its size', async () => {
    const { store, cache } = setup(500); // room for 3 entries (layout ≈ 60 + page 100)
    const page = 'x'.repeat(100);
    for (const k of ['a', 'b', 'c']) {
      await cache.putLayout(k, layout);
      await cache.putPage(k, 1, page);
    }
    await cache.getLayout('a'); // "a" used again: "b" is now the oldest
    await cache.putLayout('d', layout);
    await cache.putPage('d', 1, page);
    expect(await cache.getLayout('b')).toBeUndefined();
    expect(await cache.getLayout('a')).toEqual(layout);
    expect(await cache.getLayout('d')).toEqual(layout);
    expect([...store.files.keys()].some((f) => f.startsWith('render-cache/b/'))).toBe(false);
    expect(await cache.size()).toBeLessThanOrEqual(500);
  });

  it('is cleared', async () => {
    const { store, cache } = setup();
    await cache.putLayout('k', layout);
    await cache.putPage('k', 1, '<svg/>');
    await cache.flush();
    await cache.clear();
    expect(await cache.size()).toBe(0);
    expect(await cache.getLayout('k')).toBeUndefined();
    expect(store.files.size).toBe(0);
  });

  it('forgets an entry whose files are gone (cache directory cleared by Android)', async () => {
    const { store, cache } = setup();
    await cache.putLayout('k', layout);
    await cache.putPage('k', 1, '<svg/>');
    store.files.clear();
    expect(await cache.getPage('k', 1)).toBeUndefined();
    expect(await cache.getLayout('k')).toBeUndefined();
    expect(await cache.size()).toBe(0);
  });
});
