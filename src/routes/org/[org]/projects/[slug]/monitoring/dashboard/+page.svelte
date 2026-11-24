<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import { Activity, CircleAlert, Cpu, Gauge, Plus, Search, Timer, Zap } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import { formatLatency, formatUptime, secondsSince, uptimeTone } from '#lib/monitoring/format';
  import MonitorRow from '#lib/components/monitoring/MonitorRow.svelte';
  import { Tabs, tabId, tabPanelId } from '#lib/components/ui';
  import StatusDot from '#lib/components/monitoring/StatusDot.svelte';
  import type { MonitorRowData, ServiceOption } from '#lib/components/monitoring/types';
  import NewMonitorModal from '#lib/components/monitoring/NewMonitorModal.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let newOpen = $state(false);
  // el enlace sigue llevando a /monitors/new (nueva pestaña, sin JavaScript); un clic normal abre el modal
  function openNew(event: MouseEvent) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    newOpen = true;
  }

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
  let filterTabs = $derived(
    filters.map((option) => ({
      value: option,
      label: option === 'all' ? $_('monitoring.dashboard.all') : $_(`monitoring.status.${option}`),
    })),
  );
  let rangeTabs = $derived([
    { value: 'hour', label: '24 h' },
    { value: 'day', label: $_('monitoring.dashboard.days', { values: { count: 60 } }) },
  ]);

  const glow: Record<string, string> = {
    down: 'bg-danger/20',
    degraded: 'bg-warn/15',
    up: 'bg-ok/10',
    none: 'bg-brand-500/10',
  };
</script>

<svelte:head><title>{$_('monitoring.dashboard.title')} - {data.project.name}</title></svelte:head>

