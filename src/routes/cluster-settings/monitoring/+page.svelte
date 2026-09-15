<script lang="ts">
  import { onMount } from 'svelte';
  import { Activity, BellOff, CheckCircle2, Clock, RefreshCw, TriangleAlert } from '@lucide/svelte';
  import { _ } from '$lib/i18n';
  import type { EventStoreMetrics, EventNameMetrics, StoredEvent } from '$modules/events';

  type Subscription = { event: string; handlers: string[] };

  export let data: {
    metrics: EventStoreMetrics;
    subscriptions: Subscription[];
    catalog: string[];
    events: StoredEvent[];
  };

  let metrics: EventStoreMetrics = data.metrics;
  let subscriptions: Subscription[] = data.subscriptions;
  let catalog: string[] = data.catalog;
  let events: StoredEvent[] = data.events;
  let refreshing = false;
  let error = '';

  const STATUS_STYLES: Record<StoredEvent['status'], string> = {
    processed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    failed: 'border-red-200 bg-red-50 text-red-700',
    unsubscribed: 'border-slate-200 bg-slate-50 text-slate-600',
  };

  async function refresh() {
    refreshing = true;
    try {
      const response = await fetch('/cluster-settings/monitoring/metrics');
      if (!response.ok) throw new Error(String(response.status));
      const payload = await response.json();
      metrics = payload.metrics;
      subscriptions = payload.subscriptions;
      catalog = payload.catalog;
      events = payload.events;
      error = '';
    } catch {
      error = $_('clusterSettings.monitoring.refreshFailed');
    } finally {
      refreshing = false;
    }
  }

  onMount(() => {
    const timer = setInterval(refresh, 10_000);
    return () => clearInterval(timer);
  });

  function formatDate(value: string | null) {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }

  $: ttlMinutes = Math.round(metrics.ttlMs / 60_000);
  // every catalog event is listed, even the ones that never fired
  $: eventRows = catalog
    .map((name) => {
      const row = metrics.byEvent.find((entry) => entry.name === name);
      const counters: EventNameMetrics = row ?? {
        emitted: 0,
        processed: 0,
        failed: 0,
        withoutSubscribers: 0,
        expired: 0,
      };
      return {
        name,
        ...counters,
        handlers: subscriptions.find((entry) => entry.event === name)?.handlers ?? [],
      };
    })
    .sort((left, right) => right.emitted - left.emitted || left.name.localeCompare(right.name));
  $: cards = [
    {
      key: 'total',
      label: $_('clusterSettings.monitoring.totalEvents'),
      value: metrics.totalEmitted,
      icon: Activity,
      tone: 'text-blue-600',
    },
    {
      key: 'processed',
      label: $_('clusterSettings.monitoring.processedEvents'),
      value: metrics.totalProcessed,
      icon: CheckCircle2,
      tone: 'text-emerald-600',
    },
    {
      key: 'without-subscribers',
      label: $_('clusterSettings.monitoring.withoutSubscribers'),
      value: metrics.totalWithoutSubscribers,
      icon: BellOff,
      tone: 'text-amber-600',
    },
  ];
</script>

<svelte:head>
  <title>{$_('clusterSettings.monitoring.title')} - {$_('clusterSettings.title')}</title>
</svelte:head>

