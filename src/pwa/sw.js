// Pupitre service worker (PWA build only, ADR-027). scripts/pwaPlugin.ts prepends the list of every file of the build:
//   self.__PUPITRE_BUILD = "<build id>"; self.__PUPITRE_PRECACHE = [[path, sha256 prefix, size], ...];
//
// Strategy: precache EVERYTHING at install (~45 MB: webmscore 18 MB, SoundFont 14.6 MB, Verovio 8 MB, app shell), so
// that after the first visit the app imports, renders and plays scores without network (rehearsal rooms). Entries
// are stored in one cache under "<url>?__rev=<hash>": an interrupted download resumes where it stopped (files
// already stored are kept), and an update only downloads the files that changed. Every file is checked against its
// hash (a CDN serving a stale copy fails the install, retried later). Progress is posted to the pages.
// Requests: cache first for the files of the build, every navigation gets index.html (single-page app), anything
// else goes to the network. A new version waits until the page asks it to take over ("New version — Reload").

const BUILD = self.__PUPITRE_BUILD;
const FILES = self.__PUPITRE_PRECACHE;
const CACHE = 'pupitre-precache';
const SCOPE = self.registration.scope; // ends with "/"
const TOTAL = FILES.reduce((s, f) => s + f[2], 0);
const byPath = new Map(FILES.map((f) => [f[0], f]));
const keyOf = (f) => `${SCOPE}${f[0]}?__rev=${f[1]}`;
const PARALLEL = 3;

async function post(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const c of clients) c.postMessage({ build: BUILD, total: TOTAL, ...message });
}

async function storedKeys(cache) {
  return new Set((await cache.keys()).map((r) => r.url));
}

async function hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function precache() {
  const cache = await caches.open(CACHE);
  const stored = await storedKeys(cache);
  const missing = FILES.filter((f) => !stored.has(keyOf(f)));
  let done = TOTAL - missing.reduce((s, f) => s + f[2], 0);
  let lastPost = 0;
  const progress = (force) => {
    const now = Date.now();
    if (!force && now - lastPost < 250) return;
    lastPost = now;
    void post({ type: 'progress', state: 'downloading', done });
  };
  progress(true);

  async function download(f) {
    // Bypass the HTTP cache: GitHub Pages lets browsers keep files 10 minutes, a new version must not mix old files.
    const res = await fetch(new URL(f[0], SCOPE), { cache: 'reload' });
    if (!res.ok || !res.body) throw new Error(`${f[0]}: HTTP ${res.status}`);
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      chunks.push(value);
      received += value.length;
      done += value.length;
      progress(false);
    }
    const body = await new Blob(chunks).arrayBuffer();
    done += f[2] - received; // the size of the build file is the reference for the progress
    if (!(await hex(body)).startsWith(f[1])) throw new Error(`${f[0]}: content does not match this version`);
    const type = res.headers.get('content-type');
    await cache.put(keyOf(f), new Response(body, { status: 200, headers: type ? { 'content-type': type } : {} }));
  }

  const queue = [...missing];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) await download(f);
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precache().then(
      () => post({ type: 'progress', state: 'complete', done: TOTAL }),
      async (e) => {
        await post({ type: 'progress', state: 'error', error: String(e?.message ?? e) });
        throw e;
      },
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop the files of previous versions.
      const cache = await caches.open(CACHE);
      const wanted = new Set(FILES.map(keyOf));
      for (const req of await cache.keys()) if (!wanted.has(req.url)) await cache.delete(req);
      for (const name of await caches.keys()) if (name !== CACHE && name.startsWith('pupitre-precache')) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return;
  const path = req.mode === 'navigate' ? 'index.html' : req.url.slice(SCOPE.length).split(/[?#]/)[0];
  const f = byPath.get(path);
  if (!f) return;
  event.respondWith(
    caches
      .open(CACHE)
      .then((c) => c.match(keyOf(f)))
      .then((hit) => hit ?? fetch(req)),
  );
});

self.addEventListener('message', (event) => {
  const msg = event.data ?? {};
  if (msg.type === 'SKIP_WAITING') void self.skipWaiting();
  else if (msg.type === 'STATUS') {
    event.waitUntil(
      (async () => {
        const stored = await storedKeys(await caches.open(CACHE));
        const done = FILES.reduce((s, f) => s + (stored.has(keyOf(f)) ? f[2] : 0), 0);
        event.ports[0]?.postMessage({ type: 'status', build: BUILD, total: TOTAL, done, complete: done === TOTAL });
      })(),
    );
  }
});
