<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import {
    Hash,
    LoaderCircle,
    MessageSquare,
    Pencil,
    Plus,
    Power,
    Send,
    ShieldAlert,
    Trash2,
    Webhook,
  } from '@lucide/svelte';
  import { Modal, toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';
  import type {
    ChannelView,
    ChannelsFormResult,
    ChannelsSectionData,
  } from '#lib/notifications/types';

  type Props = { data: ChannelsSectionData; action: string; form?: ChannelsFormResult };
  let { data, action, form = null }: Props = $props();

  const typeIcons: Record<string, typeof Hash> = {
    slack: Hash,
    'google-chat': MessageSquare,
    webhook: Webhook,
  };

  let busy = $state<string | null>(null);
  let createErrors = $state<Record<string, string>>({});
  let editErrors = $state<Record<string, string>>({});
  let editTarget = $state<ChannelView | null>(null);
  let editOpen = $state(false);
  let deleteTarget = $state<ChannelView | null>(null);
  let deleteOpen = $state(false);

  const formCreateErrors = $derived(
    form?.channelForm === 'create' ? (form.channelErrors ?? {}) : {},
  );

  function errorText(errors: Record<string, string>, key: string) {
    return errors[key] ? $_(`notifications.errors.${errors[key]}`) : '';
  }

  function formatDate(value: string | null) {
    return value ? new Date(value).toLocaleString() : '—';
  }

  function errorMessage(code: string | undefined) {
    const key = `notifications.errors.${code ?? ''}`;
    const text = code ? $_(key) : key;
    return text === key ? $_('alerts.wizard.failed') : text;
  }

  function failureMessage(data: Record<string, unknown> | undefined) {
    return errorMessage(data?.channelError ? String(data.channelError) : undefined);
  }

  function openEdit(event: MouseEvent, channel: ChannelView) {
    event.preventDefault();
    editTarget = channel;
    editErrors = {};
    editOpen = true;
  }

  function openDelete(event: MouseEvent, channel: ChannelView) {
    event.preventDefault();
    deleteTarget = channel;
    deleteOpen = true;
  }

  const submit =
    (key: string, onSuccess: (data: Record<string, unknown> | undefined) => void): SubmitFunction =>
    () => {
      busy = key;
      return async ({ result }) => {
        busy = null;
        if (result.type === 'success') {
          onSuccess(result.data);
          await invalidateAll();
        } else if (result.type === 'failure') {
          const errors = (result.data?.channelErrors as Record<string, string>) ?? {};
          if (key === 'create' && Object.keys(errors).length > 0) createErrors = errors;
          else if (key === 'edit' && Object.keys(errors).length > 0) editErrors = errors;
          else toast.error(failureMessage(result.data));
        } else {
          toast.error($_('alerts.wizard.failed'));
        }
      };
    };

  const create = submit('create', () => {
    createErrors = {};
    toast.success($_('notifications.channels.created'));
  });
  const edit = submit('edit', () => {
    editOpen = false;
    toast.success($_('notifications.channels.saved'));
  });
  const remove = submit('delete', () => {
    deleteOpen = false;
    toast.success($_('notifications.channels.deleted'));
  });
  const toggle = (channel: ChannelView) =>
    submit(`toggle:${channel.id}`, () =>
      toast.success(
        channel.enabled
          ? $_('notifications.channels.disabledToast')
          : $_('notifications.channels.enabledToast'),
      ),
    );
  const test = (channel: ChannelView) =>
    submit(`test:${channel.id}`, (data) => {
      const outcome = data?.channelTest as { sent: boolean; error: string | null } | undefined;
      if (outcome?.sent) toast.success($_('notifications.channels.testSent'));
      else
        toast.error(
          $_('notifications.channels.testFailed', { values: { reason: outcome?.error ?? '—' } }),
        );
    });
</script>

<section class="space-y-3" aria-labelledby="channels-title" data-testid="notification-channels">
  <div>
    <h2 id="channels-title" class="flex items-center gap-2 text-sm font-semibold text-white">
      <MessageSquare class="h-4 w-4" />
      {$_('notifications.channels.title')}
    </h2>
    <p class="mt-0.5 text-xs text-fg-subtle">
      {data.scope === 'project'
        ? $_('notifications.channels.descriptionProject')
        : $_('notifications.channels.descriptionOrganization')}
    </p>
  </div>

  <p
    class="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/8 px-3 py-2 text-xs text-amber-100"
  >
    <ShieldAlert class="mt-0.5 h-4 w-4 shrink-0 text-warn" />
    {$_('notifications.channels.privacyNotice')}
  </p>

  {#if form?.channelTest}
    <p
      class="text-xs {form.channelTest.sent ? 'text-ok' : 'text-red-300'}"
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
    <p class="text-xs text-red-300" role="alert">
      {errorMessage(form.channelError)}
    </p>
  {/if}

  {#if data.channels.length === 0}
    <p class="k-card border-dashed px-5 py-6 text-center text-sm text-fg-muted">
      {$_('notifications.channels.empty')}
    </p>
  {:else}
    <ul class="k-card divide-y divide-white/5 overflow-hidden">
      {#each data.channels as channel (channel.id)}
        {@const Icon = typeIcons[channel.type] ?? Webhook}
        <li class="flex flex-wrap items-start gap-3 px-4 py-3" data-channel-id={channel.id}>
          <span
            class="grid h-8 w-8 shrink-0 place-items-center rounded-lg {channel.enabled
              ? 'bg-brand-500/12 text-brand-400'
              : 'bg-white/5 text-fg-subtle'}"><Icon class="h-4 w-4" /></span
          >
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
              {channel.name}
              <span class="k-badge h-5 px-2 text-[10px]">
                {$_(`notifications.channels.types.${channel.type}`)}
              </span>
              {#if !channel.enabled}
                <span class="k-badge h-5 px-2 text-[10px]">
                  {$_('notifications.channels.disabled')}
                </span>
              {/if}
              {#if !channel.available}
                <span class="k-badge k-badge-warn h-5 px-2 text-[10px]">
                  {$_('notifications.channels.unavailable')}
                </span>
              {/if}
            </p>
            <p class="mt-0.5 truncate font-mono text-xs text-fg-subtle">
              {channel.destinationMasked}
            </p>
            <p class="mt-0.5 text-xs text-fg-subtle">
              {$_('notifications.channels.lastDelivery', {
                values: { date: formatDate(channel.lastDeliveryAt) },
              })}
            </p>
            {#if channel.lastError}
              <p class="mt-0.5 text-xs text-red-300">
                {$_('notifications.channels.lastError', { values: { error: channel.lastError } })}
              </p>
            {/if}
          </div>

          <div class="flex items-center gap-1">
            {#if data.canUpdate}
              <form method="POST" action="{action}?/testChannel" use:enhance={test(channel)}>
                <input type="hidden" name="channelId" value={channel.id} />
                <button
                  type="submit"
                  class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                  title={$_('notifications.channels.test')}
                  aria-label="{$_('notifications.channels.test')}: {channel.name}"
                  disabled={busy !== null}
                  data-testid="channel-test"
                >
                  {#if busy === `test:${channel.id}`}<LoaderCircle
                      class="h-4 w-4 animate-spin"
                    />{:else}<Send class="h-4 w-4" />{/if}
                </button>
              </form>
              <form method="POST" action="{action}?/toggleChannel" use:enhance={toggle(channel)}>
                <input type="hidden" name="channelId" value={channel.id} />
                <input type="hidden" name="enabled" value={channel.enabled ? 'false' : 'true'} />
                <button
                  type="submit"
                  class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                  title={channel.enabled
                    ? $_('notifications.channels.disable')
                    : $_('notifications.channels.enable')}
                  aria-label="{channel.enabled
                    ? $_('notifications.channels.disable')
                    : $_('notifications.channels.enable')}: {channel.name}"
                  disabled={busy !== null}
                >
                  <Power class="h-4 w-4" />
                </button>
              </form>
              <button
                type="button"
                class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                title={$_('notifications.channels.edit')}
                aria-label="{$_('notifications.channels.edit')}: {channel.name}"
                onclick={(event) => openEdit(event, channel)}
              >
                <Pencil class="h-4 w-4" />
              </button>
            {/if}
            {#if data.canDelete}
              <form method="POST" action="{action}?/deleteChannel">
                <input type="hidden" name="channelId" value={channel.id} />
                <button
                  type="submit"
                  class="k-btn k-btn-ghost k-btn-icon k-btn-sm hover:text-red-400"
                  title={$_('notifications.channels.delete')}
                  aria-label="{$_('notifications.channels.delete')}: {channel.name}"
                  disabled={busy !== null}
                  onclick={(event) => openDelete(event, channel)}
                >
                  <Trash2 class="h-4 w-4" />
                </button>
              </form>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if data.inherited.length > 0}
    <div class="space-y-2">
      <h3 class="text-xs font-semibold text-fg-muted">
        {$_('notifications.channels.inheritedTitle')}
      </h3>
      <p class="text-xs text-fg-subtle">{$_('notifications.channels.inheritedDescription')}</p>
      <ul class="flex flex-wrap gap-2">
        {#each data.inherited as channel (channel.id)}
          {@const Icon = typeIcons[channel.type] ?? Webhook}
          <li class="k-badge h-7 gap-1.5 px-2.5 text-xs">
            <Icon class="h-3.5 w-3.5" />{channel.name}
            {#if !channel.enabled}
              <span class="text-fg-subtle">· {$_('notifications.channels.disabled')}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if data.canCreate}
    <div class="k-card space-y-3 p-4">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-white">
        <Plus class="h-4 w-4" />
        {$_('notifications.channels.create')}
      </h3>
      {#if data.availableTypes.length === 0}
        <p class="k-help" data-testid="channel-types-unavailable">
          {$_('notifications.channels.noTypes')}
        </p>
      {:else}
        {@const errors = { ...formCreateErrors, ...createErrors }}
        <form
          method="POST"
          action="{action}?/createChannel"
          use:enhance={create}
          class="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]"
        >
          <div>
            <label class="k-label" for="channel-type">{$_('notifications.channels.type')}</label>
            <select
              id="channel-type"
              name="type"
              class="k-input"
              value={form?.channelDraft?.type ?? data.availableTypes[0]}
              aria-invalid={Boolean(errors.type) || undefined}
            >
              {#each data.availableTypes as type (type)}
                <option value={type}>{$_(`notifications.channels.types.${type}`)}</option>
              {/each}
            </select>
            {#if errors.type}<p class="mt-1 text-xs text-red-300">
                {errorText(errors, 'type')}
              </p>{/if}
          </div>
          <div>
            <label class="k-label" for="channel-name">{$_('notifications.channels.name')}</label>
            <input
              id="channel-name"
              name="name"
              maxlength="80"
              placeholder="#alertas-seguridad"
              value={form?.channelDraft?.name ?? ''}
              class="k-input"
              aria-invalid={Boolean(errors.name) || undefined}
            />
            {#if errors.name}<p class="mt-1 text-xs text-red-300">
                {errorText(errors, 'name')}
              </p>{/if}
          </div>
          <div class="sm:col-span-2">
            <label class="k-label" for="channel-destination"
              >{$_('notifications.channels.destination')}</label
            >
            <input
              id="channel-destination"
              name="destination"
              type="url"
              autocomplete="off"
              placeholder="https://…"
              class="k-input font-mono"
              aria-invalid={Boolean(errors.destination) || undefined}
            />
            {#if errors.destination}
              <p class="mt-1 text-xs text-red-300">{errorText(errors, 'destination')}</p>
            {/if}
          </div>
          <div class="sm:col-span-2">
            <button type="submit" class="k-btn k-btn-primary" disabled={busy !== null}>
              {#if busy === 'create'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Plus
                  class="h-4 w-4"
                />{/if}
              {$_('notifications.channels.create')}
            </button>
          </div>
        </form>
      {/if}
    </div>
  {/if}
</section>

{#if data.canUpdate}
  <Modal
    bind:open={editOpen}
    size="sm"
    title={$_('notifications.channels.edit')}
    description={editTarget?.name ?? ''}
  >
    <form
      id="channel-edit-form"
      method="POST"
      action="{action}?/updateChannel"
      use:enhance={edit}
      class="space-y-3"
    >
      <input type="hidden" name="channelId" value={editTarget?.id ?? ''} />
      <div>
        <label class="k-label" for="channel-edit-name">{$_('notifications.channels.name')}</label>
        <input
          id="channel-edit-name"
          name="name"
          maxlength="80"
          value={editTarget?.name ?? ''}
          class="k-input"
          aria-invalid={Boolean(editErrors.name) || undefined}
          data-autofocus
        />
        {#if editErrors.name}<p class="mt-1 text-xs text-red-300">
            {errorText(editErrors, 'name')}
          </p>{/if}
      </div>
      <div>
        <label class="k-label" for="channel-edit-destination"
          >{$_('notifications.channels.newDestination')}</label
        >
        <input
          id="channel-edit-destination"
          name="destination"
          type="url"
          autocomplete="off"
          placeholder={editTarget?.destinationMasked ?? ''}
          class="k-input font-mono"
          aria-invalid={Boolean(editErrors.destination) || undefined}
        />
        {#if editErrors.destination}<p class="mt-1 text-xs text-red-300">
            {errorText(editErrors, 'destination')}
          </p>{/if}
      </div>
    </form>
    {#snippet footer()}
      <button type="button" class="k-btn k-btn-secondary" onclick={() => (editOpen = false)}
        >{$_('common.cancel')}</button
      >
      <button
        type="submit"
        form="channel-edit-form"
        class="k-btn k-btn-primary"
        disabled={busy !== null}
      >
        {#if busy === 'edit'}<LoaderCircle class="h-4 w-4 animate-spin" />{/if}
        {$_('notifications.channels.save')}
      </button>
    {/snippet}
  </Modal>
{/if}

{#if data.canDelete}
  <Modal
    bind:open={deleteOpen}
    role="alertdialog"
    size="sm"
    title={$_('notifications.channels.deleteTitle')}
    description={$_('notifications.channels.confirmDelete')}
  >
    {#snippet icon()}
      <span
        class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
        ><Trash2 class="h-5 w-5" /></span
      >
    {/snippet}
    <form
      id="channel-delete-form"
      method="POST"
      action="{action}?/deleteChannel"
      use:enhance={remove}
    >
      <input type="hidden" name="channelId" value={deleteTarget?.id ?? ''} />
    </form>
    {#snippet footer()}
      <button type="button" class="k-btn k-btn-secondary" onclick={() => (deleteOpen = false)}
        >{$_('common.cancel')}</button
      >
      <button
        type="submit"
        form="channel-delete-form"
        class="k-btn k-btn-danger"
        disabled={busy !== null}
        data-autofocus
      >
        {#if busy === 'delete'}<LoaderCircle class="h-4 w-4 animate-spin" />{/if}
        {$_('notifications.channels.delete')}
      </button>
    {/snippet}
  </Modal>
{/if}
