<!--
  Lista de canales de la organización con sus acciones: probar, habilitar/deshabilitar, rotar el
  secreto (tipos firmados), editar y eliminar (confirmado en un Modal).
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { KeyRound, LoaderCircle, Pencil, Power, RefreshCw, Send, Trash2 } from '@lucide/svelte';
  import { Modal, toast } from '#lib/components/ui';
  import { _, SUPPORTED_LOCALES } from '#lib/i18n';
  import type {
    ChannelView,
    ChannelsFormResult,
    ChannelsSectionData,
  } from '#lib/notifications/types';
  import { errorMessage, formatDate, typeIcon } from './channel-ui';

  type Props = {
    data: ChannelsSectionData;
    action: string;
    form?: ChannelsFormResult;
    /** A rotation issued a new signing secret: the parent shows it once. */
    onsecret?: (result: Record<string, unknown> | undefined) => void;
  };
  let { data, action, form = null, onsecret }: Props = $props();

  let busy = $state<string | null>(null);
  let editErrors = $state<Record<string, string>>({});
  let editTarget = $state<ChannelView | null>(null);
  let editOpen = $state(false);
  let deleteTarget = $state<ChannelView | null>(null);
  let deleteOpen = $state(false);
  let rotateTarget = $state<ChannelView | null>(null);
  let rotateOpen = $state(false);

  function errorText(errors: Record<string, string>, key: string) {
    return errors[key] ? $_(`notifications.errors.${errors[key]}`) : '';
  }

  function failureMessage(data: Record<string, unknown> | undefined) {
    return errorMessage($_, data?.channelError ? String(data.channelError) : undefined);
  }

  function openRotate(event: MouseEvent, channel: ChannelView) {
    event.preventDefault();
    rotateTarget = channel;
    rotateOpen = true;
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
          if (key === 'edit' && Object.keys(errors).length > 0) editErrors = errors;
          else toast.error(failureMessage(result.data));
        } else {
          toast.error($_('alerts.wizard.failed'));
        }
      };
    };

  const rotate = submit('rotate', (result) => {
    rotateOpen = false;
    toast.success($_('notifications.channels.rotated'));
    onsecret?.(result);
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

<div class="space-y-3" data-testid="channel-list">
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
  {:else if form?.channelError && form.channelForm !== 'create' && form.channelForm !== 'slack-app' && !form.channelErrors}
    <p class="text-xs text-red-300" role="alert">
      {errorMessage($_, form.channelError)}
    </p>
  {/if}

  {#if data.channels.length === 0}
    <p class="k-card border-dashed px-5 py-6 text-center text-sm text-fg-muted">
      {$_('notifications.channels.empty')}
    </p>
  {:else}
    <ul class="k-card divide-y divide-white/5 overflow-hidden">
      {#each data.channels as channel (channel.id)}
        {@const Icon = typeIcon(channel.type)}
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
              <span class="k-badge h-5 px-2 text-[10px]" data-testid="channel-locale">
                {$_(`notifications.channels.locales.${channel.locale}`)}
              </span>
              {#if !channel.enabled}
                <span
                  class="k-badge h-5 px-2 text-[10px] {channel.disabledReason
                    ? 'k-badge-danger'
                    : ''}"
                >
                  {$_('notifications.channels.disabled')}
                </span>
              {/if}
              {#if channel.signed}
                <span class="k-badge h-5 gap-1 px-2 text-[10px]">
                  <KeyRound class="h-3 w-3" />{$_('notifications.channels.signed')}
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
            {#if !channel.enabled && channel.disabledReason === 'failures'}
              <p class="mt-0.5 text-xs text-red-300" data-testid="channel-auto-disabled">
                {$_('notifications.channels.autoDisabled', {
                  values: { failures: channel.consecutiveFailures },
                })}
              </p>
            {/if}
            {#if channel.rotationEndsAt}
              <p class="mt-0.5 text-xs text-fg-subtle">
                {$_('notifications.channels.rotationEndsAt', {
                  values: { date: formatDate(channel.rotationEndsAt) },
                })}
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
              {#if channel.signed && channel.available}
                <form method="POST" action="{action}?/rotateChannelSecret">
                  <input type="hidden" name="channelId" value={channel.id} />
                  <button
                    type="submit"
                    class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                    title={$_('notifications.channels.rotate')}
                    aria-label="{$_('notifications.channels.rotate')}: {channel.name}"
                    disabled={busy !== null}
                    onclick={(event) => openRotate(event, channel)}
                    data-testid="channel-rotate"
                  >
                    <RefreshCw class="h-4 w-4" />
                  </button>
                </form>
              {/if}
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
</div>

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
      <div>
        <label class="k-label" for="channel-edit-locale"
          >{$_('notifications.channels.locale')}</label
        >
        {#key editTarget?.id}
          <select
            id="channel-edit-locale"
            name="locale"
            class="k-input"
            aria-invalid={Boolean(editErrors.locale) || undefined}
          >
            {#each SUPPORTED_LOCALES as option (option)}
              <option value={option} selected={editTarget?.locale === option}
                >{$_(`notifications.channels.locales.${option}`)}</option
              >
            {/each}
          </select>
        {/key}
        {#if editErrors.locale}<p class="mt-1 text-xs text-red-300">
            {errorText(editErrors, 'locale')}
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

{#if data.canUpdate}
  <Modal
    bind:open={rotateOpen}
    role="alertdialog"
    size="sm"
    title={$_('notifications.channels.rotateTitle')}
    description={$_('notifications.channels.confirmRotate')}
  >
    {#snippet icon()}
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warn/10 text-warn"
        ><RefreshCw class="h-5 w-5" /></span
      >
    {/snippet}
    <form
      id="channel-rotate-form"
      method="POST"
      action="{action}?/rotateChannelSecret"
      use:enhance={rotate}
    >
      <input type="hidden" name="channelId" value={rotateTarget?.id ?? ''} />
    </form>
    {#snippet footer()}
      <button type="button" class="k-btn k-btn-secondary" onclick={() => (rotateOpen = false)}
        >{$_('common.cancel')}</button
      >
      <button
        type="submit"
        form="channel-rotate-form"
        class="k-btn k-btn-primary"
        disabled={busy !== null}
        data-autofocus
        data-testid="channel-rotate-confirm"
      >
        {#if busy === 'rotate'}<LoaderCircle class="h-4 w-4 animate-spin" />{/if}
        {$_('notifications.channels.rotate')}
      </button>
    {/snippet}
  </Modal>
{/if}
