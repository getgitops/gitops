<!--
  Detalle de un stack: árbol de recursos por `parent` (con filtros por tipo, provider y protect),
  panel lateral con inputs/outputs/dependencias y pestaña de outputs del stack.
-->
<script lang="ts">
  import { ChevronDown, ChevronRight, Box, Boxes, Lock, RefreshCw, Shield } from '@lucide/svelte';
  import { refreshStacks } from '#lib/state-iac/refresh';
  import { page } from '$app/state';
  import { Drawer, Tabs } from '#lib/components/ui';
  import { _ } from '#lib/i18n';
  import type { IacResourceView, StackDetailView } from '#lib/state-iac/types';
  import IacValue from './IacValue.svelte';

  type Props = {
    detail: StackDetailView;
    /** Sin `project:stateiac:states:read` solo se ve el resumen. */
    canReadStates: boolean;
    backHref: string;
    projectName?: string | null;
  };
  let { detail, canReadStates, backHref, projectName = null }: Props = $props();

  const STACK_TYPE = 'pulumi:pulumi:Stack';
  const resources = $derived(detail.resources ?? []);
  const byAddress = $derived(new Map(resources.map((r) => [r.address, r])));

  let tab = $state('resources');
  let query = $state('');
  let typeFilter = $state('');
  let providerFilter = $state('');
  let protectedOnly = $state(false);
  let collapsed = $state<Record<string, boolean>>({});
  let selected = $state<IacResourceView | null>(null);
  let drawerOpen = $state(false);
  let drawerTab = $state('inputs');
  let refreshing = $state(false);

  const types = $derived([...new Set(resources.map((r) => r.type))].sort());
  const providers = $derived(
    [
      ...new Set(resources.map((r) => r.providerType).filter((p): p is string => Boolean(p))),
    ].sort(),
  );
  const filtering = $derived(
    Boolean(query.trim() || typeFilter || providerFilter || protectedOnly),
  );

  const matches = (resource: IacResourceView) => {
    const q = query.trim().toLowerCase();
    return (
      (!q ||
        resource.name.toLowerCase().includes(q) ||
        resource.type.toLowerCase().includes(q) ||
        (resource.externalId ?? '').toLowerCase().includes(q)) &&
      (!typeFilter || resource.type === typeFilter) &&
      (!providerFilter || resource.providerType === providerFilter) &&
      (!protectedOnly || resource.flags.protect)
    );
  };

  // tree by parent; filtered views are a flat list of the matches
  const children = $derived.by(() => {
    const map = new Map<string | null, IacResourceView[]>();
    for (const resource of resources) {
      const parent = resource.parent && byAddress.has(resource.parent) ? resource.parent : null;
      map.set(parent, [...(map.get(parent) ?? []), resource]);
    }
    return map;
  });
  const rows = $derived.by(() => {
    if (filtering) return resources.filter(matches).map((resource) => ({ resource, depth: 0 }));
    const out: { resource: IacResourceView; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const resource of children.get(parent) ?? []) {
        out.push({ resource, depth });
        if (!collapsed[resource.address]) walk(resource.address, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  });
  const outputs = $derived(Object.entries(detail.outputs ?? {}));

  function select(address: string) {
    const resource = byAddress.get(address);
    if (!resource) return;
    selected = resource;
    drawerTab = 'inputs';
    drawerOpen = true;
  }

  async function refresh() {
    refreshing = true;
    await refreshStacks(new URL(page.url.href));
    refreshing = false;
  }

  const date = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');
  const summary = $derived(detail.summary);
</script>

<div class="space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <a href={backHref} class="text-xs text-fg-subtle hover:text-fg"
        >← {$_('stateIac.detail.back')}</a
      >
      <h1
        class="mt-1 flex flex-wrap items-center gap-2 font-mono text-2xl font-semibold text-white"
      >
        {summary.ref.stack}
        {#if summary.lock}
          <span class="k-badge k-badge-warn h-6 gap-1 px-2 font-sans text-xs"
            ><Lock class="h-3.5 w-3.5" />{$_('stateIac.stacks.locked')}</span
          >
        {/if}
      </h1>
      <p class="mt-1 text-sm text-fg-muted">
        <span class="font-mono"
          >{summary.ref.project ?? $_('stateIac.projects.unknownProject')}</span
        >
        · {detail.backend.name}
        <span class="font-mono text-xs text-fg-subtle">{detail.backend.location}</span>
        {#if projectName}· {$_('stateIac.stacks.assignedTo', {
            values: { project: projectName },
          })}{/if}
      </p>
    </div>
    <button type="button" class="k-btn k-btn-secondary" onclick={refresh} disabled={refreshing}>
      <RefreshCw class="h-4 w-4 {refreshing ? 'animate-spin' : ''}" />
      {$_('stateIac.stacks.refresh')}
    </button>
  </header>

  <dl class="grid gap-3 sm:grid-cols-4">
    <div class="k-card p-4">
      <dt class="text-xs text-fg-subtle">{$_('stateIac.stacks.resources')}</dt>
      <dd class="mt-1 text-xl font-semibold text-white">{summary.resourceCount}</dd>
    </div>
    <div class="k-card p-4">
      <dt class="text-xs text-fg-subtle">{$_('stateIac.stacks.lastUpdate')}</dt>
      <dd class="mt-1 text-sm text-white">
        {#if summary.lastUpdate}
          {$_(`stateIac.kinds.${summary.lastUpdate.kind}`)} · {$_(
            `stateIac.results.${summary.lastUpdate.result}`,
          )}
          <span class="block text-xs text-fg-subtle">{date(summary.lastUpdate.endedAt)}</span>
        {:else}
          {date(summary.updatedAt)}
        {/if}
      </dd>
    </div>
    <div class="k-card p-4">
      <dt class="text-xs text-fg-subtle">{$_('stateIac.detail.toolVersion')}</dt>
      <dd class="mt-1 font-mono text-sm text-white">{summary.toolVersion ?? '—'}</dd>
    </div>
    <div class="k-card p-4">
      <dt class="text-xs text-fg-subtle">{$_('stateIac.detail.pendingOperations')}</dt>
      <dd
        class="mt-1 text-xl font-semibold {summary.pendingOperations > 0
          ? 'text-warn'
          : 'text-white'}"
      >
        {summary.pendingOperations}
      </dd>
    </div>
  </dl>

  {#if summary.error}
    <p class="k-card border-danger/30 px-4 py-3 text-sm text-red-300" role="alert">
      {$_(`stateIac.errors.${summary.error}`)}
    </p>
  {:else if !canReadStates}
    <p
      class="k-card border-dashed px-4 py-6 text-center text-sm text-fg-muted"
      data-testid="states-forbidden"
    >
      {$_('stateIac.detail.noStatesPermission')}
    </p>
  {:else}
    <Tabs
      label={$_('stateIac.detail.tabs')}
      bind:value={tab}
      idPrefix="stack"
      items={[
        { value: 'resources', label: $_('stateIac.stacks.resources'), count: resources.length },
        { value: 'outputs', label: $_('stateIac.detail.outputs'), count: outputs.length },
      ]}
    />

    {#if tab === 'resources'}
      <div
        class="flex flex-wrap items-center gap-2"
        role="tabpanel"
        id="stack-panel-resources"
        aria-labelledby="stack-tab-resources"
      >
        <input
          class="k-input h-9 min-w-48 flex-1"
          type="search"
          placeholder={$_('stateIac.detail.searchResources')}
          aria-label={$_('stateIac.detail.searchResources')}
          bind:value={query}
        />
        <select
          class="k-input h-9 w-auto max-w-72"
          bind:value={typeFilter}
          aria-label={$_('stateIac.detail.type')}
        >
          <option value="">{$_('stateIac.detail.allTypes')}</option>
          {#each types as type (type)}<option value={type}>{type}</option>{/each}
        </select>
        <select
          class="k-input h-9 w-auto"
          bind:value={providerFilter}
          aria-label={$_('stateIac.detail.provider')}
        >
          <option value="">{$_('stateIac.detail.allProviders')}</option>
          {#each providers as provider (provider)}<option value={provider}>{provider}</option
            >{/each}
        </select>
        <label class="flex items-center gap-2 text-xs text-fg-muted">
          <input type="checkbox" class="k-checkbox" bind:checked={protectedOnly} />
          {$_('stateIac.detail.protectedOnly')}
        </label>
      </div>

      <ul class="k-card divide-y divide-white/5 overflow-hidden" data-testid="resource-tree">
        {#each rows as { resource, depth } (resource.address)}
          {@const hasChildren = !filtering && (children.get(resource.address)?.length ?? 0) > 0}
          <li
            class="flex items-center gap-2 px-3 py-2 text-sm"
            style="padding-left: {0.75 + depth * 1.25}rem"
          >
            {#if hasChildren}
              <button
                type="button"
                class="k-btn k-btn-ghost k-btn-icon h-6 w-6"
                aria-label={collapsed[resource.address]
                  ? $_('stateIac.detail.expand')
                  : $_('stateIac.detail.collapse')}
                aria-expanded={!collapsed[resource.address]}
                onclick={() => (collapsed[resource.address] = !collapsed[resource.address])}
              >
                {#if collapsed[resource.address]}<ChevronRight class="h-4 w-4" />{:else}<ChevronDown
                    class="h-4 w-4"
                  />{/if}
              </button>
            {:else}
              <span class="w-6"></span>
            {/if}
            {#if resource.managed}<Box class="h-4 w-4 shrink-0 text-brand-400" />{:else}<Boxes
                class="h-4 w-4 shrink-0 text-fg-subtle"
              />{/if}
            <button
              type="button"
              class="min-w-0 flex-1 truncate text-left hover:text-brand-400"
              onclick={() => select(resource.address)}
            >
              <span class="font-medium text-white">{resource.name}</span>
              <span class="ml-2 font-mono text-xs text-fg-subtle"
                >{resource.type === STACK_TYPE ? 'stack' : resource.type}</span
              >
            </button>
            {#if resource.flags.protect}
              <span
                class="k-badge h-5 gap-1 px-1.5 text-[10px]"
                title={$_('stateIac.detail.protected')}><Shield class="h-3 w-3" />protect</span
              >
            {/if}
            {#if resource.flags.pendingReplacement || resource.flags.pendingDelete}
              <span class="k-badge k-badge-warn h-5 px-1.5 text-[10px]"
                >{$_('stateIac.detail.pendingChange')}</span
              >
            {/if}
          </li>
        {:else}
          <li class="px-4 py-6 text-center text-sm text-fg-muted">
            {$_('stateIac.detail.noResources')}
          </li>
        {/each}
      </ul>
    {:else}
      <div
        class="k-card p-4 font-mono text-xs"
        role="tabpanel"
        id="stack-panel-outputs"
        aria-labelledby="stack-tab-outputs"
        data-testid="stack-outputs"
      >
        {#if outputs.length === 0}
          <p class="font-sans text-sm text-fg-muted">{$_('stateIac.detail.noOutputs')}</p>
        {:else}
          <dl class="space-y-2">
            {#each outputs as [name, value] (name)}
              <div class="grid gap-1 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                <dt class="truncate text-fg-muted">{name}</dt>
                <dd class="min-w-0"><IacValue {value} onselect={select} /></dd>
              </div>
            {/each}
          </dl>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<Drawer
  bind:open={drawerOpen}
  size="lg"
  title={selected?.name ?? ''}
  description={selected?.type ?? ''}
>
  {#if selected}
    <div class="space-y-4 text-sm">
      <dl class="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt class="text-fg-subtle">URN</dt>
        <dd class="break-all font-mono text-fg">{selected.address}</dd>
        <dt class="text-fg-subtle">ID</dt>
        <dd class="break-all font-mono text-fg">{selected.externalId ?? '—'}</dd>
        <dt class="text-fg-subtle">{$_('stateIac.detail.provider')}</dt>
        <dd class="break-all font-mono text-fg">{selected.provider?.split('::').at(-1) ?? '—'}</dd>
        {#if selected.parent}
          <dt class="text-fg-subtle">{$_('stateIac.detail.parent')}</dt>
          <dd>
            <button
              type="button"
              class="font-mono text-brand-400 hover:underline"
              onclick={() => select(selected!.parent!)}>{selected.parent.split('::').at(-1)}</button
            >
          </dd>
        {/if}
        <dt class="text-fg-subtle">{$_('stateIac.detail.modified')}</dt>
        <dd class="text-fg">{date(selected.modifiedAt)}</dd>
      </dl>

      <Tabs
        label={$_('stateIac.detail.resourceTabs')}
        variant="segmented"
        size="sm"
        bind:value={drawerTab}
        idPrefix="resource"
        items={[
          {
            value: 'inputs',
            label: $_('stateIac.detail.inputs'),
            count: Object.keys(selected.inputs).length,
          },
          {
            value: 'outputs',
            label: $_('stateIac.detail.outputs'),
            count: Object.keys(selected.outputs).length,
          },
          {
            value: 'dependencies',
            label: $_('stateIac.detail.dependencies'),
            count: selected.dependencies.length,
          },
        ]}
      />
      <div
        class="font-mono text-xs"
        role="tabpanel"
        id="resource-panel-{drawerTab}"
        aria-labelledby="resource-tab-{drawerTab}"
      >
        {#if drawerTab === 'dependencies'}
          {#if selected.dependencies.length === 0}
            <p class="font-sans text-fg-muted">—</p>
          {:else}
            <ul class="space-y-1">
              {#each selected.dependencies as dependency (dependency)}
                <li>
                  <button
                    type="button"
                    class="text-brand-400 hover:underline"
                    onclick={() => select(dependency)}>{dependency.split('::').at(-1)}</button
                  >
                  <span class="text-fg-subtle">{dependency.split('::').at(-2)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        {:else}
          <IacValue
            value={drawerTab === 'inputs' ? selected.inputs : selected.outputs}
            onselect={select}
          />
        {/if}
      </div>
    </div>
  {/if}
</Drawer>
