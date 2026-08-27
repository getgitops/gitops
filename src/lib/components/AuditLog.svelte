<script lang="ts">
  import { ChevronLeft, ChevronRight, ExternalLink, Eye, Search, X } from '@lucide/svelte';
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
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

  type Pagination = { page: number; perPage: number; total: number; totalPages: number };

  export let events: AuditEvent[] = [];
  export let title = 'Audit Log';
  export let description = 'History of changes recorded in the data repository.';
  /** Form action (in the current route's +page.server.ts) that returns the row-level diff. */
  export let diffAction = '?/viewDiff';
  /** Repo web URL (no trailing slash) used to build "View commit" links; null hides the button. */
  export let commitBaseUrl: string | null = null;
  export let pagination: Pagination = { page: 1, perPage: 20, total: events.length, totalPages: 1 };
  /** Organizations for the filter dropdown; omit to hide it (e.g. on an already org-scoped page). */
  export let organizations: { id: string; name: string }[] | null = null;

  const PER_PAGE_OPTIONS = [10, 20, 50, 100];

  $: params = $page.url.searchParams;
  $: currentSearch = params.get('search') ?? '';
  $: currentFrom = params.get('from') ?? '';
  $: currentTo = params.get('to') ?? '';
  $: currentOrganizationId = params.get('organizationId') ?? '';
  $: hasActiveFilters = Boolean(currentSearch || currentFrom || currentTo || currentOrganizationId);

  function hrefWithParam(name: string, value: string): string {
    const next = new URLSearchParams(params);
    if (value) {
      next.set(name, value);
    } else {
      next.delete(name);
    }
    return `?${next.toString()}`;
  }

  type DatePreset = 'all' | 'today' | '7d' | '30d' | '3m' | 'custom';

  const DATE_PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
    { value: 'all', label: 'All time' },
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '3m', label: 'Last 3 months' },
    { value: 'custom', label: 'Custom range...' },
  ];

  function toLocalIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function presetRange(preset: DatePreset): { from: string; to: string } {
    const today = new Date();
    const to = toLocalIsoDate(today);

    if (preset === 'today') {
      return { from: to, to };
    }
    if (preset === '7d') {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: toLocalIsoDate(from), to };
    }
    if (preset === '30d') {
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { from: toLocalIsoDate(from), to };
    }
    if (preset === '3m') {
      const from = new Date(today);
      from.setMonth(from.getMonth() - 3);
      return { from: toLocalIsoDate(from), to };
    }
    return { from: '', to: '' };
  }

  $: selectedPreset = ((): DatePreset => {
    if (!currentFrom && !currentTo) return 'all';
    for (const preset of ['today', '7d', '30d', '3m'] as const) {
      const range = presetRange(preset);
      if (range.from === currentFrom && range.to === currentTo) return preset;
    }
    return 'custom';
  })();

  let showCustomRange = false;
  $: showCustomRange = selectedPreset === 'custom';

  function handlePresetChange(event: Event & { currentTarget: HTMLSelectElement }) {
    const preset = event.currentTarget.value as DatePreset;

    if (preset === 'custom') {
      showCustomRange = true;
      return;
    }

    showCustomRange = false;
    const range = presetRange(preset);
    const next = new URLSearchParams(params);
    next.delete('page');
    if (range.from) {
      next.set('from', range.from);
      next.set('to', range.to);
    } else {
      next.delete('from');
      next.delete('to');
    }
    window.location.href = `?${next.toString()}`;
  }

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

  <form method="GET" class="flex flex-col gap-3 lg:flex-row lg:items-center lg:flex-wrap">
    <div class="relative flex-1 lg:min-w-60">
      <Search
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
      <input
        type="text"
        name="search"
        value={currentSearch}
        placeholder="Search by entity, action, author or commit..."
        class="field-input w-full rounded-md border py-2 pl-9 pr-3 text-sm outline-none transition"
      />
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <select
        value={selectedPreset}
        on:change={handlePresetChange}
        class="field-input rounded-md border px-3 py-2 text-sm outline-none transition"
      >
        {#each DATE_PRESET_OPTIONS as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
      {#if showCustomRange}
        <input
          type="date"
          name="from"
          value={currentFrom}
          title="From date"
          class="field-input rounded-md border px-3 py-2 text-sm outline-none transition"
        />
        <span class="text-slate-400">–</span>
        <input
          type="date"
          name="to"
          value={currentTo}
          title="To date"
          class="field-input rounded-md border px-3 py-2 text-sm outline-none transition"
        />
      {:else}
        <input type="hidden" name="from" value={currentFrom} />
        <input type="hidden" name="to" value={currentTo} />
      {/if}
    </div>
    {#if organizations}
      <select
        name="organizationId"
        class="field-input rounded-md border px-3 py-2 text-sm outline-none transition"
      >
        <option value="">All organizations</option>
        {#each organizations as organization}
          <option value={organization.id} selected={organization.id === currentOrganizationId}>
            {organization.name}
          </option>
        {/each}
      </select>
    {/if}
    <input type="hidden" name="perPage" value={pagination.perPage} />
    <button type="submit" class="btn-primary rounded-md px-3 py-2 text-sm font-medium">Filter</button>
    {#if hasActiveFilters}
      <a href="?" class="btn-secondary rounded-md px-3 py-2 text-sm font-medium">Clear</a>
    {/if}
  </form>

  {#if events.length === 0}
    <div
      class="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600"
    >
      {hasActiveFilters ? 'No audit events match your filters.' : 'No audit events found.'}
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
            {#each events as event (event.commitHash + event.reason)}
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

      <div
        class="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-center gap-2">
          <span>
            {(pagination.page - 1) * pagination.perPage + 1}–{Math.min(
              pagination.page * pagination.perPage,
              pagination.total,
            )} of {pagination.total}
          </span>
          <select
            value={String(pagination.perPage)}
            on:change={(event) => {
              window.location.href = hrefWithParam('perPage', event.currentTarget.value);
            }}
            class="field-input rounded-md border px-2 py-1 text-xs outline-none transition"
          >
            {#each PER_PAGE_OPTIONS as size}
              <option value={String(size)}>{size} / page</option>
            {/each}
          </select>
        </div>

        <div class="flex items-center gap-2">
          {#if pagination.page > 1}
            <a
              href={hrefWithParam('page', String(pagination.page - 1))}
              class="btn-secondary inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium"
            >
              <ChevronLeft class="h-3.5 w-3.5" />
              Previous
            </a>
          {:else}
            <span
              class="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-300"
            >
              <ChevronLeft class="h-3.5 w-3.5" />
              Previous
            </span>
          {/if}

          <span class="text-xs text-slate-500">Page {pagination.page} of {pagination.totalPages}</span>

          {#if pagination.page < pagination.totalPages}
            <a
              href={hrefWithParam('page', String(pagination.page + 1))}
              class="btn-secondary inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium"
            >
              Next
              <ChevronRight class="h-3.5 w-3.5" />
            </a>
          {:else}
            <span
              class="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-300"
            >
              Next
              <ChevronRight class="h-3.5 w-3.5" />
            </span>
          {/if}
        </div>
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

