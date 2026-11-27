<!--
  Canales de la organización: los destinos donde publican sus alertas y las de sus proyectos
  (webhook, canal de Slack…). "Nuevo canal" abre un Modal; sin JavaScript el formulario se pinta
  en línea. El secreto de firma de un canal nuevo o rotado se enseña una sola vez.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Copy, KeyRound, LoaderCircle, MessageSquare, Plus, ShieldAlert } from '@lucide/svelte';
  import { Modal, toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';
  import type { ChannelsFormResult, ChannelsSectionData } from '#lib/notifications/types';
  import ChannelForm from './ChannelForm.svelte';
  import ChannelList from './ChannelList.svelte';

  type Props = { data: ChannelsSectionData; action: string; form?: ChannelsFormResult };
  let { data, action, form = null }: Props = $props();

  /** Until hydration (and without JavaScript) the create form is inline instead of a Modal. */
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });

  let createOpen = $state(false);
  let createBusy = $state<string | null>(null);

  /** Secret just issued (create / rotate): shown once, dropped when the modal closes. */
  let issuedSecret = $state<{ channelId: string; secret: string; rotated?: boolean } | null>(null);
  let secretOpen = $state(false);

  function showSecret(result: Record<string, unknown> | undefined) {
    const issued = result?.channelSecret as typeof issuedSecret;
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

  function created(result: Record<string, unknown> | undefined) {
    createOpen = false;
    showSecret(result);
  }
</script>

<section class="space-y-3" aria-labelledby="channels-title" data-testid="notification-channels">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 id="channels-title" class="flex items-center gap-2 text-sm font-semibold text-white">
        <MessageSquare class="h-4 w-4" />
        {$_('notifications.channels.title')}
      </h2>
      <p class="mt-0.5 text-xs text-fg-subtle">
        {$_('notifications.channels.descriptionOrganization')}
      </p>
    </div>
    {#if data.canCreate && mounted}
      <button
        type="button"
        class="k-btn k-btn-primary k-btn-sm"
        onclick={() => (createOpen = true)}
        data-testid="channel-new"
      >
        <Plus class="h-4 w-4" />{$_('notifications.channels.new')}
      </button>
    {/if}
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

  <ChannelList {data} {action} {form} onsecret={showSecret} />

  {#if data.canCreate && !mounted}
    <div class="k-card space-y-3 p-4" data-testid="channel-create-inline">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-white">
        <Plus class="h-4 w-4" />
        {$_('notifications.channels.new')}
      </h3>
      <ChannelForm {data} {action} {form} formId="channel-create-inline-form" />
    </div>
  {/if}
</section>

{#if data.canCreate && mounted}
  <Modal
    bind:open={createOpen}
    size="lg"
    title={$_('notifications.channels.new')}
    description={$_('notifications.channels.newDescription')}
  >
    {#snippet icon()}
      <span
        class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/12 text-brand-400"
        ><MessageSquare class="h-5 w-5" /></span
      >
    {/snippet}
    <ChannelForm
      {data}
      {action}
      formId="channel-create-form"
      variant="modal"
      bind:busy={createBusy}
      oncreated={created}
    />
    {#snippet footer()}
      <button type="button" class="k-btn k-btn-secondary" onclick={() => (createOpen = false)}
        >{$_('common.cancel')}</button
      >
      {#if data.availableTypes.length > 0}
        <button
          type="submit"
          form="channel-create-form"
          class="k-btn k-btn-primary"
          disabled={createBusy !== null}
          data-testid="channel-create-submit"
        >
          {#if createBusy === 'create'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Plus
              class="h-4 w-4"
            />{/if}
          {$_('notifications.channels.create')}
        </button>
      {/if}
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
