<script lang="ts">
  import { Database, Settings } from '@lucide/svelte';
  import StackList from '#lib/components/state-iac/StackList.svelte';
  import { _ } from '#lib/i18n';
  import type { BackendStacksView } from '#lib/state-iac/types';

  type Props = {
    data: {
      groups: BackendStacksView[];
      base: string;
      projectNames: Record<string, string>;
      settingsHref: string;
      canReadOrgStateIac?: boolean;
    };
  };
  let { data }: Props = $props();
</script>

<svelte:head>
  <title>{$_('stateIac.stacks.organizationTitle')} · GitOps</title>
</svelte:head>

<div class="space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold text-white">{$_('stateIac.stacks.organizationTitle')}</h1>
      <p class="mt-1 max-w-2xl text-sm text-fg-muted">
        {$_('stateIac.stacks.organizationDescription')}
      </p>
    </div>
    {#if data.canReadOrgStateIac}
      <a href={data.settingsHref} class="k-btn k-btn-secondary">
        <Settings class="h-4 w-4" />
        {$_('stateIac.stacks.manageBackends')}
      </a>
    {/if}
  </header>

  {#if data.groups.length === 0}
    <div class="k-card border-dashed px-6 py-10 text-center" data-testid="stacks-empty">
      <Database class="mx-auto h-8 w-8 text-fg-subtle" />
      <p class="mt-3 text-sm font-medium text-fg">{$_('stateIac.backends.emptyTitle')}</p>
      <p class="mt-1 text-sm text-fg-muted">{$_('stateIac.backends.emptyDescription')}</p>
    </div>
  {:else}
    <StackList groups={data.groups} base={data.base} projectNames={data.projectNames} />
  {/if}
</div>
