// Spike S3 : comparer la timeline MuseScore (webmscore savePositions) et la timemap Verovio.
// Usage : node s3-timeline/compare.mjs <dossier de sortie S1> [...]
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

const vrv = new VerovioToolkit(await createVerovioModule());
for (const dir of process.argv.slice(2)) {
  const ms = JSON.parse(await readFile(join(dir, 'positions-measures.json'), 'utf8'));
  vrv.setOptions({ breaks: 'auto' });
  vrv.loadData(await readFile(join(dir, 'score.musicxml'), 'utf8'));
  // Rang de chaque mesure dans l'ordre du document MEI.
  const mei = vrv.getMEI();
  const ids = [...mei.matchAll(/<measure\b[^>]*xml:id="([^"]+)"/g)].map(m => m[1]);
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  const tm = vrv.renderToTimemap({ includeMeasures: true });
  const vEvents = (typeof tm === 'string' ? JSON.parse(tm) : tm)
    .filter(e => e.measureOn).map(e => ({ idx: indexOf.get(e.measureOn) ?? indexOf.get(e.measureOn.replace(/-rend\d+$/, "")), ms: e.tstamp }));
  const mEvents = ms.events.map(e => ({ idx: e.elid, ms: e.position }));
  const n = Math.min(vEvents.length, mEvents.length);
  let orderMismatch = 0, firstMismatch = null, maxDrift = 0, driftAt = null;
  for (let i = 0; i < n; i++) {
    if (vEvents[i].idx !== mEvents[i].idx) { orderMismatch++; firstMismatch ??= { i, verovio: vEvents[i], musescore: mEvents[i] }; }
    const d = Math.abs(vEvents[i].ms - mEvents[i].ms);
    if (d > maxDrift) { maxDrift = d; driftAt = { i, measure: mEvents[i].idx, verovioMs: vEvents[i].ms, musescoreMs: mEvents[i].ms }; }
  }
  console.log(JSON.stringify({
    score: basename(dir), measuresInDoc: ids.length, musescoreElements: ms.elements.length,
    events: { verovio: vEvents.length, musescore: mEvents.length },
    orderMismatch, firstMismatch, maxDriftMs: Math.round(maxDrift), driftAt,
  }, null, 1));
}
