import { unzipSync } from 'fflate';

export type ImportFormat = 'mscz' | 'mscx' | 'mxl' | 'musicxml';

const BY_EXTENSION: Record<string, ImportFormat> = {
  mscz: 'mscz',
  mscx: 'mscx',
  mxl: 'mxl',
  musicxml: 'musicxml',
  xml: 'musicxml',
};

export const ACCEPTED_EXTENSIONS = Object.keys(BY_EXTENSION).map((e) => `.${e}`);

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

/** Detect the format from the extension, or from the content when the extension is unknown. */
export function detectFormat(fileName: string, bytes: Uint8Array): ImportFormat | undefined {
  const byExt = BY_EXTENSION[extensionOf(fileName)];
  if (byExt) return byExt;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    // ZIP: MuseScore (.mscx inside) or compressed MusicXML (META-INF/container.xml).
    try {
      const names = Object.keys(unzipSync(bytes, { filter: (f) => f.name.endsWith('.mscx') || f.name === 'META-INF/container.xml' }));
      if (names.some((n) => n.endsWith('.mscx'))) return 'mscz';
      if (names.includes('META-INF/container.xml')) return 'mxl';
    } catch {
      return undefined;
    }
    return undefined;
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 2048));
  if (head.includes('<museScore')) return 'mscx';
  if (head.includes('<score-partwise') || head.includes('<score-timewise')) return 'musicxml';
  return undefined;
}

/** MuseScore stores a PNG preview of page 1 in the .mscz archive. */
export function extractMsczThumbnail(bytes: Uint8Array): Uint8Array | undefined {
  try {
    return unzipSync(bytes, { filter: (f) => f.name === 'Thumbnails/thumbnail.png' })['Thumbnails/thumbnail.png'];
  } catch {
    return undefined;
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
