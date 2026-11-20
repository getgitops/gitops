<script lang="ts">
  import { enhance } from '$app/forms';
  import { BellRing, MailWarning, Pencil, Plus, Trash2 } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import { summarizeConditions, summarizeRecipients } from '#lib/alerts/summary';
  import type { AlertListData, AlertRow } from '#lib/alerts/types';

  type Props = { data: AlertListData; error?: string };
  let { data, error = '' }: Props = $props();

  const t = (key: string, options?: { values?: Record<string, unknown> }) => $_(key, options);

  function definitionOf(alert: AlertRow) {
    return data.catalog.find((entry) => entry.type === alert.eventType);
  }

  function eventLabel(alert: AlertRow) {
    const definition = definitionOf(alert);
    return definition ? $_(definition.label) : alert.eventType;
  }

  function moduleLabel(alert: AlertRow) {
    const definition = definitionOf(alert);
    return definition ? $_(`org.events.modules.${definition.module}`) : '';
  }

  function conditionsOf(alert: AlertRow) {
    return summarizeConditions(
      definitionOf(alert),
      alert.conditions.map((condition) => ({ ...condition, value: condition.value ?? '' })),
      alert.match,
      data.referenceOptions,
      t,
    );
  }

  const examples = ['alerts.list.example1', 'alerts.list.example2', 'alerts.list.example3'];
</script>

<div class="space-y-6">
  <section class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h3 class="text-xl font-semibold text-slate-900">{$_('alerts.list.title')}</h3>
      <p class="mt-2 text-sm text-slate-600">
        {data.scope === 'project'
          ? $_('alerts.list.descriptionProject')
          : $_('alerts.list.descriptionOrganization')}
      </p>
    </div>
    {#if data.canCreate && data.alerts.length > 0}
      <a
        href="{data.basePath}/new"
        class="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        <Plus class="h-4 w-4" />
        {$_('alerts.list.create')}
      </a>
    {/if}
  </section>

  {#if !data.mailConfigured}
    <p
      class="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
      role="status"
      data-testid="mail-disabled"
    >
      <MailWarning class="mt-0.5 h-4 w-4 shrink-0" />
      {$_('alerts.mailDisabled')}
    </p>
  {/if}

  {#if error}
    <p
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      role="alert"
    >
      {error}
    </p>
  {/if}

  {#if data.alerts.length === 0}
    <div
      class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center"
    >
      <BellRing class="h-6 w-6 text-slate-400" />
      <p class="text-sm font-medium text-slate-900">{$_('alerts.list.emptyTitle')}</p>
      <ul class="space-y-1 text-xs text-slate-500">
        {#each examples as example (example)}
          <li>“{$_(example)}”</li>
        {/each}
      </ul>
      {#if data.canCreate}
        <a
          href="{data.basePath}/new"
          class="mt-2 inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus class="h-4 w-4" />
          {$_('alerts.list.create')}
        </a>
      {/if}
    </div>
  {:else}
    {@render table(data.alerts, false)}
  {/if}

  {#if data.scope === 'project' && data.inherited.length > 0}
    <section class="space-y-3">
      <div>
        <h4 class="text-base font-semibold text-slate-900">{$_('alerts.list.inheritedTitle')}</h4>
        <p class="text-xs text-slate-500">{$_('alerts.list.inheritedDescription')}</p>
      </div>
      {@render table(data.inherited, true)}
    </section>
  {/if}
</div>

{#snippet table(alerts: AlertRow[], readonly: boolean)}
  <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
    <table
      class="min-w-full divide-y divide-slate-100 text-sm"
      data-testid={readonly ? 'inherited-alerts' : 'alerts'}
    >
      <thead
        class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
      >
        <tr>
          <th scope="col" class="px-4 py-3">{$_('alerts.list.name')}</th>
          <th scope="col" class="px-4 py-3">{$_('alerts.list.event')}</th>
          <th scope="col" class="px-4 py-3">{$_('alerts.list.conditions')}</th>
          <th scope="col" class="px-4 py-3">{$_('alerts.list.recipients')}</th>
          <th scope="col" class="px-4 py-3">{$_('alerts.list.status')}</th>
          {#if !readonly && (data.canUpdate || data.canDelete)}
            <th scope="col" class="px-4 py-3"
              ><span class="sr-only">{$_('alerts.list.actions')}</span></th
            >
          {/if}
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        {#each alerts as alert (alert.id)}
          <tr data-testid="alert-row">
            <td class="px-4 py-3 font-medium text-slate-900">
              {#if !readonly && data.canUpdate}
                <a class="hover:underline" href="{data.basePath}/{alert.id}">{alert.name}</a>
              {:else}
                {alert.name}
              {/if}
              {#if alert.throttleMinutes > 0}
                <p class="text-xs font-normal text-slate-500">
                  {$_('alerts.list.throttle', { values: { minutes: alert.throttleMinutes } })}
                </p>
              {/if}
            </td>
            <td class="px-4 py-3">
              <p class="text-slate-900">{eventLabel(alert)}</p>
              <p class="text-xs text-slate-500">{moduleLabel(alert)}</p>
            </td>
            <td class="max-w-sm px-4 py-3 text-slate-700" data-testid="alert-summary"
              >{conditionsOf(alert)}</td
            >
            <td class="px-4 py-3 text-slate-700">
              {summarizeRecipients(alert.recipients, data.users, data.roles, t)}
            </td>
            <td class="px-4 py-3">
              {#if !readonly && data.canUpdate}
                <form method="POST" action="?/toggle" use:enhance>
                  <input type="hidden" name="alertId" value={alert.id} />
                  <input type="hidden" name="enabled" value={alert.enabled ? 'false' : 'true'} />
                  <button
                    type="submit"
                    role="switch"
                    aria-checked={alert.enabled}
                    aria-label={$_('alerts.list.toggle', { values: { name: alert.name } })}
                    class="inline-flex items-center gap-2 text-xs font-medium"
                  >
                    <span
                      class="relative inline-flex h-5 w-9 rounded-full transition {alert.enabled
                        ? 'bg-emerald-500'
                        : 'bg-slate-300'}"
                    >
                      <span
                        class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition {alert.enabled
                          ? 'left-4'
                          : 'left-0.5'}"
                      ></span>
                    </span>
                    {alert.enabled ? $_('alerts.list.enabled') : $_('alerts.list.disabled')}
                  </button>
                </form>
              {:else}
                <span
                  class="text-xs font-medium {alert.enabled
                    ? 'text-emerald-700'
                    : 'text-slate-500'}"
                >
                  {alert.enabled ? $_('alerts.list.enabled') : $_('alerts.list.disabled')}
                </span>
              {/if}
            </td>
            {#if !readonly && (data.canUpdate || data.canDelete)}
              <td class="px-4 py-3">
                <div class="flex justify-end gap-2">
                  {#if data.canUpdate}
                    <a
                      href="{data.basePath}/{alert.id}"
                      class="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:border-slate-300"
                    >
                      <Pencil class="h-3.5 w-3.5" />
                      {$_('alerts.list.edit')}
                    </a>
                  {/if}
                  {#if data.canDelete}
                    <form
                      method="POST"
                      action="?/delete"
                      use:enhance={({ cancel }) => {
                        if (!confirm($_('alerts.list.confirmDelete'))) cancel();
                      }}
                    >
                      <input type="hidden" name="alertId" value={alert.id} />
                      <button
                        type="submit"
                        class="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        <Trash2 class="h-3.5 w-3.5" />
                        {$_('alerts.list.delete')}
                      </button>
                    </form>
                  {/if}
                </div>
              </td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}
