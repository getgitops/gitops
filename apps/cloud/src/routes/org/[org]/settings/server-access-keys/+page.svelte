<script lang="ts">
  import { _ } from '$lib/i18n';
</script>

<svelte:head>
  <title>{$_('orgSettings.serverAccessKeys.title')} - {$_('orgSettings.title')}</title>
</svelte:head>

<div class="space-y-6">
  <section>
    <h3 class="text-xl font-semibold text-slate-900">{$_('orgSettings.serverAccessKeys.title')}</h3>
    <p class="mt-2 text-sm text-slate-600">{$_('orgSettings.serverAccessKeys.description')}</p>
  </section>

  <section class="rounded-md border border-slate-200 bg-slate-50 p-4">
    <p class="text-sm text-slate-600">{$_('orgSettings.serverAccessKeys.comingSoonDescription')}</p>
  </section>
</div>
