<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { Activity, CheckCircle2, Circle, Filter } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import type { EventStatusFilter, EventView } from '#lib/server/events/event-view';

  export let data: {
    orgSlug: string;
    events: EventView[];
    filters: { module: string | null; status: EventStatusFilter };
    canAck: boolean;
    modules: readonly string[];
    retentionMs: number;
  };

  let acking: string | null = null;
  let error = '';

  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;

  $: retention =
    data.retentionMs % DAY === 0
      ? $_('org.events.retentionDays', { values: { count: data.retentionMs / DAY } })
      : data.retentionMs % HOUR === 0
        ? $_('org.events.retentionHours', { values: { count: data.retentionMs / HOUR } })
        : $_('org.events.retentionMinutes', {
            values: { count: Math.max(1, Math.round(data.retentionMs / 60_000)) },
          });

  $: pendingCount = data.events.filter((event) => !event.ack).length;

  function formatDate(value: string) {
    return new Date(value).toLocaleString();
  }

  function actorName(event: EventView) {
    if (event.actor.kind === 'system') return $_('org.events.actorSystem');
    if (event.actor.kind === 'api_key') {
      return event.actor.name
        ? $_('org.events.actorApiKey', { values: { name: event.actor.name } })
        : $_('org.events.actorApiKeyUnknown');
    }
    return event.actor.name ?? '—';
  }

  function submitFilters(changeEvent: Event) {
    (changeEvent.currentTarget as HTMLSelectElement).form?.requestSubmit();
  }

  const ackEvent =
    (eventId: string): SubmitFunction =>
    () => {
      acking = eventId;
      error = '';
      return async ({ result, update }) => {
        await update({ reset: false });
        acking = null;
        if (result.type === 'failure') {
          error = result.data?.error ? String(result.data.error) : $_('org.events.ackFailed');
        }
      };
    };
</script>

<svelte:head>
  <title>{$_('org.events.title')} - GitOps</title>
</svelte:head>

<div class="space-y-6">
  <section class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h3 class="text-xl font-semibold text-slate-900">{$_('org.events.title')}</h3>
      <p class="mt-2 text-sm text-slate-600">{$_('org.events.description')}</p>
      <p class="mt-1 text-xs text-slate-500">
        {$_('org.events.retentionNotice', { values: { retention } })}
      </p>
    </div>
    <div
      class="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
    >
      <Circle class="h-3 w-3 text-amber-500" />
      {$_('org.events.pendingCount', { values: { count: pendingCount } })}
    </div>
  </section>

  <form method="GET" class="flex flex-wrap items-end gap-3">
    <label class="flex flex-col gap-1 text-xs font-medium text-slate-600">
      {$_('org.events.filterModule')}
      <select
        name="module"
        class="field-input rounded-md border px-3 py-2 text-sm"
        value={data.filters.module ?? ''}
        on:change={submitFilters}
      >
        <option value="">{$_('org.events.allModules')}</option>
        {#each data.modules as module (module)}
          <option value={module}>{$_(`org.events.modules.${module}`)}</option>
        {/each}
      </select>
    </label>
    <label class="flex flex-col gap-1 text-xs font-medium text-slate-600">
      {$_('org.events.filterStatus')}
      <select
        name="status"
        class="field-input rounded-md border px-3 py-2 text-sm"
        value={data.filters.status}
        on:change={submitFilters}
      >
        <option value="all">{$_('org.events.statusAll')}</option>
        <option value="pending">{$_('org.events.statusPending')}</option>
        <option value="acked">{$_('org.events.statusAcked')}</option>
      </select>
    </label>
    <noscript>
      <button
        type="submit"
        class="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
      >
        <Filter class="h-4 w-4" />
        {$_('org.events.applyFilters')}
      </button>
    </noscript>
  </form>

  {#if error}
    <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </div>
  {/if}

  {#if data.events.length === 0}
    <div
      class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center"
    >
      <Activity class="h-6 w-6 text-slate-400" />
      <p class="text-sm font-medium text-slate-900">{$_('org.events.emptyTitle')}</p>
      <p class="text-xs text-slate-500">{$_('org.events.emptyDescription')}</p>
    </div>
  {:else}
    <ul class="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
      {#each data.events as event (event.id)}
        <li class="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600"
              >
                {$_(`org.events.modules.${event.module}`)}
              </span>
              <p class="text-sm font-semibold text-slate-900">{$_(event.label)}</p>
            </div>
            <p class="text-xs text-slate-500">
              {formatDate(event.occurredAt)} · {actorName(event)}
              {#if event.project}
                · {$_('org.events.inProject', {
                  values: { name: event.project.name ?? event.project.id },
                })}
              {/if}
            </p>
            {#if event.fields.length > 0}
              <details class="text-xs text-slate-600">
                <summary class="cursor-pointer select-none text-slate-500 hover:text-slate-900">
                  {$_('org.events.details')}
                </summary>
                <dl class="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                  {#each event.fields as field (field.label)}
                    <div class="flex gap-2">
                      <dt class="text-slate-500">{$_(field.label)}:</dt>
                      <dd class="break-all font-medium text-slate-800">
                        {field.translate ? $_(field.value) : field.value}
                      </dd>
                    </div>
                  {/each}
                </dl>
              </details>
            {/if}
          </div>

          <div class="shrink-0">
            {#if event.ack}
              <div class="flex items-center gap-2 text-xs text-emerald-700">
                <CheckCircle2 class="h-4 w-4" />
                <span>
                  {$_('org.events.ackedBy', {
                    values: { name: event.ack.username, date: formatDate(event.ack.at) },
                  })}
                </span>
              </div>
            {:else if data.canAck}
              <form method="POST" action="?/ack" use:enhance={ackEvent(event.id)}>
                <input type="hidden" name="eventId" value={event.id} />
                <button
                  type="submit"
                  disabled={acking === event.id}
                  class="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                >
                  <CheckCircle2 class="h-4 w-4" />
                  {$_('org.events.ack')}
                </button>
              </form>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
