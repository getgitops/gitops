<script lang="ts">
  import { ExternalLink, Eye, Search, X } from '@lucide/svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { diffListItems, summarizeChange, type EntityRowChange } from './audit-summary';
  import AuditFieldValue from './AuditFieldValue.svelte';

  type AuditAction = 'insert' | 'update' | 'delete' | 'other';

  type AuditEvent = {
    commitHash: string;
    timestamp: string;
    author: string;
    entity: string | null;
    action: AuditAction;
    reason: string;
    message: string;
  };

  export let events: AuditEvent[] = [];
  export let title = 'Audit Log';
  export let description = 'History of changes recorded in the data repository.';
  /** Form action (in the current route's +page.server.ts) that returns the row-level diff. */
  export let diffAction = '?/viewDiff';
  /** Repo web URL (no trailing slash) used to build "View commit" links; null hides the button. */
  export let commitBaseUrl: string | null = null;

  let searchQuery = '';

  $: filteredEvents = events.filter((event) => {
    const query = searchQuery.trim().toLowerCase();
    return (
      !query ||
      (event.entity ?? '').toLowerCase().includes(query) ||
      event.action.toLowerCase().includes(query) ||
      event.reason.toLowerCase().includes(query) ||
      event.author.toLowerCase().includes(query) ||
      event.commitHash.toLowerCase().includes(query)
    );
  });

  const actionStyles: Record<AuditAction, string> = {
    insert: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    update: 'bg-amber-50 text-amber-700 border-amber-200',
    delete: 'bg-red-50 text-red-700 border-red-200',
    other: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  function formatDate(value: string) {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }

  let diffModalEvent: AuditEvent | null = null;
  let diffLoading = false;
  let diffError = '';
  let diffChanges: EntityRowChange[] = [];

  function submitDiff(event: AuditEvent): SubmitFunction {
    return () => {
      diffModalEvent = event;
      diffError = '';
      diffChanges = [];
      diffLoading = true;

      return async ({ result }) => {
        diffLoading = false;

        if (result.type === 'success' && result.data?.success) {
          diffChanges = (result.data.changes as EntityRowChange[]) ?? [];
          return;
        }

        diffError =
          result.type === 'failure' && result.data?.error
            ? String(result.data.error)
            : 'Failed to load changes.';
      };
    };
  }

  function closeDiff() {
    diffModalEvent = null;
    diffChanges = [];
    diffError = '';
  }
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<div class="space-y-6">
  <section>
    <h3 class="text-xl font-semibold text-slate-900">{title}</h3>
    <p class="mt-2 text-sm text-slate-600">{description}</p>
  </section>

  <section class="flex flex-col gap-3 sm:flex-row sm:items-center">
    <div class="relative flex-1">
      <Search
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search by entity, action, author or commit..."
        class="field-input w-full rounded-md border py-2 pl-9 pr-3 text-sm outline-none transition"
      />
    </div>
  </section>

  {#if filteredEvents.length === 0}
    <div
      class="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600"
    >
      {events.length === 0 ? 'No audit events found.' : 'No audit events match your search.'}
    </div>
  {:else}
    <div class="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div class="overflow-x-auto">
        <table class="w-full min-w-160 text-sm">
          <thead>
            <tr
              class="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              <th class="px-4 py-3">Date</th>
              <th class="px-4 py-3">Action</th>
              <th class="px-4 py-3">Entity</th>
              <th class="px-4 py-3">Author</th>
              <th class="px-4 py-3">Commit</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredEvents as event (event.commitHash + event.reason)}
              <tr class="border-t border-slate-100">
                <td class="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(event.timestamp)}</td>
                <td class="px-4 py-3">
                  <span
                    class={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${actionStyles[event.action]}`}
                  >
                    {event.action}
                  </span>
                </td>
                <td class="px-4 py-3 font-medium text-slate-900">{event.entity ?? '-'}</td>
                <td class="px-4 py-3 text-slate-600">{event.author}</td>
                <td class="px-4 py-3 font-mono text-xs text-slate-500">{event.commitHash.slice(0, 7)}</td>
                <td class="px-4 py-3 text-right">
                  <div class="flex items-center justify-end gap-2">
                    {#if commitBaseUrl}
                      <a
                        href={`${commitBaseUrl}/commit/${event.commitHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="btn-secondary inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium"
                        title="View commit in repository"
                      >
                        <ExternalLink class="h-3.5 w-3.5" />
                        Commit
                      </a>
                    {/if}
                    {#if event.entity}
                      <form method="POST" action={diffAction} use:enhance={submitDiff(event)}>
                        <input type="hidden" name="commit" value={event.commitHash} />
                        <input type="hidden" name="entity" value={event.entity} />
                        <button
                          type="submit"
                          class="btn-secondary inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium"
                        >
                          <Eye class="h-3.5 w-3.5" />
                          View changes
                        </button>
                      </form>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

{#if diffModalEvent}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={closeDiff}
    aria-label="Close changes modal"
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Audit change details"
    >
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h5 class="text-sm font-semibold text-slate-900">Detalle del cambio</h5>
          <p class="mt-0.5 text-xs text-slate-500">
            {formatDate(diffModalEvent.timestamp)} por {diffModalEvent.author} · {diffModalEvent.commitHash.slice(0, 7)}
          </p>
        </div>
        <button
          type="button"
          on:click={closeDiff}
          class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
          aria-label="Close"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="overflow-y-auto px-4 py-4">
        {#if diffLoading}
          <p class="text-sm text-slate-500">Loading changes...</p>
        {:else if diffError}
          <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {diffError}
          </div>
        {:else if diffChanges.length === 0}
          <p class="text-sm text-slate-500">No se detectaron cambios.</p>
        {:else}
          <div class="space-y-4">
            {#each diffChanges as change}
              {@const summary = summarizeChange(diffModalEvent.entity ?? '', change)}
              <div
                class={`rounded-md border p-3 ${
                  change.type === 'added'
                    ? 'border-emerald-200 bg-emerald-50'
                    : change.type === 'removed'
                      ? 'border-red-200 bg-red-50'
                      : 'border-amber-200 bg-amber-50'
                }`}
              >
                <p class="text-sm font-medium text-slate-900">{summary.title}</p>

                {#if summary.fields.length}
                  <dl class="mt-2 space-y-2">
                    {#each summary.fields as field}
                      <div class="text-xs">
                        <dt class="mb-1 font-medium text-slate-600">{field.label}</dt>
                        <dd>
                          {#if change.type === 'modified'}
                            {#if field.before?.kind === 'text' && field.after?.kind === 'text'}
                              <AuditFieldValue value={field.before} tone="before" />
                              <span class="mx-1 text-slate-400">→</span>
                              <AuditFieldValue value={field.after} tone="after" />
                            {:else if field.before?.kind === 'list' && field.after?.kind === 'list'}
                              <div class="flex flex-wrap gap-1.5">
                                {#each diffListItems(field.before.items, field.after.items) as entry}
                                  {@const [scope, action] = entry.item.split(':')}
                                  <span
                                    class={`inline-flex items-center overflow-hidden rounded-full border text-[11px] font-medium ${
                                      entry.status === 'added'
                                        ? 'border-emerald-200'
                                        : entry.status === 'removed'
                                          ? 'border-red-200 line-through'
                                          : 'border-slate-200'
                                    }`}
                                  >
                                    {#if entry.status !== 'unchanged'}
                                      <span
                                        class={`px-1.5 py-0.5 ${entry.status === 'added' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}
                                        >{entry.status === 'added' ? '+' : '−'}</span
                                      >
                                    {/if}
                                    {#if action}
                                      <span
                                        class={`px-2 py-0.5 ${entry.status === 'unchanged' ? 'bg-slate-50 text-slate-600' : 'bg-white text-slate-700'}`}
                                        >{scope}</span
                                      >
                                      <span
                                        class={`px-2 py-0.5 ${entry.status === 'unchanged' ? 'bg-slate-100 text-slate-500' : 'bg-slate-50 text-slate-500'}`}
                                        >{action}</span
                                      >
                                    {:else}
                                      <span class="px-2 py-0.5 text-slate-700">{entry.item}</span>
                                    {/if}
                                  </span>
                                {/each}
                              </div>
                            {:else}
                              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <div>
                                  <p class="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                    Antes
                                  </p>
                                  <AuditFieldValue value={field.before} />
                                </div>
                                <div>
                                  <p class="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                    Después
                                  </p>
                                  <AuditFieldValue value={field.after} />
                                </div>
                              </div>
                            {/if}
                          {:else}
                            <AuditFieldValue value={field.before ?? field.after} />
                          {/if}
                        </dd>
                      </div>
                    {/each}
                  </dl>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

