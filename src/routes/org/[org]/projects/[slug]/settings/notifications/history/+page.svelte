<script lang="ts">
  import { CheckCircle2, Clock3, History, XCircle } from '@lucide/svelte';
  import { _, locale } from '$lib/i18n';

  type Delivery = {
    id: string;
    eventName: string;
    channel: string;
    recipients: string[];
    status: 'pending' | 'sent' | 'failed';
    error: string | null;
    createdAt: string;
    sentAt: string | null;
  };

  export let data: { deliveries: Delivery[] };

  function formatDate(value: string) {
    return new Intl.DateTimeFormat($locale ?? 'es', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  function statusLabel(status: Delivery['status']) {
    return $_(`projectSettings.notifications.status.${status}`);
  }
</script>

<svelte:head><title>{$_('projectSettings.notifications.history')}</title></svelte:head>

<div class="space-y-6">
  <div>
    <h2 class="text-xl font-semibold text-slate-900">
      {$_('projectSettings.notifications.history')}
    </h2>
    <p class="mt-1 text-sm text-slate-600">
      {$_('projectSettings.notifications.historyDescription')}
    </p>
  </div>

  {#if data.deliveries.length === 0}
    <div
      class="flex flex-col items-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center"
    >
      <History class="h-8 w-8 text-slate-400" />
      <p class="text-sm font-medium text-slate-700">
        {$_('projectSettings.notifications.emptyHistory')}
      </p>
    </div>
  {:else}
    <div class="overflow-x-auto rounded-md border border-slate-200">
      <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr
            ><th class="px-4 py-3">{$_('projectSettings.notifications.statusLabel')}</th><th
              class="px-4 py-3">{$_('projectSettings.notifications.event')}</th
            ><th class="px-4 py-3">{$_('projectSettings.notifications.recipients')}</th><th
              class="px-4 py-3">{$_('projectSettings.notifications.executedAt')}</th
            ></tr
          >
        </thead>
        <tbody class="divide-y divide-slate-200 bg-white">
          {#each data.deliveries as delivery (delivery.id)}
            <tr>
              <td class="px-4 py-3 align-top">
                <span
                  class="inline-flex items-center gap-1.5 font-medium {delivery.status === 'sent'
                    ? 'text-emerald-700'
                    : delivery.status === 'failed'
                      ? 'text-red-700'
                      : 'text-amber-700'}"
                >
                  {#if delivery.status === 'sent'}<CheckCircle2
                      class="h-4 w-4"
                    />{:else if delivery.status === 'failed'}<XCircle
                      class="h-4 w-4"
                    />{:else}<Clock3 class="h-4 w-4" />{/if}
                  {statusLabel(delivery.status)}
                </span>
                {#if delivery.error}<p class="mt-1 max-w-xs text-xs text-red-600">
                    {delivery.error}
                  </p>{/if}
              </td>
              <td class="whitespace-nowrap px-4 py-3 align-top font-mono text-xs text-slate-700"
                >{delivery.eventName}</td
              >
              <td class="max-w-sm break-all px-4 py-3 align-top text-slate-600"
                >{delivery.recipients.join(', ')}</td
              >
              <td class="whitespace-nowrap px-4 py-3 align-top text-slate-600"
                >{formatDate(delivery.sentAt ?? delivery.createdAt)}</td
              >
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
