<script lang="ts">
  import { enhance } from '$app/forms';
  import { Globe, MailCheck, MailWarning, RefreshCw, Save } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import { statusBadgeClass } from '#lib/notifications/status';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let domainsText = $derived(
    form && 'domains' in form && typeof form.domains === 'string'
      ? form.domains
      : data.allowedDomains.join('\n'),
  );
  let domainErrors = $derived(
    form && 'errors' in form && form.errors ? Object.values(form.errors) : [],
  );

  function formatDate(value: string | null) {
    return value ? new Date(value).toLocaleString() : '—';
  }
</script>

<svelte:head>
  <title>{$_('notifications.settings.title')} - {$_('orgSettings.title')}</title>
</svelte:head>

<div class="space-y-8">
  <section>
    <h3 class="text-xl font-semibold text-slate-900">{$_('notifications.settings.title')}</h3>
    <p class="mt-2 text-sm text-slate-600">{$_('notifications.settings.description')}</p>
  </section>

  {#if !data.mailConfigured || !data.originConfigured}
    <p
      class="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
    >
      <MailWarning class="mt-0.5 h-4 w-4 shrink-0" />
      {!data.mailConfigured
        ? $_('notifications.settings.mailNotConfigured')
        : $_('notifications.settings.originNotConfigured')}
    </p>
  {/if}

  <!-- allowed domains: organization:settings:update -->
  <section class="space-y-4" aria-labelledby="external-domains-title">
    <div>
      <h4
        id="external-domains-title"
        class="flex items-center gap-2 text-base font-semibold text-slate-900"
      >
        <Globe class="h-4 w-4" />
        {$_('notifications.settings.domainsTitle')}
      </h4>
      <p class="mt-1 text-sm text-slate-600">{$_('notifications.settings.domainsDescription')}</p>
    </div>

    <form method="POST" action="?/domains" use:enhance class="space-y-3">
      <label for="allowed-domains" class="text-sm font-medium text-slate-700">
        {$_('notifications.settings.domainsLabel')}
      </label>
      <textarea
        id="allowed-domains"
        name="allowedExternalEmailDomains"
        rows="4"
        class="field-input w-full rounded-md border px-3 py-2 font-mono text-sm"
        placeholder={'partner.com\n*.example.org'}
        readonly={!data.canEditDomains}
        aria-describedby="allowed-domains-help"
        aria-invalid={domainErrors.length > 0 || undefined}>{domainsText}</textarea
      >
      <p id="allowed-domains-help" class="text-xs text-slate-500">
        {$_('notifications.settings.domainsHelp')}
      </p>
      {#if domainErrors.length > 0}
        <p class="text-xs text-red-600" role="alert">
          {$_(`notifications.errors.${domainErrors[0]}`)}
        </p>
      {/if}
      {#if form && 'saved' in form && form.saved}
        <p class="text-sm text-emerald-700" role="status">
          {$_('notifications.settings.domainsSaved', {
            values: { blocked: form.blocked ?? 0, restored: form.restored ?? 0 },
          })}
        </p>
      {/if}
      {#if data.canEditDomains}
        <button
          type="submit"
          class="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Save class="h-4 w-4" />
          {$_('notifications.settings.saveDomains')}
        </button>
      {:else}
        <p class="text-xs text-slate-500">{$_('notifications.settings.domainsReadonly')}</p>
      {/if}
    </form>
  </section>

  <!-- external recipients: organization:notifications:read / update -->
  {#if data.recipients}
    <section class="space-y-4" aria-labelledby="external-recipients-title">
      <div>
        <h4
          id="external-recipients-title"
          class="flex items-center gap-2 text-base font-semibold text-slate-900"
        >
          <MailCheck class="h-4 w-4" />
          {$_('notifications.settings.recipientsTitle')}
        </h4>
        <p class="mt-1 text-sm text-slate-600">
          {$_('notifications.settings.recipientsDescription')}
        </p>
      </div>

      {#if form && 'resendError' in form && form.resendError}
        <p
          class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {$_(`notifications.errors.${form.resendError}`)}
        </p>
      {:else if form && 'resent' in form && form.resent}
        <p class="text-sm text-emerald-700" role="status">
          {$_('notifications.settings.resent')}
        </p>
      {/if}

      {#if data.recipients.length === 0}
        <p
          class="rounded-md border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500"
        >
          {$_('notifications.settings.recipientsEmpty')}
        </p>
      {:else}
        <div class="overflow-x-auto rounded-md border border-slate-200">
          <table class="min-w-full divide-y divide-slate-200 text-sm">
            <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" class="px-4 py-3">{$_('notifications.settings.email')}</th>
                <th scope="col" class="px-4 py-3">{$_('notifications.settings.status')}</th>
                <th scope="col" class="px-4 py-3">{$_('notifications.settings.verifiedAt')}</th>
                <th scope="col" class="px-4 py-3">{$_('notifications.settings.lastSent')}</th>
                <th scope="col" class="px-4 py-3">
                  <span class="sr-only">{$_('notifications.settings.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              {#each data.recipients as recipient (recipient.id)}
                <tr>
                  <td class="px-4 py-3 font-mono text-slate-900">{recipient.email}</td>
                  <td class="px-4 py-3">
                    <span
                      class="rounded-full border px-2 py-0.5 text-xs {statusBadgeClass(
                        recipient.status,
                      )}"
                    >
                      {$_(`notifications.status.${recipient.status}`)}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-slate-600">{formatDate(recipient.verifiedAt)}</td>
                  <td class="px-4 py-3 text-slate-600">
                    {formatDate(recipient.lastVerificationSentAt)}
                  </td>
                  <td class="px-4 py-3 text-right">
                    {#if data.canManageRecipients && (recipient.status === 'pending' || recipient.status === 'unsubscribed')}
                      <form method="POST" action="?/resend" use:enhance>
                        <input type="hidden" name="recipientId" value={recipient.id} />
                        <button
                          type="submit"
                          class="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900"
                        >
                          <RefreshCw class="h-3.5 w-3.5" />
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
      {/if}
    </section>
  {/if}
</div>
