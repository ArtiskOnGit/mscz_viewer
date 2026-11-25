export const routes = {
  library: '/library',
  settings: '/settings',
  viewerPattern: '/viewer/:scoreId',
  viewer: (scoreId: string) => `/viewer/${encodeURIComponent(scoreId)}`,
} as const;
