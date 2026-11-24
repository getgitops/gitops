<script lang="ts">
  import { enhance } from '$app/forms';
  import { MessageSquare, Plus, Power, Send, ShieldAlert, Trash2 } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import type {
    ChannelView,
    ChannelsFormResult,
    ChannelsSectionData,
  } from '#lib/notifications/types';

  type Props = { data: ChannelsSectionData; form: ChannelsFormResult };
  let { data, form }: Props = $props();

  let createErrors = $derived(form?.channelForm === 'create' ? (form.channelErrors ?? {}) : {});

  function errorFor(errors: Record<string, string>, key: string) {
    return errors[key] ? $_(`notifications.errors.${errors[key]}`) : '';
  }

  function formatDate(value: string | null) {
    return value ? new Date(value).toLocaleString() : '—';
  }

  function rowErrors(channel: ChannelView) {
    return form?.channelForm === channel.id ? (form.channelErrors ?? {}) : {};
  }
</script>

<section class="space-y-4" aria-labelledby="channels-title" data-testid="notification-channels">
  <div>
    <h4 id="channels-title" class="flex items-center gap-2 text-base font-semibold text-slate-900">
      <MessageSquare class="h-4 w-4" />
      {$_('notifications.channels.title')}
    </h4>
    <p class="mt-1 text-sm text-slate-600">
      {data.scope === 'project'
        ? $_('notifications.channels.descriptionProject')
        : $_('notifications.channels.descriptionOrganization')}
    </p>
  </div>

  <p
    class="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
  >
    <ShieldAlert class="mt-0.5 h-4 w-4 shrink-0" />
    {$_('notifications.channels.privacyNotice')}
  </p>

  {#if form?.channelTest}
    <p
      class="rounded-md border px-3 py-2 text-sm {form.channelTest.sent
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-red-200 bg-red-50 text-red-700'}"
      role="status"
      data-testid="channel-test-result"
    >
      {form.channelTest.sent
        ? $_('notifications.channels.testSent')
        : $_('notifications.channels.testFailed', {
            values: { reason: form.channelTest.error ?? '—' },
          })}
    </p>
  {:else if form?.channelError && form.channelForm !== 'create' && !form.channelErrors}
    <p
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      role="alert"
    >
      {form.channelError}
    </p>
  {/if}

  {#if data.channels.length === 0}
    <p class="rounded-md border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
      {$_('notifications.channels.empty')}
    </p>
  {:else}
    <ul class="space-y-3">
      {#each data.channels as channel (channel.id)}
        {@const errors = rowErrors(channel)}
        <li
          class="rounded-md border border-slate-200 bg-white px-4 py-3"
          data-channel-id={channel.id}
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                {channel.name}
                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  {$_(`notifications.channels.types.${channel.type}`)}
                </span>
                {#if !channel.enabled}
                  <span
                    class="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                  >
                    {$_('notifications.channels.disabled')}
                  </span>
                {/if}
                {#if !channel.available}
                  <span
                    class="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800"
                  >
                    {$_('notifications.channels.unavailable')}
                  </span>
                {/if}
              </p>
              <p class="mt-1 font-mono text-xs text-slate-500">{channel.destinationMasked}</p>
              <p class="mt-1 text-xs text-slate-500">
                {$_('notifications.channels.lastDelivery', {
                  values: { date: formatDate(channel.lastDeliveryAt) },
                })}
              </p>
              {#if channel.lastError}
                <p class="mt-1 text-xs text-red-600">
                  {$_('notifications.channels.lastError', { values: { error: channel.lastError } })}
                </p>
              {/if}
            </div>

            <div class="flex flex-wrap items-center gap-2">
              {#if data.canUpdate}
                <form method="POST" action="?/testChannel" use:enhance>
                  <input type="hidden" name="channelId" value={channel.id} />
                  <button
                    type="submit"
                    class="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300"
                  >
                    <Send class="h-3.5 w-3.5" />
                    {$_('notifications.channels.test')}
                  </button>
                </form>
                <form method="POST" action="?/toggleChannel" use:enhance>
                  <input type="hidden" name="channelId" value={channel.id} />
                  <input type="hidden" name="enabled" value={channel.enabled ? 'false' : 'true'} />
                  <button
                    type="submit"
                    class="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300"
                  >
                    <Power class="h-3.5 w-3.5" />
                    {channel.enabled
                      ? $_('notifications.channels.disable')
                      : $_('notifications.channels.enable')}
                  </button>
                </form>
              {/if}
              {#if data.canDelete}
                <form
                  method="POST"
                  action="?/deleteChannel"
                  use:enhance={({ cancel }) => {
                    if (!confirm($_('notifications.channels.confirmDelete'))) cancel();
                  }}
                >
                  <input type="hidden" name="channelId" value={channel.id} />
                  <button
                    type="submit"
                    class="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:border-red-300"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                    {$_('notifications.channels.delete')}
                  </button>
                </form>
              {/if}
            </div>
          </div>

          {#if data.canUpdate}
            <details class="mt-3" open={Object.keys(errors).length > 0}>
              <summary class="cursor-pointer text-xs font-medium text-slate-600">
                {$_('notifications.channels.edit')}
              </summary>
              <form
                method="POST"
                action="?/updateChannel"
                use:enhance
                class="mt-2 grid gap-2 sm:grid-cols-2"
              >
                <input type="hidden" name="channelId" value={channel.id} />
                <label class="flex flex-col gap-1 text-xs text-slate-700">
                  {$_('notifications.channels.name')}
                  <input
                    name="name"
                    value={channel.name}
                    maxlength="80"
                    class="field-input rounded-md border px-2 py-1.5 text-sm"
                    aria-invalid={Boolean(errors.name) || undefined}
                  />
                  {#if errors.name}<span class="text-red-600">{errorFor(errors, 'name')}</span>{/if}
                </label>
                <label class="flex flex-col gap-1 text-xs text-slate-700">
                  {$_('notifications.channels.newDestination')}
                  <input
                    name="destination"
                    type="url"
                    autocomplete="off"
                    placeholder={channel.destinationMasked}
                    class="field-input rounded-md border px-2 py-1.5 font-mono text-sm"
                    aria-invalid={Boolean(errors.destination) || undefined}
                  />
                  {#if errors.destination}
                    <span class="text-red-600">{errorFor(errors, 'destination')}</span>
                  {/if}
                </label>
                <div class="sm:col-span-2">
                  <button
                    type="submit"
                    class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    {$_('notifications.channels.save')}
                  </button>
                </div>
              </form>
            </details>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if data.inherited.length > 0}
    <div class="space-y-2">
      <h5 class="text-sm font-medium text-slate-800">
        {$_('notifications.channels.inheritedTitle')}
      </h5>
      <p class="text-xs text-slate-500">{$_('notifications.channels.inheritedDescription')}</p>
      <ul class="space-y-2">
        {#each data.inherited as channel (channel.id)}
          <li
            class="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700"
          >
            {channel.name}
            <span class="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600">
              {$_(`notifications.channels.types.${channel.type}`)}
            </span>
            {#if !channel.enabled}
              <span class="text-[11px] text-slate-500">{$_('notifications.channels.disabled')}</span
              >
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if data.canCreate}
    <div class="rounded-md border border-slate-200 px-4 py-3">
      <h5 class="flex items-center gap-2 text-sm font-medium text-slate-800">
        <Plus class="h-4 w-4" />
        {$_('notifications.channels.create')}
      </h5>
      {#if data.availableTypes.length === 0}
        <p class="mt-2 text-xs text-slate-500" data-testid="channel-types-unavailable">
          {$_('notifications.channels.noTypes')}
        </p>
      {:else}
        <form
          method="POST"
          action="?/createChannel"
          use:enhance
          class="mt-2 grid gap-2 sm:grid-cols-3"
        >
          <label class="flex flex-col gap-1 text-xs text-slate-700">
            {$_('notifications.channels.type')}
            <select
              name="type"
              class="field-input rounded-md border px-2 py-1.5 text-sm"
              value={form?.channelDraft?.type ?? data.availableTypes[0]}
              aria-invalid={Boolean(createErrors.type) || undefined}
            >
              {#each data.availableTypes as type (type)}
                <option value={type}>{$_(`notifications.channels.types.${type}`)}</option>
              {/each}
            </select>
            {#if createErrors.type}<span class="text-red-600">{errorFor(createErrors, 'type')}</span
              >{/if}
          </label>
          <label class="flex flex-col gap-1 text-xs text-slate-700">
            {$_('notifications.channels.name')}
            <input
              name="name"
              maxlength="80"
              placeholder="#alertas-seguridad"
              value={form?.channelDraft?.name ?? ''}
              class="field-input rounded-md border px-2 py-1.5 text-sm"
              aria-invalid={Boolean(createErrors.name) || undefined}
            />
            {#if createErrors.name}<span class="text-red-600">{errorFor(createErrors, 'name')}</span
              >{/if}
          </label>
          <label class="flex flex-col gap-1 text-xs text-slate-700">
            {$_('notifications.channels.destination')}
            <input
              name="destination"
              type="url"
              autocomplete="off"
              placeholder="https://…"
              class="field-input rounded-md border px-2 py-1.5 font-mono text-sm"
              aria-invalid={Boolean(createErrors.destination) || undefined}
            />
            {#if createErrors.destination}
              <span class="text-red-600">{errorFor(createErrors, 'destination')}</span>
            {/if}
          </label>
          <div class="sm:col-span-3">
            <button
              type="submit"
              class="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              <Plus class="h-3.5 w-3.5" />
              {$_('notifications.channels.create')}
            </button>
          </div>
        </form>
      {/if}
    </div>
  {/if}
</section>
