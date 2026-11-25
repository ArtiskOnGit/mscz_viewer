// Minimal file API over the app's private storage. Paths are relative ("scores/<id>/score.musicxml").
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { base64ToBytes, bytesToBase64 } from '../util/base64';

export interface FileStore {
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, text: string): Promise<void>;
  readBytes(path: string): Promise<Uint8Array | undefined>;
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  /** Write then rename, so a crash never leaves a half-written file. */
  writeTextAtomic(path: string, text: string): Promise<void>;
  removeDir(path: string): Promise<void>;
  removeFile(path: string): Promise<void>;
}

/** Capacitor Filesystem (Directory.Data). On the web, Capacitor stores files in IndexedDB. */
export class CapacitorFileStore implements FileStore {
  private readonly directory = Directory.Data;

  async readText(path: string) {
    try {
      const { data } = await Filesystem.readFile({ path, directory: this.directory, encoding: Encoding.UTF8 });
      return typeof data === 'string' ? data : await data.text();
    } catch (e) {
      if (isNotFound(e)) return undefined;
      throw e;
    }
  }

  async writeText(path: string, text: string) {
    await Filesystem.writeFile({ path, data: text, directory: this.directory, encoding: Encoding.UTF8, recursive: true });
  }

  async readBytes(path: string) {
    try {
      const { data } = await Filesystem.readFile({ path, directory: this.directory });
      return typeof data === 'string' ? base64ToBytes(data) : new Uint8Array(await data.arrayBuffer());
    } catch (e) {
      if (isNotFound(e)) return undefined;
      throw e;
    }
  }

  async writeBytes(path: string, bytes: Uint8Array) {
    await Filesystem.writeFile({ path, data: bytesToBase64(bytes), directory: this.directory, recursive: true });
  }

  async writeTextAtomic(path: string, text: string) {
    const tmp = `${path}.tmp`;
    await this.writeText(tmp, text);
    await this.removeFile(path);
    await Filesystem.rename({ from: tmp, to: path, directory: this.directory, toDirectory: this.directory });
  }

  async removeDir(path: string) {
    try {
      await Filesystem.rmdir({ path, directory: this.directory, recursive: true });
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }

  async removeFile(path: string) {
    try {
      await Filesystem.deleteFile({ path, directory: this.directory });
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }
}

function isNotFound(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e).toLowerCase();
  return msg.includes('not exist') || msg.includes('not found') || msg.includes('no such file') || msg.includes('does not exist');
}

/** In-memory implementation for unit tests. */
export class MemoryFileStore implements FileStore {
  readonly files = new Map<string, string | Uint8Array>();
  async readText(path: string) {
    const v = this.files.get(path);
    return typeof v === 'string' ? v : v ? new TextDecoder().decode(v) : undefined;
  }
  async writeText(path: string, text: string) {
    this.files.set(path, text);
  }
  async readBytes(path: string) {
    const v = this.files.get(path);
    return typeof v === 'string' ? new TextEncoder().encode(v) : v;
  }
  async writeBytes(path: string, bytes: Uint8Array) {
    this.files.set(path, bytes.slice());
  }
  async writeTextAtomic(path: string, text: string) {
    this.files.set(path, text);
  }
  async removeDir(path: string) {
    for (const k of [...this.files.keys()]) if (k === path || k.startsWith(`${path}/`)) this.files.delete(k);
  }
  async removeFile(path: string) {
    this.files.delete(path);
  }
}
