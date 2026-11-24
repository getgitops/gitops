<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import { Activity, CircleAlert, Cpu, Gauge, Plus, Search, Timer, Zap } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import { formatLatency, formatUptime, secondsSince, uptimeTone } from '#lib/monitoring/format';
  import MonitorRow from '#lib/components/monitoring/MonitorRow.svelte';
  import StatusDot from '#lib/components/monitoring/StatusDot.svelte';
  import type { MonitorRowData, ServiceOption } from '#lib/components/monitoring/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const REFRESH_MS = 30_000;
  let range = $state<'hour' | 'day'>('day');
  let query = $state('');
  let filter = $state<'all' | 'down' | 'degraded' | 'up' | 'paused'>('all');
  let now = $state(Date.now());

  onMount(() => {
    const refresh = setInterval(() => void invalidateAll(), REFRESH_MS);
    const tick = setInterval(() => (now = Date.now()), 1_000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  });

  const statusOf = (row: MonitorRowData) =>
    row.monitor.enabled ? (row.stats?.status ?? 'pending') : 'paused';

  let counts = $derived.by(() => {
    const result = { up: 0, down: 0, degraded: 0, paused: 0, pending: 0 };
    for (const row of data.monitors) result[statusOf(row) as keyof typeof result]++;
    return result;
  });
  let active = $derived(data.monitors.filter((row) => row.monitor.enabled && row.stats));
  let average = (values: (number | null | undefined)[]) => {
    const known = values.filter((value): value is number => typeof value === 'number');
    return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
  };
  let uptime24 = $derived(average(active.map((row) => row.stats?.uptime.h24)));
  let uptime30 = $derived(average(active.map((row) => row.stats?.uptime.d30)));
  let latency = $derived(average(active.map((row) => row.stats?.latency24h.avg)));
  let overall = $derived(
    counts.down > 0 ? 'down' : counts.degraded > 0 ? 'degraded' : active.length ? 'up' : 'none',
  );

  let serviceNames = $derived(
    new Map(data.services.map((service: ServiceOption) => [service.id, service.name])),
  );
  let visible = $derived(
    data.monitors
      .filter((row: MonitorRowData) => filter === 'all' || statusOf(row) === filter)
      .filter((row: MonitorRowData) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
          row.monitor.name.toLowerCase().includes(q) ||
          row.monitor.displayUrl.toLowerCase().includes(q) ||
          (serviceNames.get(row.monitor.serviceId ?? '') ?? '').toLowerCase().includes(q)
        );
      })
      // problems first, then by name
      .sort((a: MonitorRowData, b: MonitorRowData) => {
        const rank: Record<string, number> = { down: 0, degraded: 1, pending: 2, up: 3, paused: 4 };
        return (
          rank[statusOf(a)] - rank[statusOf(b)] || a.monitor.name.localeCompare(b.monitor.name)
        );
      }),
  );
  let updatedAgo = $derived(Math.round(secondsSince(data.loadedAt, now) ?? 0));

  const filters = ['all', 'down', 'degraded', 'up', 'paused'] as const;
</script>

<svelte:head><title>{$_('monitoring.dashboard.title')} - {data.project.name}</title></svelte:head>

