<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';
  import { page } from '$app/state';
  import AlertSettingsPanel from '#lib/components/alerts/AlertSettingsPanel.svelte';
  import { _ } from '#lib/i18n';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>{$_('notifications.settings.title')} - {$_('orgSettings.title')}</title>
</svelte:head>

<div class="space-y-8">
  <header>
    <a
      href="/org/{page.params.org}/settings/alerts"
      class="mb-3 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-white"
    >
      <ArrowLeft class="h-4 w-4" />
      {$_('notifications.settings.back')}
    </a>
    <h1 class="text-2xl font-semibold tracking-tight text-white">
      {$_('notifications.settings.title')}
    </h1>
    <p class="mt-1 max-w-2xl text-sm text-fg-muted">
      {$_('notifications.settings.description')}
    </p>
  </header>

  <AlertSettingsPanel
    data={data.settings}
    channels={data.channels}
    {form}
    action={page.url.pathname}
  />
</div>
