<script lang="ts">
  import { enhance } from '$app/forms';
  import {
    BellRing,
    Hash,
    LoaderCircle,
    Mail,
    MailWarning,
    MessageSquare,
    Pencil,
    Plus,
    CircleHelp,
    Settings,
    Trash2,
    Webhook,
  } from '@lucide/svelte';
  import AlertSettingsPanel from './AlertSettingsPanel.svelte';
  import AlertWizard from './AlertWizard.svelte';
  import { Modal, toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';
  import { channelTargets, summarizeConditions } from '#lib/alerts/summary';
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

  const channelIcons = {
    mail: Mail,
    slack: Hash,
    'google-chat': MessageSquare,
    webhook: Webhook,
  };

  // el asistente: "Crear alerta" y "Editar" lo abren; sus enlaces siguen funcionando sin JS
  let wizardOpen = $state(false);
  let wizardAlert = $state<AlertRow | null>(null);
  function openWizard(event: MouseEvent, alert: AlertRow | null) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    wizardAlert = alert;
    wizardOpen = true;
  }

  let settingsOpen = $state(false);
  function openSettings(event: MouseEvent) {
    if (!data.configPath || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    settingsOpen = true;
  }

  let deleteTarget = $state<AlertRow | null>(null);
  let deleteOpen = $state(false);
  let deleting = $state(false);
</script>

<div class="space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-white">{$_('alerts.list.title')}</h1>
      <p class="mt-1 text-sm text-fg-muted">
        {data.scope === 'project'
          ? $_('alerts.list.descriptionProject')
          : $_('alerts.list.descriptionOrganization')}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if data.scope === 'project'}
        <!-- projects have no notification settings: a hint says where they are instead -->
        <span class="group relative inline-flex" data-testid="alert-settings-hint">
          <button
            type="button"
            class="k-btn k-btn-ghost k-btn-icon cursor-help text-fg-subtle"
            aria-label={$_('alerts.list.settingsHelp')}
            aria-describedby="alert-settings-hint-text"
          >
            <CircleHelp class="h-4 w-4" />
          </button>
          <span
            id="alert-settings-hint-text"
            role="tooltip"
            class="k-popover pointer-events-none absolute right-0 top-full z-20 mt-2 hidden w-64 px-3 py-2 text-xs text-fg-muted group-focus-within:block group-hover:block"
          >
            {$_('alerts.list.settingsInOrganization')}
          </span>
        </span>
      {:else if data.configPath}
        <a
          href={data.configPath}
          class="k-btn k-btn-secondary"
          onclick={openSettings}
          data-testid="alert-settings"
        >
          <Settings class="h-4 w-4" />{$_('alerts.list.settings')}
        </a>
      {/if}
      {#if data.canCreate && data.alerts.length > 0}
        <a
          href="{data.basePath}/new"
          class="k-btn k-btn-primary"
          onclick={(event) => openWizard(event, null)}
        >
          <Plus class="h-4 w-4" />{$_('alerts.list.create')}
        </a>
      {/if}
    </div>
  </header>

  {#if !data.mailConfigured}
    <p
      class="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/8 px-4 py-3 text-sm text-amber-100"
      role="status"
      data-testid="mail-disabled"
    >
      <MailWarning class="mt-0.5 h-4 w-4 shrink-0 text-warn" />
      {$_('alerts.mailDisabled')}
    </p>
  {/if}

  {#if error}
    <p
      class="rounded-xl border border-danger/30 bg-danger/8 px-4 py-3 text-sm text-red-200"
      role="alert"
    >
      {error}
    </p>
  {/if}

  {#if data.alerts.length === 0}
    <div class="k-card flex flex-col items-center gap-3 border-dashed p-10 text-center">
      <span class="grid h-12 w-12 place-items-center rounded-xl bg-brand-500/10 text-brand-400">
        <BellRing class="h-6 w-6" />
      </span>
      <p class="text-sm font-medium text-white">{$_('alerts.list.emptyTitle')}</p>
      <ul class="space-y-1 text-xs text-fg-subtle">
        {#each examples as example (example)}
          <li>“{$_(example)}”</li>
        {/each}
      </ul>
      {#if data.canCreate}
        <a
          href="{data.basePath}/new"
          class="k-btn k-btn-primary mt-2"
          onclick={(event) => openWizard(event, null)}
        >
          <Plus class="h-4 w-4" />{$_('alerts.list.create')}
        </a>
      {/if}
    </div>
  {:else}
    {@render table(data.alerts, false)}
  {/if}

  {#if data.scope === 'project' && data.inherited.length > 0}
    <section class="space-y-3">
      <div>
        <h2 class="text-sm font-semibold text-white">{$_('alerts.list.inheritedTitle')}</h2>
        <p class="mt-0.5 text-xs text-fg-subtle">{$_('alerts.list.inheritedDescription')}</p>
      </div>
      {@render table(data.inherited, true)}
    </section>
  {/if}
</div>

{#snippet table(alerts: AlertRow[], readonly: boolean)}
  <div class="k-card overflow-x-auto">
    <table
      class="w-full min-w-176 text-left text-sm"
      data-testid={readonly ? 'inherited-alerts' : 'alerts'}
    >
      <thead class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
        <tr class="border-b border-white/8">
          <th scope="col" class="px-5 py-3 font-semibold">{$_('alerts.list.name')}</th>
          <th scope="col" class="px-3 py-3 font-semibold">{$_('alerts.list.event')}</th>
          <th scope="col" class="px-3 py-3 font-semibold">{$_('alerts.list.conditions')}</th>
          <th scope="col" class="px-3 py-3 font-semibold">{$_('alerts.list.channelsColumn')}</th>
          <th scope="col" class="px-3 py-3 font-semibold">{$_('alerts.list.status')}</th>
          {#if !readonly && (data.canUpdate || data.canDelete)}
            <th scope="col" class="px-5 py-3"
              ><span class="sr-only">{$_('alerts.list.actions')}</span></th
            >
          {/if}
        </tr>
      </thead>
      <tbody class="divide-y divide-white/5">
        {#each alerts as alert (alert.id)}
          <tr data-testid="alert-row" class="align-top transition-colors hover:bg-white/2.5">
            <td class="px-5 py-3">
              {#if !readonly && data.canUpdate}
                <a
                  class="font-medium text-white hover:text-brand-300"
                  href="{data.basePath}/{alert.id}"
                  onclick={(event) => openWizard(event, alert)}>{alert.name}</a
                >
              {:else}
                <span class="font-medium text-white">{alert.name}</span>
              {/if}
              {#if alert.throttleMinutes > 0}
                <p class="mt-0.5 text-xs text-fg-subtle">
                  {$_('alerts.list.throttle', { values: { minutes: alert.throttleMinutes } })}
                </p>
              {/if}
            </td>
            <td class="px-3 py-3">
              <p class="text-fg">{eventLabel(alert)}</p>
              <p class="mt-0.5 text-xs text-fg-subtle">{moduleLabel(alert)}</p>
            </td>
            <td
              class="max-w-sm px-3 py-3 text-xs leading-5 text-fg-muted"
              data-testid="alert-summary">{conditionsOf(alert)}</td
            >
            <td class="px-3 py-3 text-xs text-fg-muted">
              <ul class="space-y-1">
                {#each alert.channels as channel (channel)}
                  {@const Icon = channelIcons[channel]}
                  <li class="flex items-start gap-1.5">
                    <Icon class="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                    <span
                      >{channelTargets(channel, alert, data.users, data.roles, data.channels).join(
                        ', ',
                      ) || $_('alerts.summary.noRecipients')}</span
                    >
                  </li>
                {/each}
              </ul>
            </td>
            <td class="px-3 py-3">
              {#if !readonly && data.canUpdate}
                <form method="POST" action="?/toggle" use:enhance>
                  <input type="hidden" name="alertId" value={alert.id} />
                  <input type="hidden" name="enabled" value={alert.enabled ? 'false' : 'true'} />
                  <button
                    type="submit"
                    role="switch"
                    aria-checked={alert.enabled}
                    aria-label={$_('alerts.list.toggle', { values: { name: alert.name } })}
                    class="inline-flex items-center gap-2 text-xs font-medium text-fg-muted"
                  >
                    <span
                      class="relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors {alert.enabled
                        ? 'border-brand-500 bg-brand-500'
                        : 'border-white/10 bg-ink-600'}"
                    >
                      <span
                        class="absolute top-0.5 h-3.5 w-3.5 rounded-full bg-snow shadow transition-all {alert.enabled
                          ? 'left-4.5'
                          : 'left-0.5'}"
                      ></span>
                    </span>
                    {alert.enabled ? $_('alerts.list.enabled') : $_('alerts.list.disabled')}
                  </button>
                </form>
              {:else}
                <span class="k-badge h-6 px-2 text-[11px] {alert.enabled ? 'k-badge-ok' : ''}">
                  {alert.enabled ? $_('alerts.list.enabled') : $_('alerts.list.disabled')}
                </span>
              {/if}
            </td>
            {#if !readonly && (data.canUpdate || data.canDelete)}
              <td class="px-5 py-3">
                <div class="flex justify-end gap-1">
                  {#if data.canUpdate}
                    <a
                      href="{data.basePath}/{alert.id}"
                      class="k-btn k-btn-ghost k-btn-sm"
                      onclick={(event) => openWizard(event, alert)}
                    >
                      <Pencil class="h-3.5 w-3.5" />{$_('alerts.list.edit')}
                    </a>
                  {/if}
                  {#if data.canDelete}
                    <form
                      id="delete-alert-{alert.id}"
                      method="POST"
                      action="?/delete"
                      use:enhance={() => {
                        deleting = true;
                        return async ({ result, update }) => {
                          deleting = false;
                          deleteOpen = false;
                          if (result.type === 'success' || result.type === 'redirect') {
                            toast.success($_('alerts.list.deleted'), alert.name);
                          }
                          await update();
                        };
                      }}
                    >
                      <input type="hidden" name="alertId" value={alert.id} />
                      <!-- sin JavaScript borra directamente; con JavaScript pide confirmación -->
                      <button
                        type="submit"
                        class="k-btn k-btn-ghost k-btn-sm hover:text-red-400"
                        onclick={(event) => {
                          event.preventDefault();
                          deleteTarget = alert;
                          deleteOpen = true;
                        }}
                      >
                        <Trash2 class="h-3.5 w-3.5" />{$_('alerts.list.delete')}
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

<Modal
  bind:open={deleteOpen}
  role="alertdialog"
  size="sm"
  dismissible={!deleting}
  title={$_('alerts.list.deleteTitle')}
  description={$_('alerts.list.confirmDelete')}
>
  {#snippet icon()}
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
      ><Trash2 class="h-5 w-5" /></span
    >
  {/snippet}
  {#if deleteTarget}<p class="text-sm font-medium text-white">{deleteTarget.name}</p>{/if}
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (deleteOpen = false)}
      >{$_('common.cancel')}</button
    >
    <button
      form="delete-alert-{deleteTarget?.id}"
      formnovalidate
      class="k-btn k-btn-danger"
      disabled={deleting}
      data-autofocus
    >
      {#if deleting}<LoaderCircle class="h-4 w-4 animate-spin" />{/if}
      {$_('alerts.list.delete')}
    </button>
  {/snippet}
</Modal>

{#if data.canCreate || data.canUpdate}
  <AlertWizard
    bind:open={wizardOpen}
    alert={wizardAlert}
    {data}
    onConfigure={() => (settingsOpen = true)}
  />
{/if}

{#if data.configPath}
  <Modal
    bind:open={settingsOpen}
    size="xl"
    title={$_('notifications.settings.title')}
    description={$_('notifications.settings.description')}
  >
    {#snippet icon()}
      <span
        class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/12 text-brand-400"
        ><Settings class="h-5 w-5" /></span
      >
    {/snippet}
    <AlertSettingsPanel
      data={data.settings}
      channels={data.channelsSection}
      action={data.configPath}
    />
    {#snippet footer()}
      <button type="button" class="k-btn k-btn-secondary" onclick={() => (settingsOpen = false)}
        >{$_('common.close')}</button
      >
    {/snippet}
  </Modal>
{/if}
