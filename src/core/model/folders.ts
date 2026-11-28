// Pure helpers over the library folders (ADR-029). A folder or a score without parent / folder is at the root.
import type { Folder, FolderId, Score } from './types';

/** Ancestors of a folder, from the root down to the folder itself ([] for the root or an unknown id). */
export function folderPath(folders: readonly Folder[], id: FolderId | undefined): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: Folder[] = [];
  const seen = new Set<FolderId>();
  for (let f = id ? byId.get(id) : undefined; f && !seen.has(f.id); f = f.parentId ? byId.get(f.parentId) : undefined) {
    seen.add(f.id);
    path.unshift(f);
  }
  return path;
}

/** True if `id` is `ancestor` or one of its sub-folders (at any depth). */
export function isInside(folders: readonly Folder[], id: FolderId | undefined, ancestor: FolderId): boolean {
  return folderPath(folders, id).some((f) => f.id === ancestor);
}

/** Direct sub-folders of a folder (undefined = the root). */
export function childFolders(folders: readonly Folder[], parentId: FolderId | undefined): Folder[] {
  return folders.filter((f) => f.parentId === parentId);
}

/** Number of items (sub-folders + scores) directly in a folder. */
export function itemCount(folders: readonly Folder[], scores: readonly Score[], id: FolderId): number {
  return folders.filter((f) => f.parentId === id).length + scores.filter((s) => s.folderId === id).length;
}

/** Folders in tree order (depth-first, siblings by name), with their depth (0 = at the root). */
export function folderTree(folders: readonly Folder[], compare: (a: string, b: string) => number): { folder: Folder; depth: number }[] {
  const out: { folder: Folder; depth: number }[] = [];
  const walk = (parentId: FolderId | undefined, depth: number) => {
    for (const folder of [...childFolders(folders, parentId)].sort((a, b) => compare(a.name, b.name))) {
      out.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}

/**
 * Repairs an index read from disk: a parent or a folder that does not exist means the root, and a cycle (impossible
 * through the app, but the file may have been edited) is broken by moving one of its folders to the root.
 */
export function sanitizeFolders(folders: Folder[], scores: Score[]): { folders: Folder[]; scores: Score[] } {
  const ids = new Set(folders.map((f) => f.id));
  let fixed = folders.map((f) => (f.parentId && (!ids.has(f.parentId) || f.parentId === f.id) ? withoutParent(f) : f));
  for (const { id } of fixed) {
    const byId = new Map(fixed.map((x) => [x.id, x]));
    const seen = new Set<FolderId>([id]);
    const start = byId.get(id)!;
    for (let p = start.parentId ? byId.get(start.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) {
      if (p.id === id) {
        fixed = fixed.map((x) => (x.id === id ? withoutParent(x) : x));
        break;
      }
      if (seen.has(p.id)) break; // a cycle above this folder: repaired when one of its folders is the start
      seen.add(p.id);
    }
  }
  const fixedScores = scores.map((s) => (s.folderId && !ids.has(s.folderId) ? withoutFolder(s) : s));
  return { folders: fixed, scores: fixedScores };
}

export function withoutParent(f: Folder): Folder {
  const { parentId: _p, ...rest } = f;
  return rest;
}

export function withoutFolder(s: Score): Score {
  const { folderId: _f, ...rest } = s;
  return rest;
}

/** Folder displayed by a library URL: "/library/folder/<id>" (under any base path); undefined for anything else. */
export function folderIdOfPath(pathname: string): FolderId | undefined {
  const m = /\/library\/folder\/([^/?#]+)\/?$/.exec(pathname);
  return m ? decodeURIComponent(m[1]!) : undefined;
}
