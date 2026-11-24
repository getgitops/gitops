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
    dot: 'bg-emerald-400',
    text: 'text-emerald-400',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    bar: 'bg-emerald-500 hover:bg-emerald-400',
  },
  degraded: {
    dot: 'bg-amber-400',
    text: 'text-amber-400',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    bar: 'bg-amber-500 hover:bg-amber-400',
  },
  down: {
    dot: 'bg-rose-500',
    text: 'text-rose-400',
    badge: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    bar: 'bg-rose-500 hover:bg-rose-400',
  },
  pending: {
    dot: 'bg-sky-400',
    text: 'text-sky-300',
    badge: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    bar: 'bg-slate-700 hover:bg-slate-600',
  },
  paused: {
    dot: 'bg-slate-500',
    text: 'text-slate-400',
    badge: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
    bar: 'bg-slate-700 hover:bg-slate-600',
  },
  none: {
    dot: 'bg-slate-600',
    text: 'text-slate-500',
    badge: 'border-slate-600/30 bg-slate-600/10 text-slate-400',
    bar: 'bg-slate-800 hover:bg-slate-700',
  },
};

export function statusStyle(status: string | null | undefined) {
  return STATUS_STYLES[status ?? 'none'] ?? STATUS_STYLES.none;
}

/** Text color for an uptime figure: green from the SLO, amber close to it, red below. */
export function uptimeTone(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return 'text-slate-500';
  if (ratio >= 0.999) return 'text-emerald-400';
  if (ratio >= 0.99) return 'text-amber-400';
  return 'text-rose-400';
}
