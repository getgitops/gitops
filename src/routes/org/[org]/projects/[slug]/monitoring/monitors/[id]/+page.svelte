<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import {
    ArrowLeft,
    FlaskConical,
    Layers,
    LoaderCircle,
    Pause,
    Pencil,
    Play,
    ShieldCheck,
    Trash2,
  } from '@lucide/svelte';
  import { _, locale } from '#lib/i18n';
  import {
    formatDuration,
    formatLatency,
    formatUptime,
    secondsSince,
    statusStyle,
    uptimeTone,
  } from '#lib/monitoring/format';
  import StatusDot from '#lib/components/monitoring/StatusDot.svelte';
  import TestResultPanel from '#lib/components/monitoring/TestResultPanel.svelte';
  import UptimeBars from '#lib/components/monitoring/UptimeBars.svelte';
  import LatencyChart from '#lib/components/monitoring/LatencyChart.svelte';
  import type { TestResult } from '#lib/components/monitoring/types';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let monitor = $derived(data.monitor);
  let stats = $derived(data.stats);
  let perms = $derived(data.monitoringPermissions);
  let status = $derived(monitor.enabled ? (stats?.status ?? 'pending') : 'paused');
  let test = $derived((form && 'test' in form ? form.test : null) as TestResult | null);
  let testing = $state(false);
  let confirmDelete = $state(false);
  let now = $state(Date.now());
  let projectBase = $derived(data.monitoringBase.replace(/\/monitoring$/, ''));

  onMount(() => {
    const refresh = setInterval(() => void invalidateAll(), 30_000);
    const tick = setInterval(() => (now = Date.now()), 1_000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  });

  let since = $derived(secondsSince(stats?.since, now));

  function dateTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString($locale, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function interval(seconds: number): string {
    return seconds < 60
      ? $_('monitoring.form.everySeconds', { values: { count: seconds } })
      : $_('monitoring.form.everyMinutes', { values: { count: seconds / 60 } });
  }

  let uptimes = $derived([
    { key: 'h24', label: $_('monitoring.uptime.h24'), value: stats?.uptime.h24 },
    { key: 'd7', label: $_('monitoring.uptime.d7'), value: stats?.uptime.d7 },
    { key: 'd30', label: $_('monitoring.uptime.d30'), value: stats?.uptime.d30 },
    { key: 'd90', label: $_('monitoring.uptime.d90'), value: stats?.uptime.d90 },
  ]);
</script>

<svelte:head><title>{monitor.name} - {$_('monitoring.title')}</title></svelte:head>

<div class="space-y-6">
  <a
    href={`${data.monitoringBase}/dashboard`}
    class="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"
  >
    <ArrowLeft class="h-3.5 w-3.5" />{$_('monitoring.backToDashboard')}
  </a>

  <!-- header -->
  <section
    class="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8"
  >
    <div
      class="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl {status ===
      'down'
        ? 'bg-rose-500/20'
        : status === 'degraded'
          ? 'bg-amber-500/20'
          : status === 'up'
            ? 'bg-emerald-500/10'
            : 'bg-slate-500/10'}"
    ></div>
    <div class="relative flex flex-wrap items-start justify-between gap-6">
      <div class="flex min-w-0 items-start gap-4">
        <div
          class="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/20"
        >
          <StatusDot {status} size="lg" />
        </div>
        <div class="min-w-0">
          <h1 class="truncate text-2xl font-bold text-white sm:text-3xl">{monitor.name}</h1>
          <p class="mt-1 truncate font-mono text-sm text-slate-400">
            <span class="mr-1 rounded bg-white/5 px-1.5 py-0.5 text-xs font-semibold text-slate-300"
              >{monitor.method}</span
            >{monitor.displayUrl}
          </p>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span
              class="rounded-full border px-2.5 py-0.5 font-semibold uppercase tracking-wide {statusStyle(
                status,
              ).badge}"
            >
              {$_(`monitoring.status.${status}`)}
            </span>
            {#if since !== null && status !== 'paused' && status !== 'pending'}
              <span class="text-slate-400"
                >{$_('monitoring.detail.since', {
                  values: { duration: formatDuration(since) },
                })}</span
              >
            {/if}
            {#if data.service}
              <a
                href={`${projectBase}/code-report/services/${data.service.slug}`}
                class="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-0.5 text-slate-300 hover:border-sky-500/40 hover:text-sky-300"
              >
                <Layers class="h-3 w-3" />{data.service.name}
              </a>
            {/if}
            {#if stats?.lastCheck}
              <span class="text-slate-500"
                >{$_('monitoring.detail.lastCheck', {
                  values: { ago: formatDuration(secondsSince(stats.lastCheck.startedAt, now)) },
                })}</span
              >
            {/if}
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        {#if perms.canTest}
          <form
            method="POST"
            action="?/testSaved"
            use:enhance={() => {
              testing = true;
              return async ({ update }) => {
                await update({ reset: false });
                testing = false;
              };
            }}
          >
            <button
              class="btn-secondary inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold"
              disabled={testing}
            >
              {#if testing}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<FlaskConical
                  class="h-4 w-4"
                />{/if}
              {$_('monitoring.actions.runNow')}
            </button>
          </form>
        {/if}
        {#if perms.canUpdate}
          <form method="POST" action="?/toggle" use:enhance>
            <input type="hidden" name="enabled" value={monitor.enabled ? 'false' : 'true'} />
            <button
              class="btn-secondary inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold"
            >
              {#if monitor.enabled}<Pause class="h-4 w-4" />{$_(
                  'monitoring.actions.pause',
                )}{:else}<Play class="h-4 w-4" />{$_('monitoring.actions.resume')}{/if}
            </button>
          </form>
          <a
            href={`${data.monitoringBase}/monitors/${monitor.id}/edit`}
            class="btn-secondary inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold"
          >
            <Pencil class="h-4 w-4" />{$_('monitoring.actions.edit')}
          </a>
        {/if}
        {#if perms.canDelete}
          <button
            type="button"
            class="btn-ghost rounded-xl p-2.5 hover:text-rose-400"
            title={$_('monitoring.actions.delete')}
            onclick={() => (confirmDelete = true)}
          >
            <Trash2 class="h-4 w-4" />
          </button>
        {/if}
      </div>
    </div>

    {#if stats?.openIncident}
      <div
        class="relative mt-6 rounded-2xl border px-4 py-3 text-sm {statusStyle(
          stats.openIncident.status,
        ).badge}"
      >
        <strong>{$_(`monitoring.detail.openIncident.${stats.openIncident.status}`)}</strong>
        — {stats.openIncident.cause ? $_(`monitoring.causes.${stats.openIncident.cause}`) : ''}
        {#if stats.openIncident.httpStatus}(HTTP {stats.openIncident.httpStatus}){/if}
        {#if stats.openIncident.error}<span class="opacity-80">· {stats.openIncident.error}</span
          >{/if}
      </div>
    {/if}
  </section>

  {#if test}
    <TestResultPanel result={test} />
  {/if}

  <!-- kpis -->
  <div class="grid grid-cols-2 gap-3 lg:grid-cols-6">
    {#each uptimes as item (item.key)}
      <div class="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
        <p class="mt-2 text-2xl font-bold tabular-nums {uptimeTone(item.value)}">
          {formatUptime(item.value)}
        </p>
      </div>
    {/each}
    <div class="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {$_('monitoring.detail.avgLatency')}
      </p>
      <p class="mt-2 text-2xl font-bold tabular-nums text-white">
        {formatLatency(stats?.latency24h.avg)}
      </p>
    </div>
    <div class="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">p95 · 24 h</p>
      <p class="mt-2 text-2xl font-bold tabular-nums text-white">
        {formatLatency(stats?.latency24h.p95)}
      </p>
    </div>
  </div>

  <!-- bars -->
  {#if stats}
    <section
      class="space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
    >
      <div>
        <div class="mb-3 flex items-baseline justify-between">
          <h2 class="text-sm font-semibold text-slate-100">{$_('monitoring.detail.last90Days')}</h2>
          <span class="text-sm font-bold tabular-nums {uptimeTone(stats.uptime.d90)}"
            >{formatUptime(stats.uptime.d90)}</span
          >
        </div>
        <UptimeBars bars={stats.dailyBars} unit="day" height="h-10" />
        <div class="mt-1 flex justify-between text-[10px] text-slate-600">
          <span>{$_('monitoring.bars.daysAgo', { values: { count: 90 } })}</span><span
            >{$_('monitoring.bars.today')}</span
          >
        </div>
      </div>
      <div>
        <div class="mb-3 flex items-baseline justify-between">
          <h2 class="text-sm font-semibold text-slate-100">
            {$_('monitoring.detail.last24Hours')}
          </h2>
          <span class="text-sm font-bold tabular-nums {uptimeTone(stats.uptime.h24)}"
            >{formatUptime(stats.uptime.h24)}</span
          >
        </div>
        <UptimeBars bars={stats.hourlyBars} unit="hour" height="h-10" />
        <div class="mt-1 flex justify-between text-[10px] text-slate-600">
          <span>{$_('monitoring.bars.hoursAgo', { values: { count: 24 } })}</span><span
            >{$_('monitoring.bars.now')}</span
          >
        </div>
      </div>
    </section>
  {/if}

  <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <div class="space-y-6">
      <!-- response time -->
      <LatencyChart
        recentChecks={data.recentChecks}
        hourlyBars={stats?.hourlyBars ?? []}
        dailyBars={stats?.dailyBars ?? []}
        degradedThresholdMs={monitor.degradedThresholdMs}
      />

      <!-- incidents -->
      <section
        class="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
      >
        <h2 class="border-b border-[var(--border)] px-5 py-4 text-sm font-semibold text-slate-100">
          {$_('monitoring.detail.incidents')}
        </h2>
        {#if data.incidents.length === 0}
          <p class="flex items-center justify-center gap-2 px-5 py-10 text-sm text-slate-500">
            <ShieldCheck class="h-4 w-4 text-emerald-400" />{$_('monitoring.detail.noIncidents')}
          </p>
        {:else}
          <ul class="divide-y divide-[var(--border)]">
            {#each data.incidents as incident (incident.id)}
              {@const duration = incident.endedAt
                ? (Date.parse(incident.endedAt) - Date.parse(incident.startedAt)) / 1000
                : secondsSince(incident.startedAt, now)}
              <li class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <StatusDot status={incident.endedAt ? 'none' : incident.status} size="sm" />
                <span class="font-semibold {statusStyle(incident.status).text}"
                  >{$_(`monitoring.status.${incident.status}`)}</span
                >
                <span class="text-slate-300"
                  >{incident.cause
                    ? $_(`monitoring.causes.${incident.cause}`)
                    : '—'}{incident.httpStatus ? ` · HTTP ${incident.httpStatus}` : ''}</span
                >
                <span class="ml-auto text-xs text-slate-500">{dateTime(incident.startedAt)}</span>
                <span
                  class="w-24 text-right text-xs font-semibold tabular-nums {incident.endedAt
                    ? 'text-slate-400'
                    : 'text-rose-300'}"
                >
                  {incident.endedAt ? formatDuration(duration) : $_('monitoring.detail.ongoing')}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>

    <!-- configuration -->
    <aside class="h-fit rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 class="text-sm font-semibold text-slate-100">{$_('monitoring.detail.configuration')}</h2>
      <dl class="mt-4 space-y-3 text-xs">
        <div class="flex justify-between gap-3">
          <dt class="text-slate-500">{$_('monitoring.form.interval')}</dt>
          <dd class="text-slate-200">{interval(monitor.intervalSeconds)}</dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-slate-500">{$_('monitoring.form.timeout')}</dt>
          <dd class="text-slate-200">{formatLatency(monitor.timeoutMs)}</dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-slate-500">{$_('monitoring.form.expectedStatus')}</dt>
          <dd class="font-mono text-slate-200">{monitor.expectedStatus}</dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-slate-500">{$_('monitoring.form.degradedThreshold')}</dt>
          <dd class="text-slate-200">
            {monitor.degradedThresholdMs ? formatLatency(monitor.degradedThresholdMs) : '—'}
          </dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-slate-500">{$_('monitoring.form.confirmations')}</dt>
          <dd class="text-slate-200">{monitor.confirmations}</dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-slate-500">{$_('monitoring.form.followRedirects')}</dt>
          <dd class="text-slate-200">
            {monitor.followRedirects ? $_('common.yes') : $_('common.no')}
          </dd>
        </div>
        <div>
          <dt class="text-slate-500">{$_('monitoring.form.headersTitle')}</dt>
          <dd class="mt-1.5 flex flex-wrap gap-1.5">
            {#each monitor.headerNames as name (name)}
              <span
                class="rounded-md border border-[var(--border)] px-2 py-0.5 font-mono text-[11px] text-slate-300"
                >{name}: ••••</span
              >
            {:else}
              <span class="text-slate-500">—</span>
            {/each}
          </dd>
        </div>
        {#if monitor.hasBody}
          <div class="flex justify-between gap-3">
            <dt class="text-slate-500">{$_('monitoring.form.body')}</dt>
            <dd class="text-slate-200">{$_('monitoring.detail.bodyStored')}</dd>
          </div>
        {/if}
      </dl>
    </aside>
  </div>
</div>

{#if confirmDelete}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
    role="dialog"
    aria-modal="true"
  >
    <form
      method="POST"
      action="?/delete"
      use:enhance
      class="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6"
    >
      <h2 class="text-lg font-semibold text-white">{$_('monitoring.delete.title')}</h2>
      <p class="mt-2 text-sm text-slate-400">
        {$_('monitoring.delete.description', { values: { name: monitor.name } })}
      </p>
      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          class="btn-ghost rounded-xl px-4 py-2 text-sm font-semibold"
          onclick={() => (confirmDelete = false)}>{$_('common.cancel')}</button
        >
        <button class="btn-danger rounded-xl px-4 py-2 text-sm font-semibold"
          >{$_('monitoring.actions.delete')}</button
        >
      </div>
    </form>
  </div>
{/if}
