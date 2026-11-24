<script lang="ts">
  import { enhance } from '$app/forms';
  import { Pause, Pencil, Play, Plus, Search, Trash2 } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import { formatLatency, formatUptime, statusStyle, uptimeTone } from '#lib/monitoring/format';
  import StatusDot from '#lib/components/monitoring/StatusDot.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let query = $state('');
  let confirmDelete = $state<{ id: string; name: string } | null>(null);

  let serviceNames = $derived(new Map(data.services.map((service) => [service.id, service.name])));
  let rows = $derived(
    data.monitors.filter(({ monitor }) => {
      const q = query.trim().toLowerCase();
      return (
        !q ||
        monitor.name.toLowerCase().includes(q) ||
        monitor.displayUrl.toLowerCase().includes(q) ||
        (serviceNames.get(monitor.serviceId ?? '') ?? '').toLowerCase().includes(q)
      );
    }),
  );
  const perms = $derived(data.monitoringPermissions);

  function interval(seconds: number): string {
    return seconds < 60
      ? $_('monitoring.form.everySeconds', { values: { count: seconds } })
      : $_('monitoring.form.everyMinutes', { values: { count: seconds / 60 } });
  }
</script>

<svelte:head><title>{$_('monitoring.monitorsTitle')} - {data.project.name}</title></svelte:head>

<div class="space-y-6">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-white">{$_('monitoring.monitorsTitle')}</h1>
      <p class="mt-1 text-sm text-slate-400">{$_('monitoring.monitorsSubtitle')}</p>
    </div>
    {#if perms.canCreate}
      <a
        href={`${data.monitoringBase}/monitors/new`}
        class="btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
      >
        <Plus class="h-4 w-4" />{$_('monitoring.newMonitor')}
      </a>
    {/if}
  </div>

  <div class="relative">
    <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    <input
      bind:value={query}
      placeholder={$_('monitoring.dashboard.search')}
      class="field-input w-full rounded-xl border py-2.5 pl-10 pr-4 text-sm"
    />
  </div>

  <div class="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
    <table class="w-full min-w-[52rem] text-left text-sm">
      <thead
        class="border-b border-[var(--border)] text-[11px] uppercase tracking-wide text-slate-500"
      >
        <tr>
          <th class="px-5 py-3 font-semibold">{$_('monitoring.table.monitor')}</th>
          <th class="px-3 py-3 font-semibold">{$_('monitoring.table.service')}</th>
          <th class="px-3 py-3 font-semibold">{$_('monitoring.table.interval')}</th>
          <th class="px-3 py-3 text-right font-semibold">{$_('monitoring.uptime.h24')}</th>
          <th class="px-3 py-3 text-right font-semibold">{$_('monitoring.uptime.d30')}</th>
          <th class="px-3 py-3 text-right font-semibold">{$_('monitoring.table.latency')}</th>
          <th class="px-5 py-3 text-right font-semibold">{$_('monitoring.table.actions')}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[var(--border)]">
        {#each rows as { monitor, stats } (monitor.id)}
          {@const status = monitor.enabled ? (stats?.status ?? 'pending') : 'paused'}
          <tr class="transition hover:bg-[#0a1a2e]">
            <td class="px-5 py-3">
              <a
                href={`${data.monitoringBase}/monitors/${monitor.id}`}
                class="flex items-center gap-3"
              >
                <StatusDot {status} />
                <span class="min-w-0">
                  <span class="block truncate font-semibold text-slate-100">{monitor.name}</span>
                  <span class="block truncate text-xs text-slate-500"
                    ><span class="font-mono text-[11px] text-slate-400">{monitor.method}</span>
                    {monitor.displayUrl}</span
                  >
                </span>
              </a>
            </td>
            <td class="px-3 py-3 text-xs text-slate-400"
              >{serviceNames.get(monitor.serviceId ?? '') ?? '—'}</td
            >
            <td class="px-3 py-3 text-xs text-slate-400">{interval(monitor.intervalSeconds)}</td>
            <td
              class="px-3 py-3 text-right font-semibold tabular-nums {uptimeTone(
                stats?.uptime.h24,
              )}">{formatUptime(stats?.uptime.h24)}</td
            >
            <td
              class="px-3 py-3 text-right font-semibold tabular-nums {uptimeTone(
                stats?.uptime.d30,
              )}">{formatUptime(stats?.uptime.d30)}</td
            >
            <td class="px-3 py-3 text-right tabular-nums text-slate-300"
              >{formatLatency(stats?.latency24h.avg)}</td
            >
            <td class="px-5 py-3">
              <div class="flex justify-end gap-1">
                <span
                  class="mr-2 self-center rounded-full border px-2 py-px text-[10px] font-semibold uppercase {statusStyle(
                    status,
                  ).badge}">{$_(`monitoring.status.${status}`)}</span
                >
                {#if perms.canUpdate}
                  <form method="POST" action="?/toggle" use:enhance>
                    <input type="hidden" name="id" value={monitor.id} />
                    <input
                      type="hidden"
                      name="enabled"
                      value={monitor.enabled ? 'false' : 'true'}
                    />
                    <button
                      class="btn-ghost rounded-lg p-2"
                      title={monitor.enabled
                        ? $_('monitoring.actions.pause')
                        : $_('monitoring.actions.resume')}
                    >
                      {#if monitor.enabled}<Pause class="h-4 w-4" />{:else}<Play
                          class="h-4 w-4"
                        />{/if}
                    </button>
                  </form>
                  <a
                    href={`${data.monitoringBase}/monitors/${monitor.id}/edit`}
                    class="btn-ghost rounded-lg p-2"
                    title={$_('monitoring.actions.edit')}><Pencil class="h-4 w-4" /></a
                  >
                {/if}
                {#if perms.canDelete}
                  <button
                    type="button"
                    class="btn-ghost rounded-lg p-2 hover:text-rose-400"
                    title={$_('monitoring.actions.delete')}
                    onclick={() => (confirmDelete = { id: monitor.id, name: monitor.name })}
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                {/if}
              </div>
            </td>
          </tr>
        {:else}
          <tr
            ><td colspan="7" class="px-5 py-10 text-center text-sm text-slate-500"
              >{data.monitors.length
                ? $_('monitoring.dashboard.noMatches')
                : $_('monitoring.dashboard.emptyTitle')}</td
            ></tr
          >
        {/each}
      </tbody>
    </table>
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
      use:enhance={() =>
        async ({ update }) => {
          confirmDelete = null;
          await update();
        }}
      class="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6"
    >
      <input type="hidden" name="id" value={confirmDelete.id} />
      <h2 class="text-lg font-semibold text-white">{$_('monitoring.delete.title')}</h2>
      <p class="mt-2 text-sm text-slate-400">
        {$_('monitoring.delete.description', { values: { name: confirmDelete.name } })}
      </p>
      <div class="mt-6 flex justify-end gap-2">
        <button
          type="button"
          class="btn-ghost rounded-xl px-4 py-2 text-sm font-semibold"
          onclick={() => (confirmDelete = null)}>{$_('common.cancel')}</button
        >
        <button class="btn-danger rounded-xl px-4 py-2 text-sm font-semibold"
          >{$_('monitoring.actions.delete')}</button
        >
      </div>
    </form>
  </div>
{/if}
