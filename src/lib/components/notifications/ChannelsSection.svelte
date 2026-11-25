<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import {
    Check,
    Copy,
    Hash,
    KeyRound,
    LoaderCircle,
    MessageSquare,
    Pencil,
    Plus,
    Power,
    RefreshCw,
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

  /** Every channel type, available or not: the ones without a transport show as coming soon. */
  const CHANNEL_TYPES = ['webhook', 'slack', 'google-chat'] as const;
  const typeDescriptions: Record<(typeof CHANNEL_TYPES)[number], string> = {
    webhook: 'alerts.wizard.webhookDescription',
    slack: 'alerts.wizard.slackDescription',
    'google-chat': 'alerts.wizard.googleChatDescription',
  };

  let busy = $state<string | null>(null);
  let createErrors = $state<Record<string, string>>({});
  let editErrors = $state<Record<string, string>>({});
  let editTarget = $state<ChannelView | null>(null);
  let editOpen = $state(false);
  let deleteTarget = $state<ChannelView | null>(null);
  let deleteOpen = $state(false);
  let rotateTarget = $state<ChannelView | null>(null);
  let rotateOpen = $state(false);
  /** Secret just issued (create / rotate): shown once, dropped when the modal closes. */
  let issuedSecret = $state<{ channelId: string; secret: string; rotated?: boolean } | null>(null);
  let secretOpen = $state(false);
  let createType = $state('');
  const selectedType = $derived(
    createType || (form?.channelDraft?.type ?? data.availableTypes[0] ?? ''),
  );

  function showSecret(data: Record<string, unknown> | undefined) {
    const issued = data?.channelSecret as typeof issuedSecret;
    if (!issued?.secret) return;
    issuedSecret = issued;
    secretOpen = true;
  }

  $effect(() => {
    // nothing of the secret stays in memory once the modal is closed
    if (!secretOpen) issuedSecret = null;
  });

  async function copySecret() {
    if (!issuedSecret) return;
    try {
      await navigator.clipboard.writeText(issuedSecret.secret);
      toast.success($_('notifications.channels.secretCopied'));
    } catch {
      toast.error($_('alerts.wizard.failed'));
    }
  }

  function openRotate(event: MouseEvent, channel: ChannelView) {
    event.preventDefault();
    rotateTarget = channel;
    rotateOpen = true;
  }

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

  const create = submit('create', (result) => {
    createErrors = {};
    toast.success($_('notifications.channels.created'));
    showSecret(result);
  });
  const rotate = submit('rotate', (result) => {
    rotateOpen = false;
    toast.success($_('notifications.channels.rotated'));
    showSecret(result);
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

  {#if form?.channelSecret}
    <!-- without JavaScript the action result is the only place the secret is ever shown -->
    <div class="k-card space-y-2 p-4" role="status" data-testid="channel-secret-nojs">
      <p class="flex items-center gap-2 text-sm font-semibold text-white">
        <KeyRound class="h-4 w-4" />{$_('notifications.channels.secretTitle')}
      </p>
      <p class="text-xs text-fg-muted">{$_('notifications.channels.secretDescription')}</p>
      <code class="block break-all rounded-lg bg-ink-900 px-3 py-2 font-mono text-xs text-white"
        >{form.channelSecret.secret}</code
      >
    </div>
  {/if}

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
          class="grid gap-3 sm:grid-cols-2"
        >
          <!-- native radios styled as cards: the form keeps working without JavaScript -->
          <fieldset
            class="sm:col-span-2"
            aria-describedby={errors.type ? 'channel-type-error' : undefined}
            data-testid="channel-type-cards"
          >
            <legend class="k-label">{$_('notifications.channels.type')}</legend>
            <div class="grid gap-2 sm:grid-cols-3">
              {#each CHANNEL_TYPES as type (type)}
                {@const Icon = typeIcons[type] ?? Webhook}
                {@const available = data.availableTypes.includes(type)}
                {@const on = available && selectedType === type}
                <label
                  class="relative flex flex-col items-start gap-2 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/60 {on
                    ? 'border-brand-500/50 bg-brand-500/8'
                    : available
                      ? 'cursor-pointer border-white/10 hover:border-white/20 hover:bg-white/2'
                      : 'cursor-not-allowed border-white/8 opacity-55'}"
                  data-channel-type={type}
                >
                  <input
                    type="radio"
                    name="type"
                    value={type}
                    class="sr-only"
                    checked={on}
                    disabled={!available}
                    onchange={() => (createType = type)}
                  />
                  <span
                    class="grid h-8 w-8 place-items-center rounded-lg {on
                      ? 'bg-brand-500/15 text-brand-400'
                      : 'bg-white/5 text-fg-subtle'}"><Icon class="h-4 w-4" /></span
                  >
                  <span class="text-sm font-medium text-white">
                    {$_(`notifications.channels.types.${type}`)}
                  </span>
                  <span class="text-xs text-fg-subtle">{$_(typeDescriptions[type])}</span>
                  {#if available}
                    <span
                      class="pointer-events-none absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full border {on
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-white/15'}"
                      >{#if on}<Check class="h-3.5 w-3.5" />{/if}</span
                    >
                  {:else}
                    <span class="k-badge absolute right-3 top-3 h-5 px-1.5 text-[10px]"
                      >{$_('notifications.channels.comingSoon')}</span
                    >
                  {/if}
                </label>
              {/each}
            </div>
            {#if errors.type}<p id="channel-type-error" class="mt-1 text-xs text-red-300">
                {errorText(errors, 'type')}
              </p>{/if}
          </fieldset>
          <div class="sm:col-span-2">
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
            {:else if selectedType === 'webhook'}
              <p class="k-help mt-1">{$_('notifications.channels.webhookHelp')}</p>
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

<Modal
  bind:open={secretOpen}
  size="md"
  title={$_('notifications.channels.secretTitle')}
  description={$_('notifications.channels.secretDescription')}
>
  {#snippet icon()}
    <span
      class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/12 text-brand-400"
      ><KeyRound class="h-5 w-5" /></span
    >
  {/snippet}
  {#if issuedSecret}
    <div class="flex items-center gap-2">
      <code
        class="block min-w-0 flex-1 break-all rounded-lg bg-ink-900 px-3 py-2 font-mono text-xs text-white"
        data-testid="channel-secret">{issuedSecret.secret}</code
      >
      <button
        type="button"
        class="k-btn k-btn-secondary k-btn-sm"
        onclick={copySecret}
        aria-label={$_('notifications.channels.secretCopy')}
      >
        <Copy class="h-4 w-4" />{$_('notifications.channels.secretCopy')}
      </button>
    </div>
  {/if}
  {#snippet footer()}
    <button
      type="button"
      class="k-btn k-btn-primary"
      onclick={() => (secretOpen = false)}
      data-autofocus
      data-testid="channel-secret-done">{$_('notifications.channels.secretDone')}</button
    >
  {/snippet}
</Modal>
