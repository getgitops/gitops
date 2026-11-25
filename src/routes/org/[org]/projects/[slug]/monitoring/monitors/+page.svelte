<script lang="ts">
  import { enhance } from '$app/forms';
  import { Pause, Pencil, Play, Plus, Search, Trash2 } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import { formatLatency, formatUptime, statusStyle, uptimeTone } from '#lib/monitoring/format';
  import StatusDot from '#lib/components/monitoring/StatusDot.svelte';
  import DeleteMonitorModal from '#lib/components/monitoring/DeleteMonitorModal.svelte';
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

  let query = $state('');
  let confirmDelete = $state<{ id: string; name: string } | null>(null);
  let deleteOpen = $state(false);

  function askDelete(monitor: { id: string; name: string }) {
    confirmDelete = { id: monitor.id, name: monitor.name };
    deleteOpen = true;
  }

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
      <h1 class="text-2xl font-semibold tracking-tight text-white">
        {$_('monitoring.monitorsTitle')}
      </h1>
      <p class="mt-1 text-sm text-fg-muted">{$_('monitoring.monitorsSubtitle')}</p>
    </div>
    {#if perms.canCreate}
      <a href={`${data.monitoringBase}/monitors/new`} onclick={openNew} class="k-btn k-btn-primary">
        <Plus class="h-4 w-4" />{$_('monitoring.newMonitor')}
      </a>
    {/if}
  </div>

  <div class="k-card overflow-hidden">
    <div class="flex flex-wrap items-center gap-3 border-b border-white/8 p-4">
      <label class="relative w-full sm:w-72">
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
      <span class="ml-auto text-xs text-fg-subtle">
        {rows.length} / {data.monitors.length}
      </span>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full min-w-208 text-left text-sm">
        <thead class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
          <tr class="border-b border-white/8">
            <th class="px-5 py-3 font-semibold">{$_('monitoring.table.monitor')}</th>
            <th class="px-3 py-3 font-semibold">{$_('monitoring.table.service')}</th>
            <th class="px-3 py-3 font-semibold">{$_('monitoring.table.interval')}</th>
            <th class="px-3 py-3 text-right font-semibold">{$_('monitoring.uptime.h24')}</th>
            <th class="px-3 py-3 text-right font-semibold">{$_('monitoring.uptime.d30')}</th>
            <th class="px-3 py-3 text-right font-semibold">{$_('monitoring.table.latency')}</th>
            <th class="px-5 py-3 text-right font-semibold">{$_('monitoring.table.actions')}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5">
          {#each rows as { monitor, stats } (monitor.id)}
            {@const status = monitor.enabled ? (stats?.status ?? 'pending') : 'paused'}
            <tr class="transition-colors hover:bg-white/2.5">
              <td class="px-5 py-3">
                <a
                  href={`${data.monitoringBase}/monitors/${monitor.id}`}
                  class="group flex items-center gap-3"
                >
                  <StatusDot {status} />
                  <span class="min-w-0">
                    <span class="block truncate font-medium text-fg group-hover:text-white"
                      >{monitor.name}</span
                    >
                    <span class="block truncate text-xs text-fg-subtle"
                      ><span class="font-mono text-[11px] text-fg-muted">{monitor.method}</span>
                      {monitor.displayUrl}</span
                    >
                  </span>
                </a>
              </td>
              <td class="px-3 py-3 text-xs text-fg-muted"
                >{serviceNames.get(monitor.serviceId ?? '') ?? '—'}</td
              >
              <td class="px-3 py-3 text-xs text-fg-muted">{interval(monitor.intervalSeconds)}</td>
              <td
                class="px-3 py-3 text-right font-medium tabular-nums {uptimeTone(
                  stats?.uptime.h24,
                )}">{formatUptime(stats?.uptime.h24)}</td
              >
              <td
                class="px-3 py-3 text-right font-medium tabular-nums {uptimeTone(
                  stats?.uptime.d30,
                )}">{formatUptime(stats?.uptime.d30)}</td
              >
              <td class="px-3 py-3 text-right tabular-nums text-fg"
                >{formatLatency(stats?.latency24h.avg)}</td
              >
              <td class="px-5 py-3">
                <div class="flex items-center justify-end gap-1">
                  <span class="k-badge mr-2 h-5 px-2 text-[11px] {statusStyle(status).badge}"
                    >{$_(`monitoring.status.${status}`)}</span
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
                        class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                        title={monitor.enabled
                          ? $_('monitoring.actions.pause')
                          : $_('monitoring.actions.resume')}
                        aria-label={monitor.enabled
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
                      class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                      title={$_('monitoring.actions.edit')}
                      aria-label={$_('monitoring.actions.edit')}><Pencil class="h-4 w-4" /></a
                    >
                  {/if}
                  {#if perms.canDelete}
                    <button
                      type="button"
                      class="k-btn k-btn-ghost k-btn-icon k-btn-sm hover:text-red-400"
                      title={$_('monitoring.actions.delete')}
                      aria-label={$_('monitoring.actions.delete')}
                      onclick={() => askDelete(monitor)}
                    >
                      <Trash2 class="h-4 w-4" />
                    </button>
                  {/if}
                </div>
              </td>
            </tr>
          {:else}
            <tr
              ><td colspan="7" class="px-5 py-10 text-center text-sm text-fg-subtle"
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
</div>

{#if confirmDelete}
  <DeleteMonitorModal bind:open={deleteOpen} name={confirmDelete.name} id={confirmDelete.id} />
{/if}

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
