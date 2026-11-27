// RenderService against a fake Verovio: a page is always drawn from the layout it was asked for (A → B → A
// viewport changes while laying out: blank page "37 / 52" on iPhone), missing / blank pages are errors, never shown
// nor cached.
import { describe, expect, it } from 'vitest';
import { MemoryFileStore } from '../storage/fileStore';
import { RenderCache } from './renderCache';
import { isBlankPage, RenderService, StaleRenderError, type ViewportOptions } from './renderService';
import type { LayoutInfo, RenderApi } from './render.worker';

const A: ViewportOptions = { width: 390, height: 552, scale: 24, transpose: '', concertPitch: false };
const B: ViewportOptions = { ...A, scale: 12 };

/** Fake Verovio: 50 pages at scale 24, 25 at scale 12 (fewer, as with a wider page); like Verovio, a page that does not exist is an empty `viewBox="0 0 0 0"`. */
function fakeVerovio() {
  let scale = 0;
  const log: string[] = [];
  const gates: (() => void)[] = [];
  let hold = false;
  const pause = () => (hold ? new Promise<void>((r) => gates.push(r)) : Promise.resolve());
  const info = (): LayoutInfo => {
    const pageCount = Math.round((scale * 50) / 24);
    return { pageCount, measureIds: Array.from({ length: pageCount }, (_, i) => `m${i + 1}`), measurePages: Array.from({ length: pageCount }, (_, i) => i + 1) };
  };
  const api: RenderApi = {
    version: async () => 'fake',
    async load(_xml, options) {
      await pause();
      scale = options.scale as number;
      log.push(`load ${scale}`);
      return info();
    },
    async relayout(options) {
      await pause();
      scale = options.scale as number;
      log.push(`relayout ${scale}`);
      return info();
    },
    async renderPage(n) {
      log.push(`render ${n}@${scale}`);
      return n > info().pageCount ? '<svg viewBox="0 0 0 0"></svg>' : `<svg viewBox="0 0 390 552"><g class="page-margin"><g id="m${n}" class="measure" data-scale="${scale}"/></g></svg>`;
    },
    pagesOf: async (ids) => ids.map(() => 1),
    pageOf: async () => 1,
  };
  let terminated = 0;
  return {
    log,
    terminated: () => terminated,
    hold(on: boolean) {
      hold = on;
      if (!on) gates.splice(0).forEach((g) => g());
    },
    create: () => ({ api, terminate: () => void terminated++ }),
  };
}

const scaleOf = (svg: string) => Number(/data-scale="(\d+)"/.exec(svg)?.[1]);

describe('RenderService', () => {
  it('A → B → A while B is being laid out: page 37 of A is drawn from A, never B (blank page bug)', async () => {
    const v = fakeVerovio();
    const r = new RenderService(null, v.create);
    expect((await r.load('<xml/>', A)).pageCount).toBe(50);
    v.hold(true);
    const toB = r.relayout(B); // the worker is busy laying out B (25 pages)
    const toA = r.relayout(A);
    const page = r.page(37);
    v.hold(false);
    await toB;
    expect((await toA).pageCount).toBe(50);
    const svg = await page;
    expect(isBlankPage(svg)).toBe(false);
    expect(scaleOf(svg)).toBe(24);
    expect(v.log.at(-1)).toBe('render 37@24');
  });

  it('a page asked for before a relayout is drawn from its own layout, or dropped as stale', async () => {
    const v = fakeVerovio();
    const r = new RenderService(null, v.create);
    await r.load('<xml/>', A);
    v.hold(true);
    const toB = r.relayout(B);
    const late = r.page(37); // asked during the relayout: belongs to B (25 pages) → error, not a blank page
    v.hold(false);
    await toB;
    await expect(late).rejects.toThrow(/does not exist/);
    const old = r.page(3);
    void r.relayout(A);
    await expect(old).rejects.toBeInstanceOf(StaleRenderError);
  });

  it('a page that does not exist is an error, never a blank page', async () => {
    const v = fakeVerovio();
    const r = new RenderService(null, v.create);
    await r.load('<xml/>', B);
    await expect(r.page(37)).rejects.toThrow(RangeError);
    expect(scaleOf(await r.page(10))).toBe(12);
  });

  it('disk cache: pages stored under the key of the layout they were drawn from; blank cached pages ignored', async () => {
    const v = fakeVerovio();
    const store = new MemoryFileStore();
    const disk = new RenderCache(store, 10_000_000);
    const r = new RenderService(disk, v.create);
    await r.load('<xml/>', A);
    expect(scaleOf(await r.page(37))).toBe(24);
    // A → B → A, B laid out by the worker while A comes back from disk at once.
    v.hold(true);
    const toB = r.relayout(B);
    const toA = r.relayout(A);
    v.hold(false);
    await Promise.all([toB, toA]);
    expect(scaleOf(await r.page(37))).toBe(24); // from disk
    expect(scaleOf(await r.page(36))).toBe(24); // from the worker, brought back to A first

    // A blank page on disk (written by an older version) is drawn again.
    const blank = [...store.files.keys()].find((k) => k.endsWith('/36.svg'))!;
    store.files.set(blank, '<svg viewBox="0 0 0 0"></svg>');
    const r2 = new RenderService(disk, v.create);
    await r2.load('<xml/>', A);
    expect(scaleOf(await r2.page(36))).toBe(24);
  });

  it('restart: a new worker, the score is loaded into it again', async () => {
    const v = fakeVerovio();
    const r = new RenderService(null, v.create);
    await r.load('<xml/>', A);
    await r.page(1);
    r.restart();
    expect(v.terminated()).toBe(1);
    expect(scaleOf(await r.page(2))).toBe(24);
    expect(v.log.filter((l) => l.startsWith('load'))).toHaveLength(2);
  });

  it('recognises blank pages', () => {
    expect(isBlankPage('<svg viewBox="0 0 0 0" version="1.1"></svg>')).toBe(true);
    expect(isBlankPage('')).toBe(true);
    expect(isBlankPage(undefined)).toBe(true);
    expect(isBlankPage('<svg viewBox="0 0 390 552"><g class="page-margin"></g></svg>')).toBe(false);
  });
});
