// Files opened with the app from another app ("Open with…"): Android VIEW intents (content:// or file:// URLs).
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Filesystem } from '@capacitor/filesystem';
import { base64ToBytes } from '../util/base64';
import type { ImportInput } from './importScore';

async function readUrl(url: string): Promise<ImportInput | undefined> {
  if (!/^(content|file):/i.test(url)) return undefined;
  let bytes: Uint8Array;
  try {
    const { data } = await Filesystem.readFile({ path: url });
    bytes = typeof data === 'string' ? base64ToBytes(data) : new Uint8Array(await data.arrayBuffer());
  } catch {
    const res = await fetch(Capacitor.convertFileSrc(url));
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  return { name: fileNameOf(url), bytes };
}

/** Last path segment, decoded ("…/Download/Toccata%20v2.mscz" → "Toccata v2.mscz"). Content URIs may carry no name. */
export function fileNameOf(url: string): string {
  const last = decodeURIComponent(url.split(/[?#]/)[0]!.split('/').pop() ?? '');
  const name = last.includes(':') ? last.split(':').pop()! : last; // "primary:Download/x.mscz" style ids
  return name.split('/').pop() || 'score';
}

/** Calls `handler` for files opened with the app, at launch and while it runs. Returns an unsubscribe function. */
export function onOpenWith(handler: (input: ImportInput) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  const handle = (url?: string) => {
    if (url) void readUrl(url).then((input) => input && handler(input)).catch((e) => console.error('open with failed', url, e));
  };
  void App.getLaunchUrl().then((r) => handle(r?.url));
  const sub = App.addListener('appUrlOpen', (e) => handle(e.url));
  return () => void sub.then((s) => s.remove());
}
