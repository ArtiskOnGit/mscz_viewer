// Phase 0 test bench, to open on an Android phone (Chrome ≈ Capacitor WebView).
// Measures: webmscore import (S1), Verovio rendering (S2), MuseScore timeline + page turns (S3),
// transposition (S4), Bluetooth pedal keys (S5), Web Audio metronome regularity (S6).
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { filterParts } from '../shared/filter-parts.mjs';

const $ = (id) => document.getElementById(id);
const now = () => performance.now();
const BASE_SCALE = 45; // Verovio scale for 100% zoom (≈ 33 CSS px staff height)

// ---------------------------------------------------------------- stats
const stats = {
  device: {
    userAgent: navigator.userAgent,
    devicePixelRatio: devicePixelRatio,
    viewport: `${innerWidth}x${innerHeight}`,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGB: navigator.deviceMemory,
    secureContext: isSecureContext,
    wakeLockApi: 'wakeLock' in navigator,
  },
  timings: {},
  score: {},
  render: {},
  metronome: { scheduled: 0, late: 0, minLeadMs: null, outputLatencyMs: null, baseLatencyMs: null },
  wakeLock: 'not requested',
  keys: [],
  errors: [],
};
const timing = (label, ms) => { stats.timings[label] = Math.round(ms); renderStats(); };
const heapMB = () => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : undefined);
function renderStats() {
  if ($('stats').classList.contains('open')) $('stats').textContent = JSON.stringify(stats, null, 1);
}
function fail(where, e) {
  console.error(where, e);
  stats.errors.push(`${where}: ${e?.message ?? e}`);
  setStatus(`❌ ${where}: ${e?.message ?? e}`);
  renderStats();
}
const setStatus = (s) => { $('status').textContent = s; };

// ---------------------------------------------------------------- state
const state = {
  fullXml: null, parts: [], selected: new Set(), timeline: [], measureMeta: [],
  zoom: 1, transpose: '', concert: false,
  page: 1, pageCount: 0, measureIds: [], pageOfMeasure: [], cache: new Map(),
  playing: false, tempoFactor: 1, currentEvent: -1,
};

// ---------------------------------------------------------------- lazy engine loading
// Engines are loaded only AFTER a file is picked: on Android, the browser tab (or the app) can be
// killed while the system file picker is in the foreground if it holds too much memory.
let vrv, vrvPromise, wmsPromise;
function ensureVerovio() {
  vrvPromise ??= (async () => {
    const t = now();
    vrv = new VerovioToolkit(await createVerovioModule());
    timing('verovio init', now() - t);
    stats.render.verovioVersion = vrv.getVersion();
  })();
  return vrvPromise;
}
function ensureWebMscore() {
  wmsPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = './webmscore.js';
    s.onload = () => resolve(globalThis.WebMscore);
    s.onerror = () => reject(new Error('webmscore.js failed to load'));
    document.head.append(s);
  });
  return wmsPromise;
}

// ---------------------------------------------------------------- import (S1)
$('file').addEventListener('change', async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  stop();
  try {
    setStatus(`importing ${file.name}…`);
    const ext = file.name.split('.').pop().toLowerCase();
    const format = { mscz: 'mscz', mscx: 'mscx', mxl: 'mxl', musicxml: 'musicxml', xml: 'musicxml' }[ext];
    if (!format) throw new Error(`unsupported extension .${ext}`);
    const data = new Uint8Array(await file.arrayBuffer());
    stats.score = { file: file.name, sizeKB: Math.round(data.length / 1024) };

    let t = now();
    const WebMscore = await ensureWebMscore();
    await WebMscore.ready;
    timing('webmscore ready', now() - t);
    t = now();
    const score = await WebMscore.load(format, data, [], true);
    timing('webmscore load', now() - t);
    t = now();
    const meta = await score.metadata();
    const xml = await score.saveXml();
    timing('webmscore saveXml', now() - t);
    t = now();
    const positions = JSON.parse(await score.savePositions(false));
    timing('webmscore positions', now() - t);
    score.destroy();
    stats.score = {
      ...stats.score, title: meta.title, mscoreVersion: meta.mscoreVersion, fileVersion: meta.fileVersion,
      measures: meta.measures, durationSec: meta.duration, timelineEvents: positions.events.length,
      heapAfterImportMB: heapMB(),
    };
    state.timeline = positions.events.map((e) => ({ idx: e.elid, ms: e.position }));
    loadMusicXml(xml);
    await ensureVerovio();
    layout(true);
  } catch (e) {
    fail('import', e);
  }
});

