<script lang="ts">
  import {
    CalendarClock,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Database,
    ExternalLink,
    Eye,
    GitCommit,
    LoaderCircle,
    Search,
    ScrollText,
    User,
  } from '@lucide/svelte';
  import { Drawer } from '#lib/components/ui';
  import { enhance } from '$app/forms';
  import { createPageStore } from '#lib/page-store';
  import type { SubmitFunction } from '$app/forms';
  import { diffListItems, summarizeChange, type EntityRowChange } from './audit-summary';
  import AuditFieldValue from './AuditFieldValue.svelte';
  import { _ } from '#lib/i18n';

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
  export let title = '';
  export let description = '';
  /** Form action (in the current route's +page.server.ts) that returns the row-level diff. */
  export let diffAction = '?/viewDiff';
  /** Repo web URL (no trailing slash) used to build "View commit" links; null hides the button. */
  export let commitBaseUrl: string | null = null;
  export let pagination: Pagination = { page: 1, perPage: 20, total: events.length, totalPages: 1 };
  /** Organizations for the filter dropdown; omit to hide it (e.g. on an already org-scoped page). */
  export let organizations: { id: string; name: string }[] | null = null;

  const PER_PAGE_OPTIONS = [10, 20, 50, 100];

  $: params = new URLSearchParams($page.url.searchParams.toString());
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

  $: DATE_PRESET_OPTIONS = [
    { value: 'all', label: $_('auditLog.allTime') },
    { value: 'today', label: $_('auditLog.today') },
    { value: '7d', label: $_('auditLog.last7Days') },
    { value: '30d', label: $_('auditLog.last30Days') },
    { value: '3m', label: $_('auditLog.last3Months') },
    { value: 'custom', label: $_('auditLog.customRange') },
  ];

  $: resolvedTitle = title || $_('auditLog.defaultTitle');
  $: resolvedDescription = description || $_('auditLog.defaultDescription');
  $: actionLabels = {
    insert: $_('auditLog.actions.insert'),
    update: $_('auditLog.actions.update'),
    delete: $_('auditLog.actions.delete'),
    other: $_('auditLog.actions.other'),
  } as const;

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
    insert: 'k-badge-ok',
    update: 'k-badge-info',
    delete: 'k-badge-danger',
    other: '',
  };

  let diffOpen = false;
  $: if (!diffOpen && diffModalEvent) closeDiff();

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
      diffOpen = true;
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
            : $_('auditLog.loadFailed');
      };
    };
  }

  // formularios de cada fila: el drawer los reutiliza para ir al cambio anterior/siguiente
  let rowForms: (HTMLFormElement | null)[] = [];
  $: selectedIndex = diffModalEvent ? events.indexOf(diffModalEvent) : -1;
  $: previousIndex = findNeighbour(selectedIndex, -1);
  $: nextIndex = findNeighbour(selectedIndex, 1);

  function findNeighbour(from: number, step: 1 | -1): number {
    if (from < 0) return -1;
    for (let index = from + step; index >= 0 && index < events.length; index += step) {
      if (events[index].entity) return index;
    }
    return -1;
  }

  function showNeighbour(index: number) {
    if (index >= 0) rowForms[index]?.requestSubmit();
  }

  function closeDiff() {
    diffModalEvent = null;
    diffChanges = [];
    diffError = '';
  }
  const page = createPageStore();
</script>

<svelte:head>
  <title>{resolvedTitle}</title>
</svelte:head>

