<script lang="ts">
  import { _ } from '#lib/i18n';
  import ChannelsSection from '#lib/components/notifications/ChannelsSection.svelte';
  import type { ChannelsFormResult } from '#lib/notifications/types';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>{$_('notifications.settings.title')} - {$_('projectSettings.title')}</title>
</svelte:head>

<div class="space-y-8">
  <section>
    <h3 class="text-xl font-semibold text-slate-900">{$_('notifications.settings.title')}</h3>
    <p class="mt-2 text-sm text-slate-600">{$_('notifications.settings.projectDescription')}</p>
  </section>

  <ChannelsSection data={data.channels} form={form as ChannelsFormResult} />
</div>
