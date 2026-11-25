// webmscore (MuseScore 4.0 compiled to WASM), loaded lazily: only when the user imports a file.
// - Each WebMscore.load() starts its own Web Worker; destroy(false) terminates it (phase 0: an engine error
//   leaves the instance unusable, so we never reuse one).
// - Never call savePositions(true) (segment positions): it crashes the engine (phase 0).
import type { ImportFormat } from './formats';
import type { EngineResult, ScoreEngine } from './scoreEngine';

interface WebMscoreInstance {
  metadata(): Promise<Record<string, unknown> & { parts?: { name: string; instrumentId?: string; program?: number }[] }>;
  saveXml(): Promise<string>;
  savePositions(ofSegments: boolean): Promise<string>;
  destroy(soft?: boolean): void;
}
interface WebMscoreStatic {
  ready: Promise<void>;
  load(format: string, data: Uint8Array, fonts?: Uint8Array[], doLayout?: boolean): Promise<WebMscoreInstance>;
}

let loading: Promise<WebMscoreStatic> | undefined;

function loadWebMscore(): Promise<WebMscoreStatic> {
  loading ??= new Promise((resolve, reject) => {
    const existing = (globalThis as { WebMscore?: WebMscoreStatic }).WebMscore;
    if (existing) return resolve(existing);
    const script = document.createElement('script');
    // The engine fetches webmscore.lib.* next to the page, see scripts/copy-webmscore.mjs.
    script.src = `${import.meta.env.BASE_URL}webmscore.js`;
    script.onload = () => {
      const w = (globalThis as { WebMscore?: WebMscoreStatic }).WebMscore;
      if (w) resolve(w);
      else reject(new Error('webmscore did not register'));
    };
    script.onerror = () => {
      loading = undefined;
      reject(new Error('webmscore.js could not be loaded'));
    };
    document.head.append(script);
  });
  return loading;
}

export const webMscoreEngine: ScoreEngine = {
  async convert(format: ImportFormat, bytes: Uint8Array): Promise<EngineResult> {
    const WebMscore = await loadWebMscore();
    await WebMscore.ready;
    // The buffer is transferred to the worker: pass a copy, the caller still needs the bytes.
    const score = await WebMscore.load(format, bytes.slice(), [], true);
    try {
      const meta = await score.metadata();
      const musicXml = await score.saveXml();
      const positions = JSON.parse(await score.savePositions(false)) as EngineResult['positions'];
      return {
        musicXml,
        positions,
        metadata: {
          title: str(meta.title),
          subtitle: str(meta.subtitle),
          composer: str(meta.composer),
          mscoreVersion: str(meta.mscoreVersion),
          measures: num(meta.measures),
          duration: num(meta.duration),
          tempo: num(meta.tempo),
          parts: meta.parts,
        },
      };
    } finally {
      score.destroy(false);
    }
  },
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
