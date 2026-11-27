// Installable web app (PWA build only, ADR-027): registers the service worker (src/pwa/sw.js), follows the offline
// download (everything is precached at install), offers new versions ("New version — Reload") and asks for
// persistent storage. Settings → Storage shows the state. Nothing happens in the Android app or the dev server.
import { create } from 'zustand';

export type OfflineState =
  /** Not a PWA build, or no service worker in this browser. */
  | 'unsupported'
  | 'checking'
  | 'downloading'
  | 'ready'
  /** Download interrupted (network lost…): the app still works online; retry() resumes it. */
  | 'error';

export interface PwaState {
  offline: OfflineState;
  /** Bytes stored for offline use / total (the current version, or the update being downloaded). */
  done: number;
  total: number;
  /** A new version being downloaded (the current one stays usable offline meanwhile). */
  update: { done: number; total: number } | undefined;
  /** A new version is downloaded and waits for a reload. */
  updateReady: boolean;
  /** navigator.storage.persisted(): data not evicted by the browser under storage pressure. */
  persisted: boolean | undefined;
}

export const usePwa = create<PwaState>(() => ({
  offline: __PWA__ ? 'checking' : 'unsupported',
  done: 0,
  total: 0,
  update: undefined,
  updateReady: false,
  persisted: undefined,
}));

const BASE = import.meta.env.BASE_URL;
const SW_URL = `${BASE}sw.js`;
let registration: ServiceWorkerRegistration | undefined;
let reloading = false;
let lastUpdateCheck = 0;

interface SwMessage {
  type: 'progress' | 'status';
  build: string;
  total: number;
  done?: number;
  state?: 'downloading' | 'complete' | 'error';
  complete?: boolean;
}

/** Called once at startup. */
export function startPwa(): void {
  if (!__PWA__ || !('serviceWorker' in navigator)) {
    usePwa.setState({ offline: 'unsupported' });
    return;
  }
  const sw = navigator.serviceWorker;
  sw.addEventListener('message', (e: MessageEvent<SwMessage>) => onProgress(e.data));
  sw.startMessages();
  sw.addEventListener('controllerchange', () => {
    if (reloading) window.location.reload();
  });
  document.addEventListener('visibilitychange', () => {
    // Look for a new version when the app comes back (at most every 30 min; fails silently offline).
    if (document.visibilityState !== 'visible' || Date.now() - lastUpdateCheck < 30 * 60_000) return;
    lastUpdateCheck = Date.now();
    void registration?.update().catch(() => undefined);
  });
  void register();
  void requestPersistence();
}

async function register(): Promise<void> {
  try {
    lastUpdateCheck = Date.now();
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: BASE, updateViaCache: 'none' });
    if (!reg) throw new Error('service worker registration blocked');
    if (registration !== reg) {
      registration = reg;
      reg.addEventListener('updatefound', () => watch(reg.installing));
    }
    watch(reg.installing);
    if (reg.waiting && navigator.serviceWorker.controller) usePwa.setState({ updateReady: true });
    await refreshStatus();
  } catch (e) {
    console.warn('service worker registration failed', e);
    usePwa.setState({ offline: 'error' });
  }
}

const watched = new WeakSet<ServiceWorker>();
function watch(worker: ServiceWorker | null): void {
  if (!worker || watched.has(worker)) return;
  watched.add(worker);
  if (usePwa.getState().offline !== 'ready') usePwa.setState({ offline: 'downloading' });
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) usePwa.setState({ updateReady: true });
    if (worker.state === 'activated' || worker.state === 'redundant') void refreshStatus();
  });
}

function onProgress(msg: SwMessage): void {
  if (msg?.type !== 'progress') return;
  const progress = { done: msg.done ?? 0, total: msg.total };
  // An update downloading while the current version is ready: its own progress, offline use stays "ready".
  if (usePwa.getState().offline === 'ready') usePwa.setState({ update: msg.state === 'downloading' ? progress : undefined });
  else usePwa.setState(msg.state === 'error' ? { offline: 'error' } : { ...progress, offline: 'downloading' });
}

/** Asks the active service worker how much of its version is stored. */
async function refreshStatus(): Promise<void> {
  const reg = registration;
  const active = reg?.active;
  if (!active) {
    usePwa.setState({ offline: reg?.installing ? 'downloading' : 'error' });
    return;
  }
  const status = await new Promise<SwMessage | undefined>((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(undefined), 5000);
    channel.port1.onmessage = (e: MessageEvent<SwMessage>) => {
      clearTimeout(timer);
      resolve(e.data);
    };
    active.postMessage({ type: 'STATUS' }, [channel.port2]);
  });
  if (!status) return;
  usePwa.setState({
    done: status.done ?? 0,
    total: status.total,
    offline: status.complete ? 'ready' : reg.installing ? 'downloading' : 'error',
  });
}

/** "Download again" (Settings → Storage): resumes an interrupted download. */
export function retryOffline(): void {
  usePwa.setState({ offline: 'downloading' });
  void register();
}

/** "Reload" on the "New version available" toast: the new service worker takes over, then the page reloads. */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting) return window.location.reload();
  reloading = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

/** Asks the browser not to evict the app data (scores, offline files) when storage runs low. */
export async function requestPersistence(): Promise<void> {
  const storage = navigator.storage;
  if (!storage?.persisted) return;
  try {
    const persisted = (await storage.persisted()) || (await storage.persist?.()) || false;
    usePwa.setState({ persisted });
  } catch {
    usePwa.setState({ persisted: false });
  }
}
