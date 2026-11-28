// MuseScore does not lay out hidden parts/staves, so their beams are never computed and the MusicXML export has
// none (seen on a real MuseScore 4.5 score: unbeamed 8ths/16ths). A part can be hidden by <Part><show>0</show>
// and/or by <Staff><isStaffVisible>0</isStaffVisible> (MuseScore 4) / <Staff><invisible>1</invisible>
// (MuseScore 3) on each of its staves. Before conversion, all of them are made visible in a copy of the file;
// the original visibility is kept to choose the default parts to display.
import { unzipSync, zipSync } from 'fflate';
import type { XmlEnv } from '../musicxml/filterParts';

export interface UnhideResult {
  bytes: Uint8Array;
  /** 0-based indexes (score order) of the parts hidden in the original file. */
  hiddenPartIndexes: number[];
}

export function unhideParts(format: 'mscz' | 'mscx', bytes: Uint8Array, env: XmlEnv = globalThis): UnhideResult {
  if (format === 'mscx') {
    const r = unhideInMscx(new TextDecoder().decode(bytes), env);
    return { bytes: r.text === undefined ? bytes : new TextEncoder().encode(r.text), hiddenPartIndexes: r.hidden };
  }
  const files = unzipSync(bytes);
  const main = mainMscxPath(files);
  const content = main ? files[main] : undefined;
  if (!main || !content) return { bytes, hiddenPartIndexes: [] };
  const r = unhideInMscx(new TextDecoder().decode(content), env);
  if (r.text === undefined) return { bytes, hiddenPartIndexes: r.hidden };
  files[main] = new TextEncoder().encode(r.text);
  return { bytes: zipSync(files), hiddenPartIndexes: r.hidden };
}

/** Root score file: from META-INF/container.xml, else the first .mscx outside Excerpts/. */
function mainMscxPath(files: Record<string, Uint8Array>): string | undefined {
  const container = files['META-INF/container.xml'];
  if (container) {
    const path = /full-path="([^"]+\.mscx)"/.exec(new TextDecoder().decode(container))?.[1];
    if (path && files[path]) return path;
  }
  return Object.keys(files).find((n) => n.endsWith('.mscx') && !n.startsWith('Excerpts/'));
}

/** Only the top-level score's parts (MuseScore 3 nests excerpts as <Score> inside <Score>). */
function unhideInMscx(text: string, env: XmlEnv): { text: string | undefined; hidden: number[] } {
  const doc = new env.DOMParser().parseFromString(text, 'application/xml');
  const score = childElements(doc.documentElement, 'Score')[0];
  if (!score) return { text: undefined, hidden: [] };
  const hidden: number[] = [];
  let changed = false;
  childElements(score, 'Part').forEach((part, index) => {
    let partHidden = false;
    for (const show of childElements(part, 'show')) {
      if (show.textContent?.trim() === '0') partHidden = true;
      part.removeChild(show);
      changed = true;
    }
    const staves = childElements(part, 'Staff');
    let hiddenStaves = 0;
    for (const staff of staves) {
      const flags = [...childElements(staff, 'isStaffVisible').filter((e) => e.textContent?.trim() === '0'), ...childElements(staff, 'invisible').filter((e) => e.textContent?.trim() === '1')];
      if (flags.length) hiddenStaves++;
      for (const f of flags) {
        staff.removeChild(f);
        changed = true;
      }
    }
    if (partHidden || (staves.length > 0 && hiddenStaves === staves.length)) hidden.push(index);
  });
  if (convertKeySignatures(doc)) changed = true;
  return { text: changed ? new env.XMLSerializer().serializeToString(doc) : undefined, hidden };
}

/**
 * MuseScore ≥ 4.4 writes key signatures as <KeySig><concertKey>-4</concertKey><actualKey>-1</actualKey>, a format
 * the MuseScore 4.0 engine of webmscore does not read: every key came out as C major (reported on a device with a
 * MuseScore 4.7 file in A♭; MuseScore 4.5/4.6 files were affected too). Rewrite them in the older format,
 * <accidental>N</accidental> = key of the staff as written (actualKey for transposing instruments, else concertKey),
 * as MuseScore 3 files do. Custom/atonal key signatures (no concertKey) are left untouched.
 */
export function convertKeySignatures(doc: Document): boolean {
  let changed = false;
  for (const keySig of Array.from(doc.getElementsByTagName('KeySig'))) {
    const concert = childElements(keySig, 'concertKey')[0];
    if (!concert) continue;
    const actual = childElements(keySig, 'actualKey')[0];
    const value = (actual ?? concert).textContent?.trim() ?? '0';
    const accidental = keySig.ownerDocument.createElement('accidental');
    accidental.textContent = value;
    keySig.insertBefore(accidental, concert);
    keySig.removeChild(concert);
    if (actual) keySig.removeChild(actual);
    changed = true;
  }
  return changed;
}

const childElements = (el: Element | null, tag: string): Element[] =>
  el ? Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).tagName === tag) : [];