<div class="space-y-6">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight text-white">{resolvedTitle}</h1>
    <p class="mt-1 text-sm text-fg-muted">{resolvedDescription}</p>
  </header>

  <div class="k-card overflow-hidden">
    <form method="GET" class="flex flex-wrap items-center gap-2 border-b border-white/8 p-4">
      <label class="relative min-w-56 flex-1">
        <span class="sr-only">{$_('auditLog.searchPlaceholder')}</span>
        <Search
          class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
        />
        <input
          type="text"
          name="search"
          value={currentSearch}
          placeholder={$_('auditLog.searchPlaceholder')}
          class="k-input h-9 pl-9"
        />
      </label>
      <select
        value={selectedPreset}
        on:change={handlePresetChange}
        class="k-input h-9 w-auto"
        aria-label={$_('auditLog.period')}
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
          aria-label={$_('auditLog.fromDate')}
          class="k-input h-9 w-auto"
        />
        <span class="text-fg-subtle">–</span>
        <input
          type="date"
          name="to"
          value={currentTo}
          aria-label={$_('auditLog.toDate')}
          class="k-input h-9 w-auto"
        />
      {:else}
        <input type="hidden" name="from" value={currentFrom} />
        <input type="hidden" name="to" value={currentTo} />
      {/if}
      {#if organizations}
        <select
          name="organizationId"
          class="k-input h-9 w-auto"
          aria-label={$_('auditLog.allOrganizations')}
        >
          <option value="">{$_('auditLog.allOrganizations')}</option>
          {#each organizations as organization}
            <option value={organization.id} selected={organization.id === currentOrganizationId}>
              {organization.name}
            </option>
          {/each}
        </select>
      {/if}
      <input type="hidden" name="perPage" value={pagination.perPage} />
      <button type="submit" class="k-btn k-btn-secondary k-btn-sm h-9"
        >{$_('auditLog.filter')}</button
      >
      {#if hasActiveFilters}
        <a href="?" class="k-btn k-btn-ghost k-btn-sm h-9">{$_('auditLog.clear')}</a>
      {/if}
    </form>

    {#if events.length === 0}
      <div class="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span class="grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-fg-subtle">
          <ScrollText class="h-6 w-6" />
        </span>
        <p class="text-sm text-fg-muted">
          {hasActiveFilters ? $_('auditLog.emptyFiltered') : $_('auditLog.empty')}
        </p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full min-w-176 text-left text-sm">
          <thead class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
            <tr class="border-b border-white/8">
              <th class="px-5 py-3 font-semibold">{$_('common.date')}</th>
              <th class="px-3 py-3 font-semibold">{$_('auditLog.actionsLabel')}</th>
              <th class="px-3 py-3 font-semibold">{$_('auditLog.entity')}</th>
              <th class="px-3 py-3 font-semibold">{$_('auditLog.author')}</th>
              <th class="px-3 py-3 font-semibold">{$_('auditLog.commit')}</th>
              <th class="px-5 py-3"><span class="sr-only">{$_('common.actions')}</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            {#each events as event, index (event.commitHash + event.reason)}
              <tr
                class="transition-colors hover:bg-white/2.5 {diffOpen && diffModalEvent === event
                  ? 'bg-brand-500/6'
                  : ''}"
              >
                <td class="whitespace-nowrap px-5 py-3 text-xs text-fg-muted"
                  >{formatDate(event.timestamp)}</td
                >
                <td class="px-3 py-3">
                  <span class="k-badge h-6 px-2 text-[11px] {actionStyles[event.action]}"
                    >{actionLabels[event.action]}</span
                  >
                </td>
                <td class="px-3 py-3 font-mono text-[13px] text-white">{event.entity ?? '—'}</td>
                <td class="px-3 py-3 text-fg">{event.author}</td>
                <td class="px-3 py-3">
                  {#if commitBaseUrl}
                    <a
                      href={`${commitBaseUrl}/commit/${event.commitHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 font-mono text-xs text-fg-muted hover:text-brand-300"
                      title={$_('auditLog.viewCommit')}
                    >
                      <GitCommit class="h-3.5 w-3.5" />{event.commitHash.slice(0, 7)}
                      <ExternalLink class="h-3 w-3" />
                    </a>
                  {:else}
                    <span class="font-mono text-xs text-fg-subtle"
                      >{event.commitHash.slice(0, 7)}</span
                    >
                  {/if}
                </td>
                <td class="px-5 py-3 text-right">
                  {#if event.entity}
                    <form
                      method="POST"
                      action={diffAction}
                      use:enhance={submitDiff(event)}
                      bind:this={rowForms[index]}
                    >
                      <input type="hidden" name="commit" value={event.commitHash} />
                      <input type="hidden" name="entity" value={event.entity} />
                      <button type="submit" class="k-btn k-btn-ghost k-btn-sm">
                        <Eye class="h-3.5 w-3.5" />{$_('auditLog.viewChanges')}
                      </button>
                    </form>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div
        class="flex flex-col gap-3 border-t border-white/8 px-5 py-3 text-xs text-fg-muted sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-center gap-3">
          <span class="tabular-nums">
            {(pagination.page - 1) * pagination.perPage + 1}–{Math.min(
              pagination.page * pagination.perPage,
              pagination.total,
            )}
            {$_('common.of')}
            {pagination.total}
          </span>
          <select
            value={String(pagination.perPage)}
            on:change={(event) => {
              window.location.href = hrefWithParam('perPage', event.currentTarget.value);
            }}
            class="k-input h-8 w-auto py-0 text-xs"
            aria-label={$_('auditLog.perPage')}
          >
            {#each PER_PAGE_OPTIONS as size}
              <option value={String(size)}>{size} / {$_('auditLog.perPage')}</option>
            {/each}
          </select>
        </div>
        <nav class="flex items-center gap-2" aria-label={$_('auditLog.pagination')}>
          {#if pagination.page > 1}
            <a
              href={hrefWithParam('page', String(pagination.page - 1))}
              class="k-btn k-btn-secondary k-btn-sm"
            >
              <ChevronLeft class="h-3.5 w-3.5" />{$_('auditLog.previous')}
            </a>
          {:else}
            <span
              class="k-btn k-btn-secondary k-btn-sm pointer-events-none opacity-40"
              aria-disabled="true"
            >
              <ChevronLeft class="h-3.5 w-3.5" />{$_('auditLog.previous')}
            </span>
          {/if}
          <span class="tabular-nums"
            >{$_('auditLog.page')} {pagination.page} {$_('common.of')} {pagination.totalPages}</span
          >
          {#if pagination.page < pagination.totalPages}
            <a
              href={hrefWithParam('page', String(pagination.page + 1))}
              class="k-btn k-btn-secondary k-btn-sm"
            >
              {$_('auditLog.next')}<ChevronRight class="h-3.5 w-3.5" />
            </a>
          {:else}
            <span
              class="k-btn k-btn-secondary k-btn-sm pointer-events-none opacity-40"
              aria-disabled="true"
            >
              {$_('auditLog.next')}<ChevronRight class="h-3.5 w-3.5" />
            </span>
          {/if}
        </nav>
      </div>
    {/if}
  </div>
</div>

<Drawer
  bind:open={diffOpen}
  size="lg"
  title={$_('auditLog.changeDetails')}
  description={diffModalEvent?.entity ?? undefined}
>
  {#if diffModalEvent}
    <div class="space-y-6">
      <div class="flex flex-wrap items-center gap-2">
        <span class="k-badge h-6 px-2 text-[11px] {actionStyles[diffModalEvent.action]}"
          >{actionLabels[diffModalEvent.action]}</span
        >
        <span class="k-badge h-6 gap-1 px-2 font-mono text-[11px]"
          ><Database class="h-3 w-3" />{diffModalEvent.entity ?? '—'}</span
        >
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-xl border border-white/8 bg-white/2 p-3">
          <p class="flex items-center gap-1.5 text-xs text-fg-subtle">
            <CalendarClock class="h-3.5 w-3.5" />{$_('common.date')}
          </p>
          <p class="mt-1 text-sm font-medium text-white">{formatDate(diffModalEvent.timestamp)}</p>
        </div>
        <div class="rounded-xl border border-white/8 bg-white/2 p-3">
          <p class="flex items-center gap-1.5 text-xs text-fg-subtle">
            <User class="h-3.5 w-3.5" />{$_('auditLog.author')}
          </p>
          <p class="mt-1 truncate text-sm font-medium text-white">{diffModalEvent.author}</p>
        </div>
        <div class="col-span-2 rounded-xl border border-white/8 bg-white/2 p-3">
          <p class="flex items-center gap-1.5 text-xs text-fg-subtle">
            <GitCommit class="h-3.5 w-3.5" />{$_('auditLog.commit')}
          </p>
          <p class="mt-1 break-all font-mono text-xs text-fg">{diffModalEvent.commitHash}</p>
          {#if diffModalEvent.message}
            <p class="mt-2 whitespace-pre-wrap border-t border-white/6 pt-2 text-xs text-fg-muted">
              {diffModalEvent.message}
            </p>
          {/if}
        </div>
      </div>

      <div>
        <p
          class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle"
        >
          {$_('auditLog.changesTitle')}
          {#if !diffLoading && diffChanges.length > 0}
            <span class="k-badge h-5 px-1.5 text-[10px]">{diffChanges.length}</span>
          {/if}
        </p>
        {#if diffLoading}
          <p class="flex items-center gap-2 text-sm text-fg-subtle">
            <LoaderCircle class="h-4 w-4 animate-spin" />{$_('auditLog.loadingChanges')}
          </p>
        {:else if diffError}
          <p class="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-red-200">
            {diffError}
          </p>
        {:else if diffChanges.length === 0}
          <p class="text-sm text-fg-subtle">{$_('auditLog.noChanges')}</p>
        {:else if diffModalEvent}
          <div class="space-y-3">
            {#each diffChanges as change}
              {@const summary = summarizeChange(diffModalEvent.entity ?? '', change)}
              <div
                class="rounded-xl border p-4 {change.type === 'added'
                  ? 'border-ok/25 bg-ok/5'
                  : change.type === 'removed'
                    ? 'border-danger/25 bg-danger/5'
                    : 'border-info/25 bg-info/5'}"
              >
                <p class="text-sm font-medium text-white">{summary.title}</p>
                {#if summary.fields.length}
                  <dl class="mt-3 space-y-3">
                    {#each summary.fields as field}
                      <div class="text-xs">
                        <dt class="mb-1 font-medium text-fg-muted">{field.label}</dt>
                        <dd>
                          {#if change.type === 'modified'}
                            {#if field.before?.kind === 'text' && field.after?.kind === 'text'}
                              <AuditFieldValue value={field.before} tone="before" />
                              <span class="mx-1 text-fg-subtle">→</span>
                              <AuditFieldValue value={field.after} tone="after" />
                            {:else if field.before?.kind === 'list' && field.after?.kind === 'list'}
                              <div class="flex flex-wrap gap-1.5">
                                {#each diffListItems(field.before.items, field.after.items) as entry}
                                  <span
                                    class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px] {entry.status ===
                                    'added'
                                      ? 'border-ok/30 text-green-300'
                                      : entry.status === 'removed'
                                        ? 'border-danger/30 text-red-300 line-through'
                                        : 'border-white/10 text-fg-muted'}"
                                  >
                                    {#if entry.status === 'added'}+{:else if entry.status === 'removed'}−{/if}{entry.item}
                                  </span>
                                {/each}
                              </div>
                            {:else}
                              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <div>
                                  <p
                                    class="mb-1 text-[10px] uppercase tracking-wide text-fg-subtle"
                                  >
                                    {$_('auditLog.before')}
                                  </p>
                                  <AuditFieldValue value={field.before} />
                                </div>
                                <div>
                                  <p
                                    class="mb-1 text-[10px] uppercase tracking-wide text-fg-subtle"
                                  >
                                    {$_('auditLog.after')}
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
  {/if}
  {#snippet footer()}
    <div class="flex items-center gap-1">
      <button
        type="button"
        class="k-btn k-btn-secondary k-btn-icon"
        disabled={previousIndex < 0 || diffLoading}
        aria-label={$_('auditLog.previousChange')}
        title={$_('auditLog.previousChange')}
        on:click={() => showNeighbour(previousIndex)}
      >
        <ChevronUp class="h-4 w-4" />
      </button>
      <button
        type="button"
        class="k-btn k-btn-secondary k-btn-icon"
        disabled={nextIndex < 0 || diffLoading}
        aria-label={$_('auditLog.nextChange')}
        title={$_('auditLog.nextChange')}
        on:click={() => showNeighbour(nextIndex)}
      >
        <ChevronDown class="h-4 w-4" />
      </button>
    </div>
    <span class="flex-1"></span>
    {#if commitBaseUrl && diffModalEvent}
      <a
        href={`${commitBaseUrl}/commit/${diffModalEvent.commitHash}`}
        target="_blank"
        rel="noopener noreferrer"
        class="k-btn k-btn-secondary"
      >
        <ExternalLink class="h-4 w-4" />{$_('auditLog.viewCommit')}
      </a>
    {/if}
    <button type="button" class="k-btn k-btn-primary" on:click={() => (diffOpen = false)}
      >{$_('common.close')}</button
    >
  {/snippet}
</Drawer>