function loadMusicXml(xml) {
  state.fullXml = xml;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  state.parts = [...doc.getElementsByTagName('score-part')].map((sp) => ({
    id: sp.getAttribute('id'),
    name: sp.getElementsByTagName('part-name')[0]?.textContent ?? sp.getAttribute('id'),
  }));
  state.selected = new Set(state.parts.map((p) => p.id));
  // Time signature of each measure (from the first part), for the metronome.
  const firstPart = doc.getElementsByTagName('part')[0];
  let beats = 4, beatType = 4;
  state.measureMeta = [...firstPart.childNodes].filter((n) => n.tagName === 'measure').map((m) => {
    const time = m.getElementsByTagName('time')[0];
    if (time) {
      beats = +time.getElementsByTagName('beats')[0].textContent.split('+').reduce((a, b) => +a + +b, 0);
      beatType = +time.getElementsByTagName('beat-type')[0].textContent;
    }
    const compound = beatType === 8 && beats % 3 === 0 && beats > 3;
    return { beats, beatType, clicks: compound ? beats / 3 : beats };
  });
  state.page = 1;
  renderParts();
}

function renderParts() {
  $('parts').innerHTML = '';
  for (const p of state.parts) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.selected.has(p.id);
    cb.onchange = () => {
      cb.checked ? state.selected.add(p.id) : state.selected.delete(p.id);
      if (!state.selected.size) { state.selected.add(p.id); cb.checked = true; }
      layout(true);
    };
    label.append(cb, ' ', p.name);
    $('parts').append(label);
  }
}

// ---------------------------------------------------------------- rendering (S2, S4)
function verovioOptions() {
  const el = $('score');
  const scale = Math.round(BASE_SCALE * state.zoom);
  return {
    scale,
    pageWidth: Math.round((el.clientWidth * 100) / scale),
    pageHeight: Math.round((el.clientHeight * 100) / scale),
    pageMarginTop: 40, pageMarginBottom: 40, pageMarginLeft: 40, pageMarginRight: 40,
    breaks: 'auto', adjustPageHeight: false, header: 'none', footer: 'none', svgViewBox: true,
    transpose: state.transpose, transposeToSoundingPitch: state.concert,
  };
}

/** reload=true: parts/transposition changed (new loadData); false: only a relayout (zoom, rotation). */
function layout(reload) {
  if (!state.fullXml || !vrv) return;
  try {
    const firstMeasure = state.measureIds.length ? firstMeasureOfPage(state.page) : 0;
    vrv.setOptions(verovioOptions());
    let t = now();
    if (reload) {
      let xml = state.fullXml;
      if (state.selected.size !== state.parts.length) {
        const r = filterParts(xml, [...state.selected]);
        xml = r.xml;
        stats.render.movedSystemDirections = r.moved;
        timing('filter parts', now() - t);
      }
      t = now();
      vrv.loadData(xml);
      timing('verovio loadData', now() - t);
      t = now();
      state.measureIds = [...vrv.getMEI().matchAll(/<measure\b[^>]*xml:id="([^"]+)"/g)].map((m) => m[1]);
      timing('measure ids (getMEI)', now() - t);
    } else {
      vrv.redoLayout();
      timing('verovio redoLayout', now() - t);
    }
    t = now();
    state.pageCount = vrv.getPageCount();
    state.pageOfMeasure = state.measureIds.map((id) => vrv.getPageWithElement(id));
    timing('page map', now() - t);
    state.cache.clear();
    // Keep the same musical position after a relayout.
    const p = state.pageOfMeasure[firstMeasure] || 1;
    showPage(Math.min(p, state.pageCount));
    stats.render.pages = state.pageCount;
    stats.render.options = verovioOptions();
    stats.render.heapMB = heapMB();
    renderStats();
  } catch (e) {
    fail('layout', e);
  }
}

const firstMeasureOfPage = (page) => Math.max(0, state.pageOfMeasure.indexOf(page));

