// Spike S2/S3/S4 : rendu Verovio du MusicXML exporté par webmscore.
// Usage : node s2-verovio/run.mjs <dossier de sortie S1> [--parts=P1,P2] [--transpose=M2] [--w=1080 --h=2200 --scale=40] [--tag=xxx]
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

const args = Object.fromEntries(process.argv.slice(3).map(a => a.replace(/^--/, '').split('=')));
const srcDir = process.argv[2];
const t = () => performance.now();

const t0 = t();
const vrv = new VerovioToolkit(await createVerovioModule());
console.log(`verovio ${vrv.getVersion()} ready in ${(t() - t0).toFixed(0)} ms`);

let xml = await readFile(join(srcDir, 'score.musicxml'), 'utf8');

// Filtrage naïf des parties (le vrai filtrage utilisera un parseur XML).
if (args.parts) {
  const keep = new Set(args.parts.split(','));
  xml = xml.replace(/<score-part id="([^"]+)">[\s\S]*?<\/score-part>\s*/g, (m, id) => keep.has(id) ? m : '');
  xml = xml.replace(/<part id="([^"]+)">[\s\S]*?<\/part>\s*/g, (m, id) => keep.has(id) ? m : '');
  xml = xml.replace(/<part-group type="start"[\s\S]*?<\/part-group>\s*|<part-group type="stop"[^>]*\/>\s*|<part-group[^>]*type="stop"[^>]*>[\s\S]*?<\/part-group>\s*/g, '');
}

// Écran de téléphone en portrait : 1080 x 2200 px. Verovio travaille en unités internes (pixels * 100 / scale).
const W = +(args.w ?? 1080), H = +(args.h ?? 2200), scale = +(args.scale ?? 40);
const options = {
  pageWidth: Math.round(W * 100 / scale),
  pageHeight: Math.round(H * 100 / scale),
  pageMarginTop: 50, pageMarginBottom: 50, pageMarginLeft: 50, pageMarginRight: 50,
  scale,
  breaks: 'auto',
  adjustPageHeight: false,
  header: 'none', footer: 'none',
  svgViewBox: true,
  mnumInterval: 0,
  ...(args.transpose ? { transpose: args.transpose } : {}),
};
vrv.setOptions(options);
let s = t();
const ok = vrv.loadData(xml);
const loadMs = t() - s;
const pages = vrv.getPageCount();
s = t();
const svg1 = vrv.renderToSVG(1);
const renderMs = t() - s;
s = t();
const tm = vrv.renderToTimemap({ includeMeasures: true });
const timemap = typeof tm === "string" ? JSON.parse(tm) : tm;
const timemapMs = t() - s;
// Relayout : simulation d'un changement de zoom.
s = t();
vrv.setOptions({ scale: scale * 1.25, pageWidth: Math.round(W * 100 / (scale * 1.25)), pageHeight: Math.round(H * 100 / (scale * 1.25)) });
vrv.redoLayout();
const relayoutMs = t() - s;
const pagesZoomed = vrv.getPageCount();

const tag = args.tag ?? 'default';
const out = join(new URL('./out/', import.meta.url).pathname, basename(srcDir), tag);
await mkdir(out, { recursive: true });
await writeFile(join(out, 'page-1.svg'), svg1);
await writeFile(join(out, 'page-1.png'), new Resvg(svg1, { fitTo: { mode: 'width', value: W }, background: 'white', font: { loadSystemFonts: true } }).render().asPng());
await writeFile(join(out, 'timemap.json'), JSON.stringify(timemap));
const measuresInTimemap = timemap.filter(e => e.measureOn).length;
const report = {
  src: basename(srcDir), tag, loaded: ok, options, pages, pagesZoomed,
  ms: { load: Math.round(loadMs), renderPage1: Math.round(renderMs), timemap: Math.round(timemapMs), relayoutZoom: Math.round(relayoutMs) },
  timemap: { entries: timemap.length, measureOnEvents: measuresInTimemap, lastMs: timemap.at(-1)?.tstamp },
  svgMeasuresPage1: (svg1.match(/class="measure"/g) ?? []).length,
  log: String(vrv.getLog()).split('\n').filter(Boolean).slice(0, 15),
};
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
