<script lang="ts">
  import { Activity, Plus } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import { formatUptime, uptimeTone } from '#lib/monitoring/format';
  import MonitorRow from './MonitorRow.svelte';
  import type { MonitorRowData } from './types';

  let {
    serviceId,
    monitoring,
  }: {
    serviceId: string;
    monitoring: { base: string; canCreate: boolean; monitors: MonitorRowData[] };
  } = $props();

  // the service is as healthy as its worst monitor
  let worst = $derived.by(() => {
    const statuses = monitoring.monitors.map((row) =>
      row.monitor.enabled ? (row.stats?.status ?? 'pending') : 'paused',
    );
    if (statuses.includes('down')) return 'down';
    if (statuses.includes('degraded')) return 'degraded';
    return statuses.includes('up') ? 'up' : 'none';
  });
  let uptime = $derived.by(() => {
    const values = monitoring.monitors
      .map((row) => row.stats?.uptime.d30)
      .filter((value): value is number => typeof value === 'number');
    return values.length ? Math.min(...values) : null;
  });
</script>

<section class="k-card p-5">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-2">
      <Activity
        class="h-4 w-4 {worst === 'down'
          ? 'text-red-400'
          : worst === 'degraded'
            ? 'text-warn'
            : 'text-ok'}"
      />
      <h2 class="text-sm font-semibold text-white">{$_('monitoring.service.title')}</h2>
      {#if monitoring.monitors.length}
        <span class="text-xs text-fg-subtle">
          · {$_('monitoring.uptime.d30')}
          <span class="font-semibold {uptimeTone(uptime)}">{formatUptime(uptime)}</span>
        </span>
      {/if}
    </div>
    {#if monitoring.canCreate}
      <a
        href={`${monitoring.base}/monitors/new?serviceId=${serviceId}`}
        class="k-btn k-btn-secondary k-btn-sm"
      >
        <Plus class="h-3.5 w-3.5" />{$_('monitoring.service.add')}
      </a>
    {/if}
  </div>

  {#if monitoring.monitors.length === 0}
    <p class="mt-3 text-sm text-fg-subtle">{$_('monitoring.service.empty')}</p>
  {:else}
    <div class="mt-4 space-y-2">
      {#each monitoring.monitors as row (row.monitor.id)}
        <MonitorRow {row} range="hour" href={`${monitoring.base}/monitors/${row.monitor.id}`} />
      {/each}
    </div>
  {/if}
</section>
