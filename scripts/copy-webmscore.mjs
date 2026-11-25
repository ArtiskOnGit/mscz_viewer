// webmscore loads its .wasm/.data files next to the HTML page: copy them to public/.
import { cp, mkdir, readdir } from 'node:fs/promises';

const src = new URL('../node_modules/webmscore/', import.meta.url);
const dst = new URL('../public/', import.meta.url);
await mkdir(dst, { recursive: true });
let n = 0;
for (const f of await readdir(src)) {
  if (f === 'webmscore.js' || (f.startsWith('webmscore.lib.') && f !== 'webmscore.lib.symbols')) {
    await cp(new URL(f, src), new URL(f, dst));
    n++;
  }
}
console.log(`copy-webmscore: ${n} files copied to public/`);
