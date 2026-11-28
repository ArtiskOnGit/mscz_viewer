export const routes = {
  library: '/library',
  /** A folder of the library (ADR-029): one page per level, so the back buttons go up one folder. */
  libraryFolderPattern: '/library/folder/:folderId',
  libraryFolder: (folderId: string | undefined) => (folderId ? `/library/folder/${encodeURIComponent(folderId)}` : '/library'),
  settings: '/settings',
  viewerPattern: '/viewer/:scoreId',
  viewer: (scoreId: string) => `/viewer/${encodeURIComponent(scoreId)}`,
  /** Viewer in setlist mode: the item override applies and next/previous piece are available. */
  viewerInSetlist: (scoreId: string, setlistId: string, itemId: string) =>
    `/viewer/${encodeURIComponent(scoreId)}?setlist=${encodeURIComponent(setlistId)}&item=${encodeURIComponent(itemId)}`,
  setlistPattern: '/setlist/:setlistId',
  setlist: (setlistId: string) => `/setlist/${encodeURIComponent(setlistId)}`,
} as const;
