export const routes = {
  library: '/library',
  settings: '/settings',
  viewerPattern: '/viewer/:scoreId',
  viewer: (scoreId: string) => `/viewer/${encodeURIComponent(scoreId)}`,
  /** Viewer in setlist mode: the item override applies and next/previous piece are available. */
  viewerInSetlist: (scoreId: string, setlistId: string, itemId: string) =>
    `/viewer/${encodeURIComponent(scoreId)}?setlist=${encodeURIComponent(setlistId)}&item=${encodeURIComponent(itemId)}`,
  setlistPattern: '/setlist/:setlistId',
  setlist: (setlistId: string) => `/setlist/${encodeURIComponent(setlistId)}`,
} as const;
