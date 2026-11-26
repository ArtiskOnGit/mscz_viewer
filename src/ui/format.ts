/** "4:05" / "1:02:03" */
export function formatDuration(totalSeconds: number | undefined): string | undefined {
  if (totalSeconds === undefined || !Number.isFinite(totalSeconds)) return undefined;
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** "850 kB" / "12.3 MB" ("12,3 Mo" in French), from a size in bytes. */
export function formatBytes(bytes: number, language: string): string {
  const mb = bytes / (1024 * 1024);
  const [value, unit] = mb >= 1 ? [mb, 'megabyte'] : [Math.max(0, bytes) / 1024, 'kilobyte'];
  return new Intl.NumberFormat(language, { style: 'unit', unit, maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
}
