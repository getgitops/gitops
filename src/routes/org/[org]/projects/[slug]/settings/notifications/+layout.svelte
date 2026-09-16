<script lang="ts">
  import { page } from '$app/stores';
  import { BellRing, History } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

  export let data: {
    project?: {
      slug?: string | null;
      organization?: { slug?: string | null } | null;
    };
  };

  $: orgSlug = data?.project?.organization?.slug ?? $page?.params?.org ?? '';
  $: projectSlug = data?.project?.slug ?? $page?.params?.slug ?? '';
  $: basePath = `/org/${orgSlug}/projects/${projectSlug}/settings/notifications`;
  $: currentPath = $page?.url?.pathname ?? '';
  $: tabs = [
    { label: $_('projectSettings.notifications.rules'), href: basePath, icon: BellRing },
    {
      label: $_('projectSettings.notifications.history'),
      href: `${basePath}/history`,
      icon: History,
    },
  ];
</script>

<div class="overflow-hidden rounded-md border border-slate-200 bg-white">
  <div class="border-b border-slate-200 px-4 pt-4">
    <div class="flex gap-1 overflow-x-auto" role="tablist">
      {#each tabs as tab}
        <a
          href={tab.href}
          class="inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium {currentPath ===
          tab.href
            ? 'border-slate-900 text-slate-900'
            : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'}"
        >
          <svelte:component this={tab.icon} class="h-4 w-4" />
          {tab.label}
        </a>
      {/each}
    </div>
  </div>
  <div class="p-4 sm:p-6"><slot /></div>
</div>