function svgFor(page) {
  const key = page;
  if (!state.cache.has(key)) {
    const t = now();
    state.cache.set(key, vrv.renderToSVG(page));
    stats.render.lastRenderToSvgMs = Math.round(now() - t);
  }
  return state.cache.get(key);
}

function showPage(page) {
  if (!state.pageCount) return;
  page = Math.max(1, Math.min(state.pageCount, page));
  const t = now();
  const cached = state.cache.has(page);
  $('score').innerHTML = svgFor(page);
  state.page = page;
  timing(cached ? 'page turn (pre-rendered)' : 'page turn (not cached)', now() - t);
  highlight(state.timeline[state.currentEvent]?.idx);
  setStatus(`page ${page}/${state.pageCount}`);
  // Pre-render neighbours while idle.
  setTimeout(() => { for (const n of [page + 1, page - 1]) if (n >= 1 && n <= state.pageCount) svgFor(n); }, 50);
}

function highlight(measureIdx) {
  document.querySelectorAll('g.measure.current').forEach((g) => g.classList.remove('current'));
  if (measureIdx == null) return;
  const id = state.measureIds[measureIdx];
  if (id) document.getElementById(id)?.classList.add('current');
}

// ---------------------------------------------------------------- navigation (S5)
$('tapNext').addEventListener('click', () => showPage(state.page + 1));
$('tapPrev').addEventListener('click', () => showPage(state.page - 1));
const NEXT = new Set(['ArrowRight', 'ArrowDown', 'PageDown', 'Space', 'Enter', 'NumpadEnter']);
const PREV = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']);
window.addEventListener('keydown', (e) => {
  stats.keys.unshift({ key: e.key, code: e.code, keyCode: e.keyCode, repeat: e.repeat, at: new Date().toISOString().slice(11, 23) });
  stats.keys.length = Math.min(stats.keys.length, 15);
  renderStats();
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (NEXT.has(e.code)) { e.preventDefault(); showPage(state.page + 1); }
  else if (PREV.has(e.code)) { e.preventDefault(); showPage(state.page - 1); }
});

$('zoomIn').onclick = () => setZoom(state.zoom * 1.15);
$('zoomOut').onclick = () => setZoom(state.zoom / 1.15);
function setZoom(z) {
  state.zoom = Math.max(0.4, Math.min(3, z));
  $('zoomLabel').textContent = `${Math.round(state.zoom * 100)}%`;
  layout(false);
}
$('transpose').onchange = (e) => { state.transpose = e.target.value; layout(true); };
$('concert').onchange = (e) => { state.concert = e.target.checked; layout(true); };
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => layout(false), 300); });
$('statsBtn').onclick = () => { $('stats').classList.toggle('open'); renderStats(); };

// ---------------------------------------------------------------- playback clock + auto page turn (S3)
let audio, anchorCtx = 0, anchorScoreMs = 0, rafId, schedTimer, wakeLock;
const scoreNow = () => anchorScoreMs + (audio.currentTime - anchorCtx) * 1000 * state.tempoFactor;
const ctxTimeOf = (scoreMs) => anchorCtx + (scoreMs - anchorScoreMs) / 1000 / state.tempoFactor;

$('play').onclick = () => (state.playing ? stop() : play());
$('tempo').onchange = (e) => {
  const f = Math.max(0.5, Math.min(1.5, +e.target.value / 100));
  if (state.playing) { anchorScoreMs = scoreNow(); anchorCtx = audio.currentTime; resetClickCursor(); }
  state.tempoFactor = f;
};

async function play() {
  if (!state.timeline.length) return;
  audio ??= new AudioContext({ latencyHint: 'interactive' });
  await audio.resume();
  stats.metronome.outputLatencyMs = audio.outputLatency != null ? Math.round(audio.outputLatency * 1000) : 'n/a';
  stats.metronome.baseLatencyMs = audio.baseLatency != null ? Math.round(audio.baseLatency * 1000) : 'n/a';
  // Start at the first measure of the current page (first occurrence in playing order).
  const startMeasure = firstMeasureOfPage(state.page);
  const startEvent = Math.max(0, state.timeline.findIndex((e) => e.idx === startMeasure));
  anchorScoreMs = state.timeline[startEvent].ms;
  anchorCtx = audio.currentTime + 0.15;
  state.playing = true;
  state.currentEvent = -1;
  $('play').textContent = '⏸';
  resetClickCursor();
  schedTimer = setInterval(scheduleClicks, 25);
  rafId = requestAnimationFrame(tick);
  try { wakeLock = await navigator.wakeLock?.request('screen'); stats.wakeLock = wakeLock ? 'acquired' : 'API missing'; }
  catch (e) { stats.wakeLock = `failed: ${e.message}`; }
}

