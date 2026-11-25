<!--
  Qué cambió entre dos versiones del estado. Por defecto, el último update frente al anterior.
  Los secretos se comparan sin revelarse; los recursos que solo cambiaron de provider (una subida de
  versión del provider los toca todos) se agrupan en una sola línea.
-->
<script lang="ts">
  import { ChevronDown, ChevronRight, Info, LoaderCircle, Lock } from '@lucide/svelte';
  import { toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';
  import type { DiffOutcomeView, IacSnapshotSourceView } from '#lib/state-iac/types';
  import IacValue from './IacValue.svelte';

  type Props = {
    apiBase: string;
    scopeQuery: string;
    /** Versión de destino pedida desde el historial (`history:<id>`). */
    to?: string | null;
    /** `resourceChanges` del último update, para cuando no hay nada que comparar. */
    lastChanges?: Record<string, number> | null;
  };
  let { apiBase, scopeQuery, to = null, lastChanges = null }: Props = $props();

  let outcome = $state<DiffOutcomeView | null>(null);
  let loading = $state(false);
  let fromId = $state<string | null>(null);
  let toId = $state<string | null>(null);
  let open = $state<Record<string, boolean>>({});
  let showProviderOnly = $state(false);

  async function load(from: string | null, target: string | null) {
    loading = true;
    try {
      const params = new URLSearchParams(scopeQuery);
      if (from) params.set('from', from);
      if (target) params.set('to', target);
      const response = await fetch(`${apiBase}/diff?${params}`);
      if (!response.ok) throw new Error(String(response.status));
      outcome = (await response.json()) as DiffOutcomeView;
      fromId = outcome.from;
      toId = outcome.to;
    } catch {
      toast.error($_('stateIac.diff.loadFailed'));
    } finally {
      loading = false;
    }
  }

  // a version picked in the history: compare it with the one before it
  $effect(() => {
    const target = to;
    if (!target) {
      void load(null, null);
      return;
    }
    void load(null, target);
  });

  function previousOf(id: string, sources: IacSnapshotSourceView[]) {
    const index = sources.findIndex((s) => s.id === id);
    return (
      sources.slice(index + 1).find((s) => s.source === 'history')?.id ??
      sources[index + 1]?.id ??
      null
    );
  }

  function label(source: IacSnapshotSourceView) {
    const when = source.takenAt ? new Date(source.takenAt).toLocaleString() : '';
    return `${$_(`stateIac.diff.sources.${source.source}`)}${when ? ` · ${when}` : ''}`;
  }

  const diff = $derived(outcome?.diff ?? null);
  const changes = $derived(diff ? diff.resources.filter((r) => !r.providerOnly) : []);
  const providerOnly = $derived(diff ? diff.resources.filter((r) => r.providerOnly) : []);
  const onlyCurrent = $derived(Boolean(outcome && outcome.sources.length <= 1));
  const SUMMARY = ['create', 'update', 'replace', 'delete'] as const;
  const tone: Record<string, string> = {
    create: 'k-badge-ok',
    replace: 'k-badge-warn',
    delete: 'k-badge-danger',
    update: 'k-badge-info',
  };
</script>

<div class="space-y-4" data-testid="stack-diff">
  {#if outcome && outcome.sources.length > 1}
    <div class="flex flex-wrap items-end gap-2">
      <label class="min-w-56 flex-1">
        <span class="k-label">{$_('stateIac.diff.from')}</span>
        <select
          class="k-input"
          value={fromId ?? ''}
          onchange={(e) => load(e.currentTarget.value, toId)}
        >
          {#each outcome.sources as source (source.id)}
            <option value={source.id} disabled={source.id === toId}>{label(source)}</option>
          {/each}
        </select>
      </label>
      <label class="min-w-56 flex-1">
        <span class="k-label">{$_('stateIac.diff.to')}</span>
        <select
          class="k-input"
          value={toId ?? ''}
          onchange={(e) => {
            const target = e.currentTarget.value;
            void load(previousOf(target, outcome!.sources), target);
          }}
        >
          {#each outcome.sources as source (source.id)}
            <option value={source.id}>{label(source)}</option>
          {/each}
        </select>
      </label>
      {#if loading}<LoaderCircle class="mb-2 h-4 w-4 animate-spin text-fg-subtle" />{/if}
    </div>
  {/if}

  {#if !outcome && loading}
    <p class="text-sm text-fg-subtle">{$_('stateIac.diff.loading')}</p>
  {:else if outcome && !diff}
    <div class="k-card space-y-2 p-4 text-sm" data-testid="diff-unavailable">
      <p class="flex items-start gap-2 text-fg-muted">
        <Info class="mt-0.5 h-4 w-4 shrink-0" />
        {onlyCurrent ? $_('stateIac.diff.noSources') : $_('stateIac.diff.unavailable')}
      </p>
      {#if lastChanges && Object.keys(lastChanges).length > 0}
        <p class="flex flex-wrap gap-1">
          <span class="text-xs text-fg-subtle">{$_('stateIac.diff.lastUpdateChanges')}</span>
          {#each Object.entries(lastChanges) as [key, count] (key)}
            <span class="k-badge h-5 px-1.5 text-[10px]"
              >{$_(`stateIac.changes.${key}`)} {count}</span
            >
          {/each}
        </p>
      {/if}
    </div>
  {:else if diff}
    <p class="flex flex-wrap gap-1.5" data-testid="diff-summary">
      {#each SUMMARY as key (key)}
        <span class="k-badge h-6 px-2 text-xs {diff.summary[key] ? tone[key] : ''}">
          {$_(`stateIac.changes.${key}`)}
          {diff.summary[key]}
        </span>
      {/each}
      <span class="k-badge h-6 px-2 text-xs">{$_('stateIac.changes.same')} {diff.summary.same}</span
      >
    </p>
    <p class="flex items-start gap-1.5 text-xs text-fg-subtle">
      <Lock class="mt-0.5 h-3.5 w-3.5 shrink-0" />{$_('stateIac.diff.secretsNotice')}
    </p>

    {#if changes.length === 0 && providerOnly.length === 0 && diff.outputs.length === 0}
      <p class="k-card border-dashed px-4 py-6 text-center text-sm text-fg-muted">
        {$_('stateIac.diff.noChanges')}
      </p>
    {/if}

    {#if changes.length > 0}
      <ul class="k-card divide-y divide-white/5 overflow-hidden" data-testid="diff-resources">
        {#each changes as resource (resource.address)}
          {@const expandable = resource.fields.length > 0}
          <li data-change={resource.change} data-resource={resource.name}>
            <button
              type="button"
              class="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm disabled:cursor-default"
              disabled={!expandable}
              aria-expanded={expandable ? Boolean(open[resource.address]) : undefined}
              onclick={() => (open[resource.address] = !open[resource.address])}
            >
              {#if expandable}
                {#if open[resource.address]}<ChevronDown class="h-4 w-4" />{:else}<ChevronRight
                    class="h-4 w-4"
                  />{/if}
              {:else}<span class="w-4"></span>{/if}
              <span class="k-badge h-5 px-1.5 text-[10px] {tone[resource.change]}"
                >{$_(`stateIac.changes.${resource.change}`)}</span
              >
              <span class="font-medium text-white">{resource.name}</span>
              <span class="truncate font-mono text-xs text-fg-subtle">{resource.type}</span>
              {#if expandable}<span class="ml-auto text-xs text-fg-subtle"
                  >{$_('stateIac.diff.fields', { values: { count: resource.fields.length } })}</span
                >{/if}
            </button>
            {#if open[resource.address]}
              <div class="overflow-x-auto px-4 pb-3">
                <table class="w-full font-mono text-xs">
                  <thead class="text-left text-fg-subtle">
                    <tr>
                      <th class="py-1 pr-3 font-medium">{$_('stateIac.diff.property')}</th>
                      <th class="py-1 pr-3 font-medium">{$_('stateIac.diff.before')}</th>
                      <th class="py-1 font-medium">{$_('stateIac.diff.after')}</th>
                    </tr>
                  </thead>
                  <tbody class="align-top">
                    {#each resource.fields as field (field.path)}
                      <tr class="border-t border-white/5">
                        <td class="py-1.5 pr-3 text-fg-muted">{field.path}</td>
                        <td class="py-1.5 pr-3 text-red-300/90">
                          {#if field.before === undefined}<span class="text-fg-subtle">—</span
                            >{:else}<IacValue value={field.before} />{/if}
                        </td>
                        <td class="py-1.5 text-emerald-300/90">
                          {#if field.after === undefined}<span class="text-fg-subtle">—</span
                            >{:else}<IacValue value={field.after} />{/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if providerOnly.length > 0}
      <div class="k-card p-4 text-sm">
        <button
          type="button"
          class="flex items-center gap-2 text-fg-muted hover:text-fg"
          aria-expanded={showProviderOnly}
          onclick={() => (showProviderOnly = !showProviderOnly)}
        >
          {#if showProviderOnly}<ChevronDown class="h-4 w-4" />{:else}<ChevronRight
              class="h-4 w-4"
            />{/if}
          {$_('stateIac.diff.providerOnly', { values: { count: providerOnly.length } })}
        </button>
        {#if showProviderOnly}
          <ul class="mt-2 space-y-0.5 pl-6 font-mono text-xs text-fg-subtle">
            {#each providerOnly as resource (resource.address)}<li>{resource.name}</li>{/each}
          </ul>
        {/if}
      </div>
    {/if}

    {#if diff.outputs.length > 0}
      <div class="k-card p-4">
        <h3 class="text-sm font-semibold text-white">{$_('stateIac.diff.outputs')}</h3>
        <table class="mt-2 w-full font-mono text-xs">
          <tbody class="align-top">
            {#each diff.outputs as field (field.path)}
              <tr class="border-t border-white/5">
                <td class="py-1.5 pr-3 text-fg-muted">{field.path}</td>
                <td class="py-1.5 pr-3 text-red-300/90"
                  >{#if field.before === undefined}—{:else}<IacValue
                      value={field.before}
                    />{/if}</td
                >
                <td class="py-1.5 text-emerald-300/90"
                  >{#if field.after === undefined}—{:else}<IacValue value={field.after} />{/if}</td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>
