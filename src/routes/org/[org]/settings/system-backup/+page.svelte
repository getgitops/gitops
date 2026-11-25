<script lang="ts">
  import { Database } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
</script>

<svelte:head>
  <title>{$_('orgSettings.systemBackup.title')} - {$_('orgSettings.title')}</title>
</svelte:head>

<div class="space-y-6">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight text-white">
      {$_('orgSettings.systemBackup.title')}
    </h1>
    <p class="mt-1 text-sm text-fg-muted">{$_('orgSettings.systemBackup.description')}</p>
  </header>

  <div class="k-card flex flex-col items-center gap-3 border-dashed px-6 py-16 text-center">
    <span class="grid h-12 w-12 place-items-center rounded-xl bg-brand-500/10 text-brand-400">
      <Database class="h-6 w-6" />
    </span>
    <p class="flex items-center gap-2 text-sm font-medium text-white">
      {$_('orgSettings.systemBackup.title')}
      <span class="k-badge h-5 px-2 text-[11px]">{$_('common.comingSoon')}</span>
    </p>
    <p class="max-w-sm text-sm text-fg-muted">
      {$_('orgSettings.systemBackup.comingSoonDescription')}
    </p>
  </div>
</div>