function stop() {
  state.playing = false;
  $('play').textContent = '▶';
  clearInterval(schedTimer);
  cancelAnimationFrame(rafId);
  wakeLock?.release?.();
  wakeLock = null;
  highlight(null);
  renderStats();
}

function eventAt(ms) { // binary search: last event with start <= ms
  let lo = 0, hi = state.timeline.length - 1, r = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (state.timeline[mid].ms <= ms) { r = mid; lo = mid + 1; } else hi = mid - 1; }
  return r;
}

function tick() {
  if (!state.playing) return;
  const ms = scoreNow();
  const i = eventAt(ms);
  const tl = state.timeline;
  if (i >= tl.length - 1 && ms > tl.at(-1).ms + 4000) { stop(); return; }
  if (i >= 0 && !$('metroOnly').checked) {
    if (i !== state.currentEvent) { state.currentEvent = i; highlight(tl[i].idx); }
    // Turn the page when half of the last measure of the page has been played
    // (also handles backward jumps for repeats).
    const next = tl[i + 1];
    const cur = tl[i];
    const curPage = state.pageOfMeasure[cur.idx];
    let target = curPage;
    if (next && state.pageOfMeasure[next.idx] !== curPage && (ms - cur.ms) / (next.ms - cur.ms) > 0.5) target = state.pageOfMeasure[next.idx];
    if (target && target !== state.page) showPage(target);
  }
  flashBeats();
  rafId = requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- metronome (S6)
let clickCursor = { event: 0, beat: 0 };
const pendingFlashes = [];
function resetClickCursor() {
  const ms = scoreNow();
  const i = Math.max(0, eventAt(ms));
  clickCursor = { event: i, beat: 0 };
  // skip beats already past
  while (clickTimeMs(clickCursor) != null && clickTimeMs(clickCursor) < ms) advanceClick();
}
function measureDurationMs(i) {
  const tl = state.timeline;
  if (i + 1 < tl.length && tl[i + 1].ms > tl[i].ms) return tl[i + 1].ms - tl[i].ms;
  return i > 0 ? tl[i].ms - tl[i - 1].ms : 2000;
}
function clickTimeMs({ event, beat }) {
  const ev = state.timeline[event];
  if (!ev) return null;
  const clicks = state.measureMeta[ev.idx]?.clicks ?? 4;
  return ev.ms + (beat * measureDurationMs(event)) / clicks;
}
function advanceClick() {
  const ev = state.timeline[clickCursor.event];
  const clicks = state.measureMeta[ev.idx]?.clicks ?? 4;
  clickCursor.beat++;
  if (clickCursor.beat >= clicks) { clickCursor.beat = 0; clickCursor.event++; }
}
function scheduleClicks() {
  if (!state.playing) return;
  const horizon = audio.currentTime + 0.12;
  for (;;) {
    const ms = clickTimeMs(clickCursor);
    if (ms == null) return;
    const t = ctxTimeOf(ms);
    if (t > horizon) return;
    const lead = (t - audio.currentTime) * 1000;
    stats.metronome.scheduled++;
    stats.metronome.minLeadMs = stats.metronome.minLeadMs == null ? Math.round(lead) : Math.min(stats.metronome.minLeadMs, Math.round(lead));
    if (lead < 0) stats.metronome.late++;
    else {
      const accent = clickCursor.beat === 0;
      if ($('metro').checked) click(t, accent);
      pendingFlashes.push({ t, accent });
    }
    advanceClick();
  }
}
function click(t, accent) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = accent ? 1600 : 1000;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.8, t + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.05);
}
function flashBeats() {
  while (pendingFlashes.length && pendingFlashes[0].t <= audio.currentTime) {
    const { accent } = pendingFlashes.shift();
    const b = $('beat');
    b.className = accent ? 'accent' : 'on';
    setTimeout(() => { b.className = ''; }, 90);
  }
}