<div class="space-y-6">
  <!-- hero -->
  <section
    class="relative overflow-hidden rounded-3xl border p-6 sm:p-8 {overall === 'down'
      ? 'border-rose-500/30 bg-gradient-to-br from-rose-500/15 via-[var(--surface)] to-[var(--surface)]'
      : overall === 'degraded'
        ? 'border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-[var(--surface)] to-[var(--surface)]'
        : 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-[var(--surface)] to-[var(--surface)]'}"
  >
    <div
      class="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl {overall ===
      'down'
        ? 'bg-rose-500/20'
        : overall === 'degraded'
          ? 'bg-amber-500/20'
          : 'bg-emerald-500/10'}"
    ></div>
    <div class="relative flex flex-wrap items-start justify-between gap-6">
      <div class="flex items-center gap-4">
        <div
          class="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/20"
        >
          <StatusDot status={overall === 'none' ? 'pending' : overall} size="lg" />
        </div>
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {$_('monitoring.dashboard.eyebrow')}
          </p>
          <h1 class="mt-1 text-2xl font-bold text-white sm:text-3xl">
            {#if overall === 'down'}
              {$_('monitoring.dashboard.headlineDown', { values: { count: counts.down } })}
            {:else if overall === 'degraded'}
              {$_('monitoring.dashboard.headlineDegraded', { values: { count: counts.degraded } })}
            {:else if overall === 'up'}
              {$_('monitoring.dashboard.headlineUp')}
            {:else}
              {$_('monitoring.dashboard.headlineEmpty')}
            {/if}
          </h1>
          <p class="mt-1 text-sm text-slate-400">
            {$_('monitoring.dashboard.updated', { values: { seconds: updatedAgo } })}
          </p>
        </div>
      </div>
      {#if data.monitoringPermissions.canCreate}
        <a
          href={`${data.monitoringBase}/monitors/new`}
          class="btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
        >
          <Plus class="h-4 w-4" />{$_('monitoring.newMonitor')}
        </a>
      {/if}
    </div>

    <!-- kpis -->
    <div class="relative mt-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div class="rounded-2xl border border-white/5 bg-black/20 p-4">
        <p
          class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
        >
          <Activity class="h-3.5 w-3.5" />{$_('monitoring.dashboard.monitors')}
        </p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-white">{data.monitors.length}</p>
        <p class="mt-1 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
          <span class="text-emerald-400">{counts.up} up</span>
          {#if counts.degraded}<span class="text-amber-400"
              >{counts.degraded} {$_('monitoring.status.degraded').toLowerCase()}</span
            >{/if}
          {#if counts.down}<span class="text-rose-400">{counts.down} down</span>{/if}
          {#if counts.paused}<span
              >{counts.paused} {$_('monitoring.status.paused').toLowerCase()}</span
            >{/if}
        </p>
      </div>
      <div class="rounded-2xl border border-white/5 bg-black/20 p-4">
        <p
          class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
        >
          <Gauge class="h-3.5 w-3.5" />{$_('monitoring.uptime.h24')}
        </p>
        <p class="mt-2 text-2xl font-bold tabular-nums {uptimeTone(uptime24)}">
          {formatUptime(uptime24)}
        </p>
      </div>
      <div class="rounded-2xl border border-white/5 bg-black/20 p-4">
        <p
          class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
        >
          <Timer class="h-3.5 w-3.5" />{$_('monitoring.uptime.d30')}
        </p>
        <p class="mt-2 text-2xl font-bold tabular-nums {uptimeTone(uptime30)}">
          {formatUptime(uptime30)}
        </p>
      </div>
      <div class="rounded-2xl border border-white/5 bg-black/20 p-4">
        <p
          class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
        >
          <Zap class="h-3.5 w-3.5" />{$_('monitoring.dashboard.avgLatency')}
        </p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-white">
          {formatLatency(latency === null ? null : Math.round(latency))}
        </p>
      </div>
      <div class="col-span-2 rounded-2xl border border-white/5 bg-black/20 p-4 lg:col-span-1">
        <p
          class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
        >
          <CircleAlert class="h-3.5 w-3.5" />{$_('monitoring.dashboard.openIncidents')}
        </p>
        <p
          class="mt-2 text-2xl font-bold tabular-nums {counts.down + counts.degraded
            ? 'text-rose-400'
            : 'text-white'}"
        >
          {counts.down + counts.degraded}
        </p>
      </div>
    </div>
  </section>

  <!-- toolbar -->
  <div class="flex flex-wrap items-center gap-3">
    <div class="relative min-w-[14rem] flex-1">
      <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        bind:value={query}
        placeholder={$_('monitoring.dashboard.search')}
        class="field-input w-full rounded-xl border py-2.5 pl-10 pr-4 text-sm"
      />
    </div>
    <div
      class="flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 text-xs font-semibold"
    >
      {#each filters as option (option)}
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 transition {filter === option
            ? 'bg-[#16294a] text-white'
            : 'text-slate-400 hover:text-slate-200'}"
          onclick={() => (filter = option)}
        >
          {option === 'all' ? $_('monitoring.dashboard.all') : $_(`monitoring.status.${option}`)}
        </button>
      {/each}
    </div>
    <div
      class="flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 text-xs font-semibold"
    >
      <button
        type="button"
        class="rounded-lg px-3 py-1.5 transition {range === 'hour'
          ? 'bg-[#16294a] text-white'
          : 'text-slate-400 hover:text-slate-200'}"
        onclick={() => (range = 'hour')}>24 h</button
      >
      <button
        type="button"
        class="rounded-lg px-3 py-1.5 transition {range === 'day'
          ? 'bg-[#16294a] text-white'
          : 'text-slate-400 hover:text-slate-200'}"
        onclick={() => (range = 'day')}
        >{$_('monitoring.dashboard.days', { values: { count: 60 } })}</button
      >
    </div>
  </div>

  <!-- monitors -->
  {#if data.monitors.length === 0}
    <div
      class="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center"
    >
      <Activity class="mx-auto h-10 w-10 text-slate-600" />
      <p class="mt-4 text-base font-semibold text-slate-200">
        {$_('monitoring.dashboard.emptyTitle')}
      </p>
      <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">
        {$_('monitoring.dashboard.emptyDescription')}
      </p>
      {#if data.monitoringPermissions.canCreate}
        <a
          href={`${data.monitoringBase}/monitors/new`}
          class="btn-primary mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
        >
          <Plus class="h-4 w-4" />{$_('monitoring.newMonitor')}
        </a>
      {/if}
    </div>
  {:else if visible.length === 0}
    <p
      class="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-slate-500"
    >
      {$_('monitoring.dashboard.noMatches')}
    </p>
  {:else}
    <div class="space-y-2">
      {#each visible as row (row.monitor.id)}
        <MonitorRow
          {row}
          {range}
          href={`${data.monitoringBase}/monitors/${row.monitor.id}`}
          serviceName={row.monitor.serviceId
            ? (serviceNames.get(row.monitor.serviceId) ?? null)
            : null}
        />
      {/each}
    </div>
  {/if}

  <!-- runtime -->
  <footer
    class="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-xs text-slate-500"
  >
    <span class="inline-flex items-center gap-1.5">
      <Cpu class="h-3.5 w-3.5" />
      {$_('monitoring.dashboard.workers', { values: { count: data.info.workers.length } })}
      {#if data.info.workers.some((worker) => worker.region)}
        · {[...new Set(data.info.workers.map((worker) => worker.region).filter(Boolean))].join(
          ', ',
        )}
      {/if}
    </span>
    <span
      >{$_('monitoring.dashboard.scheduled', {
        values: { count: data.info.scheduler.monitors },
      })}</span
    >
    {#if data.info.scheduler.overdue > 0}
      <span class="text-amber-400"
        >{$_('monitoring.dashboard.overdue', {
          values: { count: data.info.scheduler.overdue },
        })}</span
      >
    {/if}
    <span
      >{data.info.dedicatedRepository
        ? $_('monitoring.dashboard.dedicatedRepo')
        : $_('monitoring.dashboard.sharedRepo')}</span
    >
  </footer>
</div>
