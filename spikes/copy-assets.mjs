// Copie les fichiers de webmscore à la racine publique du banc de test (servis à côté de index.html).
import { cp, readdir, mkdir } from 'node:fs/promises';
const src = new URL('./node_modules/webmscore/', import.meta.url);
const dst = new URL('./device-test/public/', import.meta.url);
await mkdir(dst, { recursive: true });
for (const f of await readdir(src)) {
  if (f === 'webmscore.js' || (f.startsWith('webmscore.lib.') && f !== 'webmscore.lib.symbols')) await cp(new URL(f, src), new URL(f, dst));
}
console.log('webmscore assets copied to device-test/public/');
