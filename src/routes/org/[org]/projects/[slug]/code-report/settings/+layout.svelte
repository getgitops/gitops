<script lang="ts">
  import { page } from '$app/stores';
  import { Bot, ListChecks, Settings, Webhook } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

  export let data: {
    project?: {
      slug?: string | null;
      organization?: { slug?: string | null } | null;
    };
  };

  $: orgSlug = data?.project?.organization?.slug ?? $page?.params?.org ?? '';
  $: projectSlug = data?.project?.slug ?? $page?.params?.slug ?? '';
  $: basePath = `/org/${orgSlug}/projects/${projectSlug}/code-report/settings`;

  $: tabs = [
    { label: $_('codeReport.settings.general'), href: `${basePath}`, icon: Settings },
    { label: $_('codeReport.settings.tools'), href: `${basePath}/tools`, icon: ListChecks },
    { label: $_('codeReport.settings.notifications'), href: `${basePath}/notifications`, icon: Webhook, soon: true },
    { label: $_('codeReport.settings.reportBot'), href: `${basePath}/bot`, icon: Bot, soon: true },
    { label: $_('codeReport.settings.webhooks'), href: `${basePath}/webhooks`, icon: Webhook, soon: true },
  ];

  $: currentPath = $page?.url?.pathname ?? '';
</script>

<div class="mx-auto w-full max-w-7xl">
  <section class="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
    <div class="border-b border-slate-200 px-6 py-4 sm:px-8">
      <h2 class="text-lg font-semibold text-slate-900">{$_('codeReport.settings.title')}</h2>
      <div
        class="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200 hide-scrollbar"
        role="tablist"
        aria-label={$_('codeReport.settings.tabsLabel')}
      >
        {#each tabs as tab}
          {#if tab.soon}
            <button
              type="button"
              disabled
              class="inline-flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-400"
              title={$_('codeReport.settings.comingSoon')}
            >
              <svelte:component this={tab.icon} class="h-4 w-4" />
              {tab.label}
              <span
                class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
              >
                {$_('codeReport.settings.soon')}
              </span>
            </button>
          {:else}
            <a
              href={tab.href}
              class="inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors {currentPath === tab.href || currentPath.startsWith(`${tab.href}/`)
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'}"
            >
              <svelte:component this={tab.icon} class="h-4 w-4" />
              {tab.label}
            </a>
          {/if}
        {/each}
      </div>
    </div>

    <div class="p-6 sm:p-8">
      <slot />
    </div>
  </section>
</div>

<style>
  .hide-scrollbar::-webkit-scrollbar {
    display: none;
  }

  .hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
