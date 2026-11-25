/** "4:05" / "1:02:03" */
export function formatDuration(totalSeconds: number | undefined): string | undefined {
  if (totalSeconds === undefined || !Number.isFinite(totalSeconds)) return undefined;
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
