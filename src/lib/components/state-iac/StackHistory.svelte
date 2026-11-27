<!--
  Historial de updates de un stack (más reciente primero), paginado contra la API. Cada update con
  estado guardado permite ver qué cambió.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { CircleCheck, CircleX, GitCommitHorizontal, LoaderCircle, Clock } from '@lucide/svelte';
  import { toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';
  import StateIacSkeleton from './StateIacSkeleton.svelte';
  import type { IacHistoryPageView } from '#lib/state-iac/types';

  type Props = {
    /** `/api/state-iac/stacks/<backend>/<project>/<stack>` */
    apiBase: string;
    /** `projectId=…` o `organizationId=…` */
    scopeQuery: string;
    canDiff: boolean;
    onshowchanges?: (updateId: string) => void;
  };
  let { apiBase, scopeQuery, canDiff, onshowchanges }: Props = $props();

  let updates = $state<IacHistoryPageView['updates']>([]);
  let cursor = $state<string | null>(null);
  let loading = $state(false);
  let loaded = $state(false);

  async function load(next: string | null) {
    loading = true;
    try {
      const query = `${scopeQuery}&limit=20${next ? `&cursor=${next}` : ''}`;
      const response = await fetch(`${apiBase}/history?${query}`);
      if (!response.ok) throw new Error(String(response.status));
      const page = (await response.json()) as IacHistoryPageView;
      updates = next ? [...updates, ...page.updates] : page.updates;
      cursor = page.nextCursor;
      loaded = true;
    } catch {
      toast.error($_('stateIac.history.loadFailed'));
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load(null);
  });

  const date = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');
  function duration(start: string | null, end: string | null) {
    if (!start || !end) return null;
    const seconds = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000));
    return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  }
  const CHANGE_ORDER = ['create', 'update', 'replace', 'delete', 'import', 'same'];
</script>

<div class="space-y-3" data-testid="stack-history">
  {#if !loaded && loading}
    <StateIacSkeleton variant="rows" />
  {:else if loaded && updates.length === 0}
    <p class="k-card border-dashed px-4 py-6 text-center text-sm text-fg-muted">
      {$_('stateIac.history.empty')}
    </p>
  {:else}
    <ol class="space-y-2">
      {#each updates as update (update.id)}
        {@const took = duration(update.startedAt, update.endedAt)}
        <li class="k-card p-4" data-update-id={update.id}>
          <div class="flex flex-wrap items-start gap-3">
            {#if update.result === 'succeeded'}<CircleCheck
                class="mt-0.5 h-4 w-4 shrink-0 text-ok"
              />
            {:else if update.result === 'failed'}<CircleX
                class="mt-0.5 h-4 w-4 shrink-0 text-danger"
              />
            {:else}<Clock class="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />{/if}
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
                {$_(`stateIac.kinds.${update.kind}`)}
                <span
                  class="k-badge h-5 px-1.5 text-[10px] {update.result === 'failed'
                    ? 'k-badge-danger'
                    : update.result === 'succeeded'
                      ? 'k-badge-ok'
                      : ''}"
                >
                  {$_(`stateIac.results.${update.result}`)}
                </span>
                {#if update.message}<span class="truncate font-normal text-fg-muted"
                    >{update.message}</span
                  >{/if}
              </p>
              <p class="mt-1 text-xs text-fg-subtle">
                {date(update.startedAt)}{#if took}
                  · {$_('stateIac.history.took', { values: { duration: took } })}{/if}
                {#if update.toolVersion}
                  · Pulumi {update.toolVersion}{/if}
                {#if update.execKind}
                  · {update.execKind}{/if}
              </p>
              {#if update.vcs.commit || update.vcs.author}
                <p class="mt-1 flex flex-wrap items-center gap-1 text-xs text-fg-subtle">
                  <GitCommitHorizontal class="h-3.5 w-3.5" />
                  {#if update.vcs.commit}<span class="font-mono"
                      >{update.vcs.commit.slice(0, 8)}</span
                    >{/if}
                  {#if update.vcs.branch}<span>· {update.vcs.branch}</span>{/if}
                  {#if update.vcs.owner && update.vcs.repo}<span
                      >· {update.vcs.owner}/{update.vcs.repo}</span
                    >{/if}
                  {#if update.vcs.dirty}<span class="k-badge k-badge-warn h-4 px-1 text-[10px]"
                      >{$_('stateIac.history.dirty')}</span
                    >{/if}
                  {#if update.vcs.author}<span>· {update.vcs.author}</span>{/if}
                </p>
              {/if}
              <p class="mt-2 flex flex-wrap gap-1">
                {#each CHANGE_ORDER.filter((key) => update.changes[key]) as key (key)}
                  <span
                    class="k-badge h-5 px-1.5 text-[10px] {key === 'delete' || key === 'replace'
                      ? 'k-badge-warn'
                      : key === 'create'
                        ? 'k-badge-ok'
                        : ''}"
                  >
                    {$_(`stateIac.changes.${key}`)}
                    {update.changes[key]}
                  </span>
                {/each}
              </p>
            </div>
            {#if canDiff && update.snapshotAvailable}
              <button
                type="button"
                class="k-btn k-btn-ghost k-btn-sm"
                onclick={() => onshowchanges?.(update.id)}
              >
                {$_('stateIac.history.showChanges')}
              </button>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
    {#if cursor}
      <button
        type="button"
        class="k-btn k-btn-secondary w-full"
        disabled={loading}
        onclick={() => load(cursor)}
      >
        {#if loading}<LoaderCircle class="h-4 w-4 animate-spin" />{/if}
        {$_('stateIac.history.loadMore')}
      </button>
    {/if}
  {/if}
</div>
