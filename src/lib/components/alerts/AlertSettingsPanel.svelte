<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import {
    Globe,
    LoaderCircle,
    MailCheck,
    MailWarning,
    RefreshCw,
    Save,
    Trash2,
  } from '@lucide/svelte';
  import { Modal, toast } from '#lib/components/ui';
  import type { ExternalRecipientView } from '#modules/notifications/domain/external-recipient.domain';
  import { _ } from '#lib/i18n';
  import { statusBadgeClass } from '#lib/notifications/status';
  import type {
    ChannelsFormResult,
    ChannelsSectionData,
    NotificationSettingsPage,
  } from '#lib/notifications/types';
  import ChannelsSection from '#lib/components/notifications/ChannelsSection.svelte';

  type Props = {
    data: NotificationSettingsPage | null;
    channels?: ChannelsSectionData | null;
    organizationSettingsPath?: string | null;
    action: string;
    form?:
      | ({
          domains?: string;
          errors?: Record<string, string>;
          saved?: boolean;
          blocked?: number;
          restored?: number;
          resendError?: string;
          resent?: string;
          removeError?: string;
          removed?: string;
        } & NonNullable<ChannelsFormResult>)
      | null;
  };
  let {
    data,
    channels = null,
    organizationSettingsPath = null,
    action,
    form = null,
  }: Props = $props();

  let domainError = $state('');
  const formDomainError = $derived(
    form?.errors && Object.values(form.errors)[0]
      ? $_(`notifications.errors.${Object.values(form.errors)[0]}`)
      : '',
  );
  let busy = $state<'domains' | string | null>(null);

  let domainsText = $derived(
    typeof form?.domains === 'string' ? form.domains : (data?.allowedDomains ?? []).join('\n'),
  );

  function formatDate(value: string | null) {
    return value ? new Date(value).toLocaleString() : '—';
  }

  const saveDomains: SubmitFunction = () => {
    busy = 'domains';
    domainError = '';
    return async ({ result }) => {
      busy = null;
      if (result.type === 'success') {
        const blocked = Number(result.data?.blocked ?? 0);
        const restored = Number(result.data?.restored ?? 0);
        toast.success(
          $_('notifications.settings.domainsSavedTitle'),
          blocked || restored
            ? $_('notifications.settings.domainsSaved', { values: { blocked, restored } })
            : undefined,
        );
        await invalidateAll();
      } else if (result.type === 'failure') {
        const errors = (result.data?.errors as Record<string, string>) ?? {};
        const code = Object.values(errors)[0];
        domainError = code
          ? $_(`notifications.errors.${code}`)
          : String(result.data?.error ?? $_('alerts.wizard.failed'));
      } else {
        toast.error($_('alerts.wizard.failed'));
      }
    };
  };

  const resend =
    (recipientId: string): SubmitFunction =>
    () => {
      busy = recipientId;
      return async ({ result }) => {
        busy = null;
        if (result.type === 'success') {
          toast.success($_('notifications.settings.resent'));
          await invalidateAll();
        } else if (result.type === 'failure' && result.data?.resendError) {
          toast.error($_(`notifications.errors.${result.data.resendError}`));
        } else {
          toast.error($_('alerts.wizard.failed'));
        }
      };
    };

  let removeTarget = $state<ExternalRecipientView | null>(null);
  let removeOpen = $state(false);

  function askRemove(event: MouseEvent, recipient: ExternalRecipientView) {
    event.preventDefault();
    removeTarget = recipient;
    removeOpen = true;
  }

  const remove: SubmitFunction = () => {
    busy = 'remove';
    return async ({ result }) => {
      busy = null;
      removeOpen = false;
      if (result.type === 'success') {
        toast.success(
          $_('notifications.settings.removed', { values: { email: String(result.data?.removed) } }),
        );
        await invalidateAll();
      } else if (result.type === 'failure' && result.data?.removeError) {
        toast.error($_(`notifications.errors.${result.data.removeError}`));
      } else {
        toast.error($_('alerts.wizard.failed'));
      }
    };
  };
</script>

