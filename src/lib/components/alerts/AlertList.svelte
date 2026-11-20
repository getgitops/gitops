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
    {@render cards(data.alerts, false)}
  {/if}

  {#if data.scope === 'project' && data.inherited.length > 0}
    <section class="space-y-3">
      <div>
        <h4 class="text-base font-semibold text-slate-900">{$_('alerts.list.inheritedTitle')}</h4>
        <p class="text-xs text-slate-500">{$_('alerts.list.inheritedDescription')}</p>
      </div>
      {@render cards(data.inherited, true)}
    </section>
  {/if}
</div>

{#snippet cards(alerts: AlertRow[], readonly: boolean)}
  <div class="alert-cards-grid" data-testid={readonly ? 'inherited-alerts' : 'alerts'}>
    {#each alerts as alert (alert.id)}
      <article class="alert-card" data-testid="alert-row">
        <header>
          <div class="alert-card-title">
            <span class="alert-card-icon"><BellRing class="h-5 w-5" /></span>
            <div>
              {#if !readonly && data.canUpdate}
                <a href="{data.basePath}/{alert.id}">{alert.name}</a>
              {:else}
                <h4>{alert.name}</h4>
              {/if}
              <p>{moduleLabel(alert)}</p>
            </div>
          </div>
          <span class:disabled={!alert.enabled} class="alert-status">
            <i></i>{alert.enabled ? $_('alerts.list.enabled') : $_('alerts.list.disabled')}
          </span>
        </header>

        <div class="alert-card-content">
          <div>
            <span>{$_('alerts.list.event')}</span>
            <strong>{eventLabel(alert)}</strong>
          </div>
          <div data-testid="alert-summary">
            <span>{$_('alerts.list.conditions')}</span>
            <p>{conditionsOf(alert)}</p>
          </div>
          <div>
            <span>{$_('alerts.list.recipients')}</span>
            <p>{summarizeRecipients(alert.recipients, data.users, data.roles, t)}</p>
          </div>
        </div>

        <footer>
          <span>
            {#if alert.throttleMinutes > 0}
              {$_('alerts.list.throttle', { values: { minutes: alert.throttleMinutes } })}
            {:else}
              Notificación inmediata
            {/if}
          </span>
          {#if !readonly}
            <div class="alert-card-actions">
              {#if data.canUpdate}
                <form method="POST" action="?/toggle" use:enhance>
                  <input type="hidden" name="alertId" value={alert.id} />
                  <input type="hidden" name="enabled" value={alert.enabled ? 'false' : 'true'} />
                  <button
                    type="submit"
                    role="switch"
                    aria-checked={alert.enabled}
                    aria-label={$_('alerts.list.toggle', { values: { name: alert.name } })}
                    class="alert-toggle"
                    class:active={alert.enabled}
                  >
                    <span></span>
                  </button>
                </form>
                <a href="{data.basePath}/{alert.id}" title={$_('alerts.list.edit')}>
                  <Pencil class="h-4 w-4" />
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
                  <button type="submit" class="delete-alert" title={$_('alerts.list.delete')}>
                    <Trash2 class="h-4 w-4" />
                  </button>
                </form>
              {/if}
            </div>
          {/if}
        </footer>
      </article>
    {/each}
  </div>
{/snippet}

<style>
  .alert-cards-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .alert-card {
    display: flex;
    min-height: 310px;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.085);
    border-radius: 12px;
    background: rgb(255 255 255 / 0.025);
  }

  .alert-card header,
  .alert-card footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
  }

  .alert-card header {
    border-bottom: 1px solid rgb(255 255 255 / 0.07);
  }

  .alert-card-title {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 11px;
  }

  .alert-card-icon {
    display: flex;
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border: 1px solid rgb(249 93 17 / 0.22);
    border-radius: 10px;
    background: rgb(249 93 17 / 0.08);
    color: #ff8a4c;
  }

  .alert-card-title a,
  .alert-card-title h4 {
    display: block;
    overflow: hidden;
    color: #ece8ee;
    font-size: 16px;
    font-weight: 580;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .alert-card-title p {
    margin-top: 3px;
    color: #706a74;
    font-size: 12px;
  }

  .alert-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #6ed6a9;
    font-size: 12px;
  }

  .alert-status i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #52ce9a;
  }

  .alert-status.disabled {
    color: #77717a;
  }

  .alert-status.disabled i {
    background: #77717a;
  }

  .alert-card-content {
    display: grid;
    flex: 1;
    grid-template-columns: 1fr 1fr;
    gap: 17px;
    padding: 18px;
  }

  .alert-card-content > div:first-child {
    grid-column: 1 / -1;
  }

  .alert-card-content span {
    display: block;
    color: #6e6872;
    font-size: 12px;
    font-weight: 550;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .alert-card-content strong,
  .alert-card-content p {
    display: block;
    margin-top: 7px;
    color: #bab4bd;
    font-size: 14px;
    font-weight: 450;
    line-height: 1.5;
  }

  .alert-card footer {
    border-top: 1px solid rgb(255 255 255 / 0.07);
    color: #6f6973;
    font-size: 12px;
  }

  .alert-card-actions,
  .alert-card-actions form {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .alert-card-actions a,
  .alert-card-actions > form > button:not(.alert-toggle) {
    display: inline-flex;
    width: 32px;
    height: 32px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 7px;
    color: #938d96;
  }

  .alert-card-actions a:hover {
    border-color: rgb(249 93 17 / 0.24);
    color: #ff955b;
  }

  .alert-card-actions .delete-alert:hover {
    border-color: rgb(239 68 68 / 0.28);
    color: #f87171;
  }

  .alert-toggle {
    position: relative;
    width: 34px;
    height: 20px;
    border-radius: 999px;
    background: #3b3940;
    transition: background 0.15s ease;
  }

  .alert-toggle span {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #f3f0f3;
    transition: transform 0.15s ease;
  }

  .alert-toggle.active {
    background: #f95d11;
  }

  .alert-toggle.active span {
    transform: translateX(14px);
  }

  @media (max-width: 850px) {
    .alert-cards-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
