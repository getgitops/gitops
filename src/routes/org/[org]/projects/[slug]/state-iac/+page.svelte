<script lang="ts">
  import { GitBranch } from '@lucide/svelte';
  import StackList from '#lib/components/state-iac/StackList.svelte';
  import { _ } from '#lib/i18n';
  import type { BackendStacksView } from '#lib/state-iac/types';

  type Props = {
    data: {
      project: { name: string };
      groups: BackendStacksView[];
      base: string;
      organizationSettingsHref: string;
    };
  };
  let { data }: Props = $props();
</script>

<svelte:head>
  <title>{$_('project.stateIac.title')} - {data.project.name}</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight text-white">{$_('project.stateIac.title')}</h1>
    <p class="mt-1 text-sm text-fg-muted">{$_('stateIac.stacks.projectDescription')}</p>
  </div>

  {#if data.groups.length === 0}
    <div class="k-card border-dashed px-6 py-10 text-center" data-testid="stacks-empty">
      <GitBranch class="mx-auto h-8 w-8 text-fg-subtle" />
      <p class="mt-3 text-sm font-medium text-fg">{$_('stateIac.stacks.emptyTitle')}</p>
      <p class="mx-auto mt-1 max-w-md text-sm text-fg-muted">
        {$_('stateIac.stacks.emptyDescription')}
      </p>
    </div>
  {:else}
    <StackList groups={data.groups} base={data.base} />
  {/if}
</div>
