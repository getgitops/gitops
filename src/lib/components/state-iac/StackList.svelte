<!--
  Stacks agrupados por backend → proyecto de Pulumi, con buscador y "Refrescar". Lo usan la vista
  de proyecto (solo sus stacks asignados) y la de organización (todos, con el proyecto asignado).
-->
<script lang="ts">
  import { refreshStacks } from '#lib/state-iac/refresh';
  import { page } from '$app/state';
  import {
    AlertTriangle,
    CircleCheck,
    CircleX,
    Cloud,
    Layers,
    LoaderCircle,
    Lock,
    RefreshCw,
    Search,
  } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import { stackPath, type BackendStacksView, type StackSummaryView } from '#lib/state-iac/types';

  type Props = {
    groups: BackendStacksView[];
    /** Base de los enlaces de detalle (`…/state-iac`). */
    base: string;
    /** Vista de organización: columna "Proyecto asignado". */
    projectNames?: Record<string, string> | null;
  };
  let { groups, base, projectNames = null }: Props = $props();

  let query = $state('');
  let refreshing = $state(false);

  const matches = (stack: StackSummaryView, backendName: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [stack.ref.stack, stack.ref.project ?? '', backendName]
      .concat(
        projectNames && stack.assignedProjectId
          ? [projectNames[stack.assignedProjectId] ?? '']
          : [],
      )
      .some((text) => text.toLowerCase().includes(q));
  };

  // backend → Pulumi project → stacks, with the search applied
  const view = $derived(
    groups.map((group) => {
      const byProject = new Map<string, StackSummaryView[]>();
      for (const stack of group.stacks) {
        if (!matches(stack, group.backend.name)) continue;
        const key = stack.ref.project ?? '';
        byProject.set(key, [...(byProject.get(key) ?? []), stack]);
      }
      return { group, projects: [...byProject.entries()] };
    }),
  );
  const total = $derived(groups.reduce((sum, group) => sum + group.stacks.length, 0));

  async function refresh() {
    refreshing = true;
    await refreshStacks(new URL(page.url.href));
    refreshing = false;
  }

  function relative(value: string | null) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  }

  function errorText(code: string) {
    const key = `stateIac.errors.${code}`;
    const text = $_(key);
    return text === key ? $_('stateIac.errors.unknown') : text;
  }
</script>

