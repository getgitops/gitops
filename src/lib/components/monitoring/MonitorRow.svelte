<script lang="ts">
  import { Layers } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import {
    formatDuration,
    formatLatency,
    formatUptime,
    secondsSince,
    statusStyle,
    uptimeTone,
  } from '#lib/monitoring/format';
  import StatusDot from './StatusDot.svelte';
  import Sparkline from './Sparkline.svelte';
  import UptimeBars from './UptimeBars.svelte';
  import type { MonitorRowData } from './types';

  let {
    row,
    href,
    serviceName = null,
    range = 'day',
  }: {
    row: MonitorRowData;
    href: string;
    serviceName?: string | null;
    range?: 'hour' | 'day';
  } = $props();

  let monitor = $derived(row.monitor);
  let stats = $derived(row.stats);
  let status = $derived(monitor.enabled ? (stats?.status ?? 'pending') : 'paused');
  let bars = $derived(
    range === 'hour' ? (stats?.hourlyBars ?? []) : (stats?.dailyBars.slice(-60) ?? []),
  );
  let uptime = $derived(range === 'hour' ? stats?.uptime.h24 : stats?.uptime.d30);
  let since = $derived(secondsSince(stats?.since));
</script>

<div
  class="group grid items-center gap-x-6 gap-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 transition hover:border-[#24406a] hover:bg-[#0a1a2e] md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_5.5rem_8rem]"
>
  <a {href} class="flex min-w-0 items-center gap-3">
    <StatusDot {status} size="lg" />
    <div class="min-w-0">
      <p class="truncate text-sm font-semibold text-slate-100 group-hover:text-white">
        {monitor.name}
      </p>
      <p class="truncate text-xs text-slate-500">
        <span class="font-mono text-[11px] text-slate-400">{monitor.method}</span>
        {monitor.displayUrl}
      </p>
      <div class="mt-1 flex flex-wrap items-center gap-1.5">
        <span
          class="rounded-full border px-2 py-px text-[10px] font-semibold uppercase tracking-wide {statusStyle(
            status,
          ).badge}"
        >
          {$_(`monitoring.status.${status}`)}
          {#if since !== null && (status === 'down' || status === 'degraded')}
            · {formatDuration(since)}
          {/if}
        </span>
        {#if serviceName}
          <span
            class="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-px text-[10px] text-slate-400"
          >
            <Layers class="h-3 w-3" />{serviceName}
          </span>
        {/if}
      </div>
    </div>
  </a>

  <div class="min-w-0">
    {#if stats}
      <UptimeBars {bars} unit={range} />
      <div class="mt-1 flex justify-between text-[10px] text-slate-600">
        <span
          >{range === 'hour'
            ? $_('monitoring.bars.hoursAgo', { values: { count: 24 } })
            : $_('monitoring.bars.daysAgo', { values: { count: 60 } })}</span
        >
        <span>{range === 'hour' ? $_('monitoring.bars.now') : $_('monitoring.bars.today')}</span>
      </div>
    {:else}
      <div class="h-8 rounded bg-slate-800/40"></div>
    {/if}
  </div>

  <div class="text-left md:text-right">
    <p class="text-lg font-bold tabular-nums {uptimeTone(uptime)}">{formatUptime(uptime)}</p>
    <p class="text-[10px] uppercase tracking-wide text-slate-500">
      {range === 'hour' ? $_('monitoring.uptime.h24') : $_('monitoring.uptime.d30')}
    </p>
  </div>

  <div class="flex items-center gap-3 md:justify-end">
    <Sparkline
      values={(stats?.hourlyBars ?? []).map((bar) => bar.latencyAvg)}
      {status}
      width={72}
      height={28}
    />
    <div class="text-right">
      <p class="text-sm font-semibold tabular-nums text-slate-200">
        {formatLatency(stats?.latency24h.avg)}
      </p>
      <p class="text-[10px] text-slate-500">p95 {formatLatency(stats?.latency24h.p95)}</p>
    </div>
  </div>
</div>
