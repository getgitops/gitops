/** `hace 2 h` / `2 h ago` from an ISO date; `null` when there is no valid date. */
export function relativeTime(
  value: string | null | undefined,
  locale: string,
  now = Date.now(),
): string | null {
  const then = value ? Date.parse(value) : NaN;
  if (Number.isNaN(then)) return null;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'long' });
  const seconds = Math.round((then - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(seconds, 'second');
}

export function duration(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const seconds = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}