<div class="space-y-6">
  <section class="flex items-start justify-between gap-4">
    <div>
      <h3 class="text-xl font-semibold text-slate-900">
        {$_('clusterSettings.monitoring.title')}
      </h3>
      <p class="mt-2 text-sm text-slate-600">
        {$_('clusterSettings.monitoring.description')}
      </p>
    </div>
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      disabled={refreshing}
      on:click={refresh}
    >
      <RefreshCw class="h-4 w-4 {refreshing ? 'animate-spin' : ''}" />
      {$_('clusterSettings.monitoring.refresh')}
    </button>
  </section>

  {#if error}
    <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </div>
  {/if}

  <section class="grid gap-4 sm:grid-cols-3">
    {#each cards as card (card.key)}
      <div class="rounded-md border border-slate-200 bg-white px-4 py-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium tracking-wide text-slate-500 uppercase"
            >{card.label}</span
          >
          <svelte:component this={card.icon} class="h-4 w-4 {card.tone}" />
        </div>
        <p class="mt-2 text-3xl font-semibold text-slate-900">{card.value}</p>
      </div>
    {/each}
  </section>

  <section class="grid gap-4 rounded-md border border-slate-200 bg-white px-4 py-4 sm:grid-cols-4">
    <div>
      <dt class="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {$_('clusterSettings.monitoring.pending')}
      </dt>
      <dd class="mt-1 text-sm font-semibold text-slate-900">{metrics.pending}</dd>
    </div>
    <div>
      <dt class="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {$_('clusterSettings.monitoring.failed')}
      </dt>
      <dd class="mt-1 text-sm font-semibold text-slate-900">{metrics.totalFailed}</dd>
    </div>
    <div>
      <dt class="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {$_('clusterSettings.monitoring.expired')}
      </dt>
      <dd class="mt-1 text-sm font-semibold text-slate-900">{metrics.totalExpired}</dd>
    </div>
    <div>
      <dt class="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {$_('clusterSettings.monitoring.lifetime')}
      </dt>
      <dd class="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-slate-900">
        <Clock class="h-4 w-4 text-slate-400" />
        {ttlMinutes}
        {$_('clusterSettings.monitoring.minutes')}
      </dd>
    </div>
  </section>

  <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
    <div class="border-b border-slate-200 px-4 py-3">
      <h4 class="text-sm font-semibold text-slate-900">
        {$_('clusterSettings.monitoring.byEvent')}
      </h4>
    </div>
    {#if eventRows.length === 0}
      <p class="px-4 py-6 text-sm text-slate-500">{$_('clusterSettings.monitoring.empty')}</p>
    {:else}
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th class="px-4 py-2 font-medium">{$_('clusterSettings.monitoring.event')}</th>
            <th class="px-4 py-2 font-medium">{$_('clusterSettings.monitoring.subscribers')}</th>
            <th class="px-4 py-2 font-medium">{$_('clusterSettings.monitoring.totalEvents')}</th>
            <th class="px-4 py-2 font-medium">{$_('clusterSettings.monitoring.processedEvents')}</th
            >
            <th class="px-4 py-2 font-medium">
              {$_('clusterSettings.monitoring.withoutSubscribers')}
            </th>
            <th class="px-4 py-2 font-medium">{$_('clusterSettings.monitoring.expired')}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each eventRows as row (row.name)}
            <tr>
              <td class="px-4 py-2 font-mono text-xs text-slate-900">{row.name}</td>
              <td class="px-4 py-2 text-slate-700">
                {#if row.handlers.length === 0}
                  <span class="inline-flex items-center gap-1 text-amber-700">
                    <TriangleAlert class="h-3.5 w-3.5" />
                    0
                  </span>
                {:else}
                  <span title={row.handlers.join(', ')}>{row.handlers.length}</span>
                {/if}
              </td>
              <td class="px-4 py-2 text-slate-700">{row.emitted}</td>
              <td class="px-4 py-2 text-slate-700">{row.processed}</td>
              <td class="px-4 py-2 text-slate-700">{row.withoutSubscribers}</td>
              <td class="px-4 py-2 text-slate-700">{row.expired}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
    <div class="border-b border-slate-200 px-4 py-3">
      <h4 class="text-sm font-semibold text-slate-900">
        {$_('clusterSettings.monitoring.recent')}
      </h4>
      <p class="mt-1 text-xs text-slate-500">{$_('clusterSettings.monitoring.recentHint')}</p>
    </div>
    {#if events.length === 0}
      <p class="px-4 py-6 text-sm text-slate-500">{$_('clusterSettings.monitoring.empty')}</p>
    {:else}
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th class="px-4 py-2 font-medium">{$_('clusterSettings.monitoring.event')}</th>
            <th class="px-4 py-2 font-medium">{$_('clusterSettings.monitoring.status')}</th>
            <th class="px-4 py-2 font-medium">{$_('clusterSettings.monitoring.subscribers')}</th>
            <th class="px-4 py-2 font-medium">{$_('clusterSettings.monitoring.occurredAt')}</th>
            <th class="px-4 py-2 font-medium">{$_('clusterSettings.monitoring.expiresAt')}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each events as storedEvent (storedEvent.id)}
            <tr>
              <td class="px-4 py-2 font-mono text-xs text-slate-900">{storedEvent.name}</td>
              <td class="px-4 py-2">
                <span
                  class="inline-flex rounded-full border px-2 py-0.5 text-xs font-medium {STATUS_STYLES[
                    storedEvent.status
                  ]}"
                >
                  {$_(`clusterSettings.monitoring.statuses.${storedEvent.status}`)}
                </span>
              </td>
              <td class="px-4 py-2 text-slate-700">{storedEvent.subscribers}</td>
              <td class="px-4 py-2 text-slate-700">{formatDate(storedEvent.occurredAt)}</td>
              <td class="px-4 py-2 text-slate-700">{formatDate(storedEvent.expiresAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</div>
