/** Display helpers shared by the monitoring pages (client-safe). */

/** `99.98 %`, `100 %`, `—`. Never rounds a non-perfect uptime up to 100. */
export function formatUptime(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return '—';
  if (ratio >= 1) return '100%';
  const percent = Math.floor(ratio * 10_000) / 100;
  return `${percent.toFixed(2)}%`;
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`;
}

/** `3 d 4 h`, `12 min`, `45 s`. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}

export function secondsSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : Math.max(0, (now - time) / 1000);
}

/** Tailwind classes per status, used by dots, badges and bars. */
export const STATUS_STYLES: Record<
  string,
  { dot: string; text: string; badge: string; bar: string }
> = {
  up: {
    dot: 'bg-ok',
    text: 'text-ok',
    badge: 'k-badge-ok',
    bar: 'bg-ok/75 hover:bg-ok',
  },
  degraded: {
    dot: 'bg-warn',
    text: 'text-warn',
    badge: 'k-badge-warn',
    bar: 'bg-warn/80 hover:bg-warn',
  },
  down: {
    dot: 'bg-danger',
    text: 'text-red-400',
    badge: 'k-badge-danger',
    bar: 'bg-danger/85 hover:bg-danger',
  },
  pending: {
    dot: 'bg-info',
    text: 'text-info',
    badge: 'k-badge-info',
    bar: 'bg-white/8 hover:bg-white/14',
  },
  paused: {
    dot: 'bg-fg-subtle',
    text: 'text-fg-muted',
    badge: '',
    bar: 'bg-white/8 hover:bg-white/14',
  },
  none: {
    dot: 'bg-ink-500',
    text: 'text-fg-subtle',
    badge: '',
    bar: 'bg-white/5 hover:bg-white/10',
  },
};

export function statusStyle(status: string | null | undefined) {
  return STATUS_STYLES[status ?? 'none'] ?? STATUS_STYLES.none;
}

/** Text color for an uptime figure: green from the SLO, amber close to it, red below. */
export function uptimeTone(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return 'text-fg-subtle';
  if (ratio >= 0.999) return 'text-ok';
  if (ratio >= 0.99) return 'text-warn';
  return 'text-red-400';
}
