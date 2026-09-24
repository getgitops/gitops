<script lang="ts">
  import { ScrollText } from '@lucide/svelte';
  import { _ } from '$lib/i18n';
</script>

<svelte:head>
  <title>{$_('projectSettings.audit.title')} - {$_('projectSettings.title')}</title>
</svelte:head>

<div class="space-y-6">
  <section>
    <h3 class="text-xl font-semibold text-slate-900">{$_('projectSettings.audit.title')}</h3>
    <p class="mt-2 text-sm text-slate-600">{$_('projectSettings.audit.description')}</p>
  </section>

  <div
    class="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center"
  >
    <ScrollText class="h-8 w-8 text-slate-400" />
    <p class="text-sm font-medium text-slate-700">{$_('projectSettings.audit.comingSoon')}</p>
    <p class="max-w-sm text-sm text-slate-500">{$_('projectSettings.audit.comingSoonDescription')}</p>
  </div>
</div>
