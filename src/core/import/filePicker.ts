// Pick score files: native picker on Android/iOS, <input type="file"> on the web.
//
// Android may destroy the app while the system picker is in the foreground (seen in phase 0). The picked
// files are then delivered through App's `appRestoredResult` event: see onRestoredPick().
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { FilePicker, type PickedFile } from '@capawesome/capacitor-file-picker';
import { base64ToBytes } from '../util/base64';
import { ACCEPTED_EXTENSIONS } from './formats';
import { isAppleMobile } from '../platform';
import type { ImportInput } from './importScore';

export async function pickScoreFiles(): Promise<ImportInput[]> {
  if (!Capacitor.isNativePlatform()) return pickWithInput();
  // .mscz has no registered MIME type on Android: accept everything, validate by extension/content later.
  const { files } = await FilePicker.pickFiles({ limit: 0, readData: true });
  return toInputs(files);
}

export async function toInputs(files: PickedFile[]): Promise<ImportInput[]> {
  const inputs: ImportInput[] = [];
  for (const f of files) {
    if (f.data) inputs.push({ name: f.name, bytes: base64ToBytes(f.data) });
    else if (f.blob) inputs.push({ name: f.name, bytes: new Uint8Array(await f.blob.arrayBuffer()) });
  }
  return inputs;
}

/** Calls `handler` with files picked just before Android restarted the app. Returns an unsubscribe function. */
export function onRestoredPick(handler: (inputs: ImportInput[]) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  const sub = App.addListener('appRestoredResult', (event) => {
    if (event.pluginId !== 'FilePicker' || event.methodName !== 'pickFiles' || !event.success) return;
    const files = (event.data as { files?: PickedFile[] } | undefined)?.files ?? [];
    void toInputs(files).then((inputs) => inputs.length && handler(inputs));
  });
  return () => void sub.then((s) => s.remove());
}

function pickWithInput(): Promise<ImportInput[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    // iOS greys out the files whose type it does not know when `accept` lists extensions only (.mscz has no registered
    // type there): no filter on iPhone/iPad, the format is checked after picking (detectFormat → "unsupported format").
    if (!isAppleMobile()) input.accept = ACCEPTED_EXTENSIONS.join(',');
    // Safari may never fire "change" on a detached input: keep it in the document (hidden) while the picker is open.
    input.hidden = true;
    document.body.append(input);
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      input.remove();
      resolve(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
    };
    input.oncancel = () => {
      input.remove();
      resolve([]);
    };
    input.click();
  });
}