<div class="space-y-6">
  <!-- hero -->
  <section class="k-card relative overflow-hidden p-6 sm:p-8">
    <div
      class="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl {glow[
        overall
      ]}"
    ></div>
    <div class="relative flex flex-wrap items-start justify-between gap-6">
      <div class="flex items-center gap-4">
        <div class="grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-ink-900">
          <StatusDot status={overall === 'none' ? 'pending' : overall} size="lg" />
        </div>
        <div>
          <p class="k-nav-heading mb-0 px-0">{$_('monitoring.dashboard.eyebrow')}</p>
          <h1 class="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
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
          <p class="mt-1 text-sm text-fg-subtle">
            {$_('monitoring.dashboard.updated', { values: { seconds: updatedAgo } })}
          </p>
        </div>
      </div>
      {#if data.monitoringPermissions.canCreate}
        <a
          href={`${data.monitoringBase}/monitors/new`}
          onclick={openNew}
          class="k-btn k-btn-primary"
        >
          <Plus class="h-4 w-4" />{$_('monitoring.newMonitor')}
        </a>
      {/if}
    </div>

    <!-- kpis -->
    <div class="relative mt-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div class="rounded-xl border border-white/8 bg-ink-900/60 p-4">
        <p class="flex items-center gap-1.5 text-xs text-fg-subtle">
          <Activity class="h-3.5 w-3.5" />{$_('monitoring.dashboard.monitors')}
        </p>
        <p class="mt-2 text-2xl font-semibold tabular-nums text-white">{data.monitors.length}</p>
        <p class="mt-1 flex flex-wrap gap-x-2 text-[11px] text-fg-subtle">
          <span class="text-ok">{counts.up} up</span>
          {#if counts.degraded}<span class="text-warn"
              >{counts.degraded} {$_('monitoring.status.degraded').toLowerCase()}</span
            >{/if}
          {#if counts.down}<span class="text-red-400">{counts.down} down</span>{/if}
          {#if counts.paused}<span
              >{counts.paused} {$_('monitoring.status.paused').toLowerCase()}</span
            >{/if}
        </p>
      </div>
      <div class="rounded-xl border border-white/8 bg-ink-900/60 p-4">
        <p class="flex items-center gap-1.5 text-xs text-fg-subtle">
          <Gauge class="h-3.5 w-3.5" />{$_('monitoring.uptime.h24')}
        </p>
        <p class="mt-2 text-2xl font-semibold tabular-nums {uptimeTone(uptime24)}">
          {formatUptime(uptime24)}
        </p>
      </div>
      <div class="rounded-xl border border-white/8 bg-ink-900/60 p-4">
        <p class="flex items-center gap-1.5 text-xs text-fg-subtle">
          <Timer class="h-3.5 w-3.5" />{$_('monitoring.uptime.d30')}
        </p>
        <p class="mt-2 text-2xl font-semibold tabular-nums {uptimeTone(uptime30)}">
          {formatUptime(uptime30)}
        </p>
      </div>
      <div class="rounded-xl border border-white/8 bg-ink-900/60 p-4">
        <p class="flex items-center gap-1.5 text-xs text-fg-subtle">
          <Zap class="h-3.5 w-3.5" />{$_('monitoring.dashboard.avgLatency')}
        </p>
        <p class="mt-2 text-2xl font-semibold tabular-nums text-white">
          {formatLatency(latency === null ? null : Math.round(latency))}
        </p>
      </div>
      <div class="col-span-2 rounded-xl border border-white/8 bg-ink-900/60 p-4 lg:col-span-1">
        <p class="flex items-center gap-1.5 text-xs text-fg-subtle">
          <CircleAlert class="h-3.5 w-3.5" />{$_('monitoring.dashboard.openIncidents')}
        </p>
        <p
          class="mt-2 text-2xl font-semibold tabular-nums {counts.down + counts.degraded
            ? 'text-red-400'
            : 'text-white'}"
        >
          {counts.down + counts.degraded}
        </p>
      </div>
    </div>
  </section>

  <!-- toolbar -->
  <div class="flex flex-wrap items-center gap-3">
    <label class="relative min-w-56 flex-1">
      <span class="sr-only">{$_('monitoring.dashboard.search')}</span>
      <Search
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
      />
      <input
        bind:value={query}
        placeholder={$_('monitoring.dashboard.search')}
        class="k-input h-9 pl-9"
      />
    </label>
    <Tabs
      variant="segmented"
      label={$_('monitoring.dashboard.filterLabel')}
      idPrefix="monitor-filter"
      items={filterTabs}
      bind:value={() => filter, (next) => (filter = next as typeof filter)}
    />
    <Tabs
      variant="segmented"
      label={$_('monitoring.dashboard.rangeLabel')}
      idPrefix="monitor-range"
      items={rangeTabs}
      bind:value={() => range, (next) => (range = next as typeof range)}
    />
  </div>

  <!-- monitors -->
  <div
    role="tabpanel"
    id={tabPanelId('monitor-filter', filter)}
    aria-labelledby={tabId('monitor-filter', filter)}
  >
    {#if data.monitors.length === 0}
      <div class="k-card border-dashed p-12 text-center">
        <span
          class="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-500/10 text-brand-400"
        >
          <Activity class="h-6 w-6" />
        </span>
        <p class="mt-4 text-base font-semibold text-white">
          {$_('monitoring.dashboard.emptyTitle')}
        </p>
        <p class="mx-auto mt-1 max-w-md text-sm text-fg-muted">
          {$_('monitoring.dashboard.emptyDescription')}
        </p>
        {#if data.monitoringPermissions.canCreate}
          <a
            href={`${data.monitoringBase}/monitors/new`}
            onclick={openNew}
            class="k-btn k-btn-primary mt-6"
          >
            <Plus class="h-4 w-4" />{$_('monitoring.newMonitor')}
          </a>
        {/if}
      </div>
    {:else if visible.length === 0}
      <p class="k-card p-8 text-center text-sm text-fg-subtle">
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
  </div>

  <!-- runtime -->
  <div
    class="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-white/8 px-4 py-3 text-xs text-fg-subtle"
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
      <span class="text-warn"
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
  </div>
</div>

{#if data.monitoringPermissions.canCreate}
  <NewMonitorModal
    bind:open={newOpen}
    monitoringBase={data.monitoringBase}
    services={data.services}
    methods={data.newMonitor.methods}
    intervals={data.newMonitor.intervals}
    values={data.newMonitor.values}
    canTest={data.monitoringPermissions.canTest}
  />
{/if}
