// Spike S1 : charger les .mscz avec webmscore (Node) et exporter MusicXML, métadonnées, positions, SVG.
// Usage : node s1-webmscore/run.mjs <fichier.mscz> [...]
// Node >= 21 expose un `navigator` global en lecture seule : webmscore 1.2.1 plante en voulant l'écraser.
Object.defineProperty(globalThis, 'navigator', { value: {}, writable: true, configurable: true });
// Le loader Emscripten utilise fetch() s'il existe (Node >= 18) avec un chemin de fichier : on le masque le temps de l'init.
const realFetch = globalThis.fetch;
globalThis.fetch = undefined;
const { default: WebMscore } = await import('webmscore');
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

const files = process.argv.slice(2);
const OUT = new URL('./out/', import.meta.url).pathname;
const t = () => performance.now();

const t0 = t();
await WebMscore.ready;
globalThis.fetch = realFetch;
console.log(`webmscore ready in ${(t() - t0).toFixed(0)} ms, version ${await WebMscore.version?.()}`);

for (const f of files) {
  const name = basename(f).replace(/\.mscz$/, '');
  const dir = join(OUT, name);
  await mkdir(dir, { recursive: true });
  const report = { file: basename(f), steps: {} };
  const step = async (label, fn) => {
    const s = t();
    try { const r = await fn(); report.steps[label] = { ok: true, ms: Math.round(t() - s) }; return r; }
    catch (e) { report.steps[label] = { ok: false, ms: Math.round(t() - s), error: String(e?.message ?? e) }; return undefined; }
  };
  const data = new Uint8Array(await readFile(f));
  const memBefore = process.memoryUsage().rss;
  const score = await step('load', () => WebMscore.load('mscz', data, [], true));
  if (!score) { console.log(JSON.stringify(report, null, 2)); continue; }
  const meta = await step('metadata', () => score.metadata());
  if (meta) await writeFile(join(dir, 'metadata.json'), JSON.stringify(meta, null, 2));
  const xml = await step('saveXml', () => score.saveXml());
  if (xml) await writeFile(join(dir, 'score.musicxml'), xml);
  const pos = await step('savePositions(measures)', () => score.savePositions(false));
  if (pos) await writeFile(join(dir, 'positions-measures.json'), pos);
  const segpos = await step('savePositions(segments)', () => score.savePositions(true));
  if (segpos) await writeFile(join(dir, 'positions-segments.json'), segpos);
  const npages = await step('npages', () => score.npages());
  const svg = await step('saveSvg(0)', () => score.saveSvg(0, true));
  if (svg) await writeFile(join(dir, 'page-0.svg'), svg);
  const png = await step('savePng(0)', () => score.savePng(0, true));
  if (png) await writeFile(join(dir, 'page-0.png'), png);
  const midi = await step('saveMidi(expandRepeats)', () => score.saveMidi(true, true));
  if (midi) await writeFile(join(dir, 'score.mid'), midi);
  report.rssDeltaMB = Math.round((process.memoryUsage().rss - memBefore) / 1e6);
  report.summary = meta && {
    title: meta.title, composer: meta.composer, mscoreVersion: meta.mscoreVersion, fileVersion: meta.fileVersion,
    pages: meta.pages, npages, measures: meta.measures, duration: meta.duration, tempo: meta.tempo, tempoText: meta.tempoText,
    timesig: meta.timesig, keysig: meta.keysig,
    parts: meta.parts.map(p => `${p.name} [${p.instrumentId}] prog=${p.program}`),
    excerpts: meta.excerpts.map(e => `${e.id}:${e.title}`),
  };
  score.destroy();
  await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
process.exit(0);
