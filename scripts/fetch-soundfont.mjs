// Downloads the General MIDI SoundFont bundled with the app (audio playback, ADR-026) into public/soundfonts/.
// FluidR3Mono_GM.sf3 2.312 (MIT, Frank Wen / Michael Cowgill), as shipped by MuseScore 2.3.2: 14.6 MB, Ogg Vorbis samples.
// The file is not in git (size): this script runs after `npm install` and is idempotent (checked by SHA-256).
// Offline: copy the file by hand to public/soundfonts/ (same name), or set SOUNDFONT_FILE=/path/to/FluidR3Mono_GM.sf3.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

export const SOUNDFONT = {
  file: 'FluidR3Mono_GM.sf3',
  url: 'https://raw.githubusercontent.com/musescore/MuseScore/v2.3.2/share/sound/FluidR3Mono_GM.sf3',
  sha256: 'cfcd66d89e8386823400eca64934b14fbea7bf48ba1f00d21189af1262794ec2',
};

const dir = new URL('../public/soundfonts/', import.meta.url);
const target = new URL(SOUNDFONT.file, dir);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function existing() {
  try {
    return sha(await readFile(target)) === SOUNDFONT.sha256;
  } catch {
    return false;
  }
}

if (await existing()) {
  console.log(`fetch-soundfont: ${SOUNDFONT.file} present`);
} else {
  let bytes;
  try {
    bytes = process.env.SOUNDFONT_FILE
      ? await readFile(process.env.SOUNDFONT_FILE)
      : new Uint8Array(await (await fetch(SOUNDFONT.url, { signal: AbortSignal.timeout(120_000) })).arrayBuffer());
  } catch (e) {
    console.warn(`fetch-soundfont: could not download ${SOUNDFONT.url} (${e.message}). Audio playback will be unavailable until the file is in public/soundfonts/.`);
    process.exit(0);
  }
  if (sha(bytes) !== SOUNDFONT.sha256) {
    console.error(`fetch-soundfont: ${SOUNDFONT.file} has an unexpected SHA-256 (${sha(bytes)}), not installed.`);
    process.exit(1);
  }
  await mkdir(dir, { recursive: true });
  const tmp = new URL(`${SOUNDFONT.file}.tmp`, dir);
  await writeFile(tmp, bytes);
  await rename(tmp, target);
  console.log(`fetch-soundfont: ${SOUNDFONT.file} installed (${(bytes.length / 1e6).toFixed(1)} MB)`);
}
