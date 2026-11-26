// Files opened with the app from another app: "Open with…" (Android VIEW intents, content:// or file:// URLs) and
// "Share to" (SEND / SEND_MULTIPLE intents, files copied to the app cache by @capgo/capacitor-share-target, ADR-024).
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Filesystem } from '@capacitor/filesystem';
import { CapacitorShareTarget, type SharedFile } from '@capgo/capacitor-share-target';
import { base64ToBytes } from '../util/base64';
import type { ImportInput } from './importScore';

async function readUrl(url: string, name = fileNameOf(url)): Promise<ImportInput | undefined> {
  if (!/^(content|file):/i.test(url)) return undefined;
  let bytes: Uint8Array;
  try {
    const { data } = await Filesystem.readFile({ path: url });
    bytes = typeof data === 'string' ? base64ToBytes(data) : new Uint8Array(await data.arrayBuffer());
  } catch {
    const res = await fetch(Capacitor.convertFileSrc(url));
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  return { name, bytes };
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

/**
 * Readable URL of a shared file: the plugin copies each shared file into the app cache and gives its absolute path
 * (or the original content:// URI when the copy failed).
 */
export function sharedFileUrl(uri: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) return uri;
  return `file://${uri.split('/').map(encodeURIComponent).join('/')}`;
}

/** Name to import a shared file under ("unknown" when the sending app gave none: the content decides then). */
export function sharedFileName(file: Pick<SharedFile, 'name' | 'uri'>): string {
  return file.name && file.name !== 'unknown' ? file.name : fileNameOf(sharedFileUrl(file.uri));
}

/**
 * Calls `handler` with the files shared to the app ("Share to"), at launch (cold start: the event is kept by the
 * plugin until this listener is registered) and while it runs. Returns an unsubscribe function.
 */
export function onShareReceived(handler: (inputs: ImportInput[]) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  const sub = CapacitorShareTarget.addListener('shareReceived', (event) => {
    void (async () => {
      const inputs: ImportInput[] = [];
      for (const file of event.files ?? []) {
        const url = sharedFileUrl(file.uri);
        try {
          const input = await readUrl(url, sharedFileName(file));
          if (input) inputs.push(input);
        } catch (e) {
          console.error('share failed', file.name, e);
        }
        // The cached copy is not needed any more (the plugin also evicts copies older than a day).
        if (url.startsWith('file:')) void Filesystem.deleteFile({ path: url }).catch(() => undefined);
      }
      if (inputs.length) handler(inputs);
    })();
  });
  return () => void sub.then((s) => s.remove());
}
