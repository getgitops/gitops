<script lang="ts">
  import { _ } from '$lib/i18n';
</script>

<svelte:head>
  <title>{$_('orgSettings.title')} - GitOps</title>
</svelte:head>

<div class="mx-auto w-full max-w-7xl">
  <div class="min-h-130 overflow-visible border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
    <div class="border-b border-slate-200 px-6 py-4 sm:px-8">
      <h2 class="text-lg font-semibold text-slate-900">{$_('orgSettings.title')}</h2>
    </div>
    <div class="p-6 sm:p-8">
      <slot />
    </div>
  </div>
</div>