<div class="space-y-4">
  <div class="flex flex-wrap items-center gap-2">
    <div class="relative min-w-56 flex-1">
      <Search
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
      />
      <input
        class="k-input h-9 pl-9"
        type="search"
        placeholder={$_('stateIac.stacks.search')}
        aria-label={$_('stateIac.stacks.search')}
        bind:value={query}
      />
    </div>
    <button type="button" class="k-btn k-btn-secondary" onclick={refresh} disabled={refreshing}>
      {#if refreshing}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<RefreshCw
          class="h-4 w-4"
        />{/if}
      {$_('stateIac.stacks.refresh')}
    </button>
  </div>

  {#each view as { group, projects } (group.backend.id)}
    <section
      class="k-card overflow-hidden"
      data-testid="stack-backend"
      data-backend-id={group.backend.id}
    >
      <header class="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-3">
        <Cloud class="h-4 w-4 text-brand-400" />
        <h2 class="text-sm font-semibold text-white">{group.backend.name}</h2>
        <span class="truncate font-mono text-xs text-fg-subtle">{group.backend.location}</span>
      </header>

      {#if group.error}
        <p class="flex items-start gap-2 px-4 py-3 text-xs text-red-300" role="alert">
          <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
          {$_('stateIac.stacks.backendFailed', { values: { error: errorText(group.error) } })}
        </p>
      {:else if projects.length === 0}
        <p class="px-4 py-3 text-xs text-fg-subtle">
          {query ? $_('stateIac.stacks.noMatches') : $_('stateIac.stacks.backendEmpty')}
        </p>
      {:else}
        {#each projects as [project, stacks] (project)}
          <div class="border-b border-white/5 last:border-b-0">
            <p class="flex items-center gap-2 px-4 pt-3 text-xs font-medium text-fg-muted">
              <Layers class="h-3.5 w-3.5" />
              <span class="font-mono">{project || $_('stateIac.projects.unknownProject')}</span>
            </p>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead class="text-xs text-fg-subtle">
                  <tr>
                    <th class="px-4 py-2 font-medium">{$_('stateIac.stacks.stack')}</th>
                    <th class="px-4 py-2 font-medium">{$_('stateIac.stacks.resources')}</th>
                    <th class="px-4 py-2 font-medium">{$_('stateIac.stacks.lastUpdate')}</th>
                    {#if projectNames}
                      <th class="px-4 py-2 font-medium">{$_('stateIac.stacks.assignedProject')}</th>
                    {/if}
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                  {#each stacks as stack (stack.ref.stack)}
                    <tr data-stack={`${stack.ref.project ?? '~'}/${stack.ref.stack}`}>
                      <td class="px-4 py-2.5">
                        <a
                          href={stackPath(base, stack.ref)}
                          class="font-mono text-sm font-medium text-white hover:text-brand-400"
                          >{stack.ref.stack}</a
                        >
                        <span class="ml-1 inline-flex flex-wrap gap-1 align-middle">
                          {#if stack.lock}
                            <span
                              class="k-badge k-badge-warn h-5 gap-1 px-1.5 text-[10px]"
                              title={$_('stateIac.stacks.lockedSince', {
                                values: { date: relative(stack.lock.since) },
                              })}><Lock class="h-3 w-3" />{$_('stateIac.stacks.locked')}</span
                            >
                          {/if}
                          {#if stack.pendingOperations > 0}
                            <span class="k-badge k-badge-warn h-5 px-1.5 text-[10px]"
                              >{$_('stateIac.stacks.pending', {
                                values: { count: stack.pendingOperations },
                              })}</span
                            >
                          {/if}
                          {#if stack.error}
                            <span class="k-badge k-badge-danger h-5 px-1.5 text-[10px]"
                              >{errorText(stack.error)}</span
                            >
                          {/if}
                        </span>
                      </td>
                      <td class="px-4 py-2.5 text-fg-muted"
                        >{stack.error ? '—' : stack.resourceCount}</td
                      >
                      <td class="px-4 py-2.5 text-xs text-fg-muted">
                        {#if stack.lastUpdate}
                          <span class="inline-flex items-center gap-1">
                            {#if stack.lastUpdate.result === 'succeeded'}<CircleCheck
                                class="h-3.5 w-3.5 text-ok"
                              />{:else if stack.lastUpdate.result === 'failed'}<CircleX
                                class="h-3.5 w-3.5 text-danger"
                              />{/if}
                            {$_(`stateIac.kinds.${stack.lastUpdate.kind}`)} · {relative(
                              stack.lastUpdate.endedAt ?? stack.lastUpdate.startedAt,
                            )}
                          </span>
                        {:else}
                          {relative(stack.updatedAt)}
                        {/if}
                      </td>
                      {#if projectNames}
                        <td class="px-4 py-2.5 text-xs">
                          {#if stack.assignedProjectId}
                            <span class="text-fg"
                              >{projectNames[stack.assignedProjectId] ?? '—'}</span
                            >
                          {:else}
                            <span class="text-fg-subtle"
                              >{$_('stateIac.projects.unassignedOption')}</span
                            >
                          {/if}
                        </td>
                      {/if}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/each}
      {/if}
      {#if group.truncated}
        <p class="k-help px-4 pb-3">{$_('stateIac.projects.truncated')}</p>
      {/if}
    </section>
  {/each}

  <p class="text-xs text-fg-subtle">{$_('stateIac.stacks.count', { values: { count: total } })}</p>
</div>
