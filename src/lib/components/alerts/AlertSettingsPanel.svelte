<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { Globe, LoaderCircle, MailCheck, MailWarning, RefreshCw, Save } from '@lucide/svelte';
  import { toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';
  import { statusBadgeClass } from '#lib/notifications/status';
  import type { NotificationSettingsPage } from '#lib/notifications/types';

  type Props = {
    data: NotificationSettingsPage;
    action: string;
    form?: {
      domains?: string;
      errors?: Record<string, string>;
      saved?: boolean;
      blocked?: number;
      restored?: number;
      resendError?: string;
      resent?: string;
    } | null;
  };
  let { data, action, form = null }: Props = $props();

  let domainError = $state('');
  const formDomainError = $derived(
    form?.errors && Object.values(form.errors)[0]
      ? $_(`notifications.errors.${Object.values(form.errors)[0]}`)
      : '',
  );
  let busy = $state<'domains' | string | null>(null);

  let domainsText = $derived(
    typeof form?.domains === 'string' ? form.domains : data.allowedDomains.join('\n'),
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
</script>

<div class="space-y-6">
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
                    <td class="px-5 py-3 text-right">
                      {#if data.canManageRecipients && (recipient.status === 'pending' || recipient.status === 'unsubscribed')}
                        <form
                          method="POST"
                          action="{action}?/resend"
                          use:enhance={resend(recipient.id)}
                        >
                          <input type="hidden" name="recipientId" value={recipient.id} />
                          <button
                            type="submit"
                            class="k-btn k-btn-ghost k-btn-sm"
                            disabled={busy !== null}
                          >
                            {#if busy === recipient.id}<LoaderCircle
                                class="h-3.5 w-3.5 animate-spin"
                              />{:else}<RefreshCw class="h-3.5 w-3.5" />{/if}
                            {$_('notifications.settings.resend')}
                          </button>
                        </form>
                      {/if}
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
</div>