<div class="space-y-6">
  {#if data}
    {#if !data.mailConfigured || !data.originConfigured}
      <p
        class="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/8 px-4 py-3 text-sm text-amber-100"
        role="status"
      >
        <MailWarning class="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        {!data.mailConfigured
          ? $_('notifications.settings.mailNotConfigured')
          : $_('notifications.settings.originNotConfigured')}
      </p>
    {/if}

    <section class="k-card space-y-4 p-5" aria-labelledby="external-domains-title">
      <div class="flex items-start gap-3">
        <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-fg">
          <Globe class="h-4 w-4" />
        </span>
        <div>
          <h2 id="external-domains-title" class="text-sm font-semibold text-white">
            {$_('notifications.settings.domainsTitle')}
          </h2>
          <p class="mt-0.5 text-sm text-fg-muted">
            {$_('notifications.settings.domainsDescription')}
          </p>
        </div>
      </div>

      <form method="POST" action="{action}?/domains" use:enhance={saveDomains} class="space-y-3">
        <div>
          <label for="allowed-domains" class="k-label">
            {$_('notifications.settings.domainsLabel')}
          </label>
          <textarea
            id="allowed-domains"
            name="allowedExternalEmailDomains"
            rows="4"
            class="k-input h-auto py-2 font-mono"
            placeholder={'partner.com\n*.example.org'}
            readonly={!data.canEditDomains}
            bind:value={domainsText}
            aria-describedby="allowed-domains-help{domainError ? ' allowed-domains-error' : ''}"
            aria-invalid={Boolean(domainError) || undefined}></textarea>
          <p id="allowed-domains-help" class="k-help">
            {$_('notifications.settings.domainsHelp')}
          </p>
          {#if domainError || formDomainError}
            <p id="allowed-domains-error" class="mt-1 text-xs text-red-300" role="alert">
              {domainError || formDomainError}
            </p>
          {:else if form?.saved}
            <p class="mt-1 text-xs text-ok" role="status">
              {$_('notifications.settings.domainsSaved', {
                values: { blocked: form.blocked ?? 0, restored: form.restored ?? 0 },
              })}
            </p>
          {/if}
        </div>
        {#if data.canEditDomains}
          <button type="submit" class="k-btn k-btn-primary" disabled={busy !== null}>
            {#if busy === 'domains'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Save
                class="h-4 w-4"
              />{/if}
            {$_('notifications.settings.saveDomains')}
          </button>
        {:else}
          <p class="k-help">{$_('notifications.settings.domainsReadonly')}</p>
        {/if}
      </form>
    </section>

    {#if data.recipients}
      <section class="space-y-3" aria-labelledby="external-recipients-title">
        <div>
          <h2
            id="external-recipients-title"
            class="flex items-center gap-2 text-sm font-semibold text-white"
          >
            <MailCheck class="h-4 w-4" />
            {$_('notifications.settings.recipientsTitle')}
          </h2>
          <p class="mt-0.5 text-xs text-fg-subtle">
            {$_('notifications.settings.recipientsDescription')}
          </p>
        </div>

        {#if form?.resendError}
          <p class="text-xs text-red-300" role="alert">
            {$_(`notifications.errors.${form.resendError}`)}
          </p>
        {:else if form?.resent}
          <p class="text-xs text-ok" role="status">{$_('notifications.settings.resent')}</p>
        {:else if form?.removeError}
          <p class="text-xs text-red-300" role="alert">
            {$_(`notifications.errors.${form.removeError}`)}
          </p>
        {:else if form?.removed}
          <p class="text-xs text-ok" role="status">
            {$_('notifications.settings.removed', { values: { email: form.removed } })}
          </p>
        {/if}

        {#if data.recipients.length === 0}
          <p class="k-card border-dashed px-5 py-8 text-center text-sm text-fg-muted">
            {$_('notifications.settings.recipientsEmpty')}
          </p>
        {:else}
          <div class="k-card overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full min-w-160 text-left text-sm">
                <thead class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
                  <tr class="border-b border-white/8">
                    <th scope="col" class="px-5 py-3 font-semibold">
                      {$_('notifications.settings.email')}
                    </th>
                    <th scope="col" class="px-3 py-3 font-semibold">
                      {$_('notifications.settings.status')}
                    </th>
                    <th scope="col" class="px-3 py-3 font-semibold">
                      {$_('notifications.settings.verifiedAt')}
                    </th>
                    <th scope="col" class="px-3 py-3 font-semibold">
                      {$_('notifications.settings.lastSent')}
                    </th>
                    <th scope="col" class="px-5 py-3">
                      <span class="sr-only">{$_('notifications.settings.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                  {#each data.recipients as recipient (recipient.id)}
                    <tr>
                      <td class="px-5 py-3 font-mono text-white">{recipient.email}</td>
                      <td class="px-3 py-3">
                        <span class="{statusBadgeClass(recipient.status)} h-6 px-2 text-[11px]">
                          {$_(`notifications.status.${recipient.status}`)}
                        </span>
                      </td>
                      <td class="px-3 py-3 text-fg-muted">{formatDate(recipient.verifiedAt)}</td>
                      <td class="px-3 py-3 text-fg-muted">
                        {formatDate(recipient.lastVerificationSentAt)}
                      </td>
                      <td class="px-5 py-3">
                        <div class="flex justify-end gap-1">
                          {#if data.canManageRecipients && (recipient.status === 'pending' || recipient.status === 'unsubscribed')}
                            <form
                              method="POST"
                              action="{action}?/resend"
                              use:enhance={resend(recipient.id)}
                            >
                              <input type="hidden" name="recipientId" value={recipient.id} />
                              <button
                                type="submit"
                                class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                                title={$_('notifications.settings.resend')}
                                aria-label="{$_(
                                  'notifications.settings.resend',
                                )}: {recipient.email}"
                                disabled={busy !== null}
                              >
                                {#if busy === recipient.id}<LoaderCircle
                                    class="h-4 w-4 animate-spin"
                                  />{:else}<RefreshCw class="h-4 w-4" />{/if}
                              </button>
                            </form>
                          {/if}
                          {#if data.canManageRecipients && recipient.status === 'pending'}
                            <form method="POST" action="{action}?/remove">
                              <input type="hidden" name="recipientId" value={recipient.id} />
                              <button
                                type="submit"
                                class="k-btn k-btn-ghost k-btn-icon k-btn-sm hover:text-red-400"
                                title={$_('notifications.settings.remove')}
                                aria-label="{$_(
                                  'notifications.settings.remove',
                                )}: {recipient.email}"
                                disabled={busy !== null}
                                onclick={(event) => askRemove(event, recipient)}
                                data-testid="remove-recipient"
                              >
                                <Trash2 class="h-4 w-4" />
                              </button>
                            </form>
                          {/if}
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}
      </section>
    {/if}
  {:else if organizationSettingsPath}
    <p class="k-help">
      {$_('notifications.settings.organizationDomains')}
      <a class="text-brand-400 hover:text-brand-300" href={organizationSettingsPath}
        >{$_('notifications.settings.organizationDomainsLink')}</a
      >
    </p>
  {/if}

  {#if channels}
    <ChannelsSection data={channels} {action} {form} />
  {/if}
</div>

{#if data?.canManageRecipients}
  <Modal
    bind:open={removeOpen}
    role="alertdialog"
    size="sm"
    title={$_('notifications.settings.removeTitle')}
    description={$_('notifications.settings.removeDescription', {
      values: { email: removeTarget?.email ?? '' },
    })}
  >
    {#snippet icon()}
      <span
        class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
        ><Trash2 class="h-5 w-5" /></span
      >
    {/snippet}
    <form id="remove-recipient-form" method="POST" action="{action}?/remove" use:enhance={remove}>
      <input type="hidden" name="recipientId" value={removeTarget?.id ?? ''} />
    </form>
    {#snippet footer()}
      <button type="button" class="k-btn k-btn-secondary" onclick={() => (removeOpen = false)}
        >{$_('common.cancel')}</button
      >
      <button
        type="submit"
        form="remove-recipient-form"
        class="k-btn k-btn-danger"
        disabled={busy !== null}
        data-autofocus
      >
        {#if busy === 'remove'}<LoaderCircle class="h-4 w-4 animate-spin" />{/if}
        {$_('notifications.settings.remove')}
      </button>
    {/snippet}
  </Modal>
{/if}
