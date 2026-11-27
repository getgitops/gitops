<!--
  Pestaña "CVEs por tecnología" de /org/<org>/cves: tecnologías seguidas, filtros por GET, tabla del
  feed, estado por fuente y gestión de la watchlist (modal con JS, en línea con `?manage=1` sin JS).
  Solo lee lo que le pasa la página (que a su vez solo lee GitDB): nunca llama a fuentes externas.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import {
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    Flame,
    ListChecks,
    LoaderCircle,
    RefreshCw,
    Save,
    Settings2,
  } from '@lucide/svelte';
  import { SEVERITY_BADGE, type SeverityKey } from '#lib/code-report/severity-ui';
  import { FEED_PAGE_SIZE, feedQuery, type FeedFilterValues } from '#lib/cves/feed-view';
  import { Field, Modal, toast } from '#lib/components/ui';
  import { _, locale } from '#lib/i18n';
  import type {
    CveFeedItem,
    CveWatchlist,
    FeedStatus,
    FollowedTechnology,
    WatchlistSuggestion,
  } from '#modules/cve-feed';
  import { getTechnology } from '#lib/cves/technologies.data';
  import FormSelect from './FormSelect.svelte';
  import WatchlistForm from './WatchlistForm.svelte';

  export type FeedData = {
    enabled: boolean;
    canUpdate: boolean;
    severityFloor: string;
    watchlist: CveWatchlist;
    technologies: FollowedTechnology[];
    items: CveFeedItem[];
    total: number;
    pageSize: number;
    filters: FeedFilterValues;
    status: FeedStatus;
    suggestions: WatchlistSuggestion[];
    manage: boolean;
  };

  let {
    orgSlug,
    feed,
    form,
  }: {
    orgSlug: string;
    feed: FeedData;
    form?: { action?: string; success?: boolean; error?: string } | null;
  } = $props();

  const base = $derived(`/org/${orgSlug}/cves`);
  const formId = 'cve-watchlist-form';
  const filters = $derived(feed.filters);
  const hasFilters = $derived(
    Boolean(
      filters.technology ||
      filters.severity ||
      filters.kev ||
      filters.affectsMe ||
      filters.from ||
      filters.to,
    ),
  );
  const pages = $derived(Math.max(1, Math.ceil(feed.total / feed.pageSize || 1)));
  const firstRow = $derived((filters.page - 1) * FEED_PAGE_SIZE + 1);
  const lastRow = $derived(Math.min(feed.total, filters.page * FEED_PAGE_SIZE));
  const sources = $derived(feed.status.sources);
  const following = $derived(feed.technologies.length > 0);

  const technologyOptions = $derived([
    { value: '', label: $_('org.cves.feed.filters.allTechnologies') },
    ...feed.technologies.map((item) => ({ value: item.technologyId, label: item.name })),
  ]);
  const severityOptions = $derived([
    { value: '', label: $_('org.cves.feed.filters.anySeverity') },
    ...['critical', 'high', 'medium', 'low'].map((severity) => ({
      value: severity,
      label: $_('org.cves.feed.filters.atLeast', { values: { severity: severityLabel(severity) } }),
    })),
  ]);

  let open = $state(false);
  let saving = $state(false);
  let syncing = $state(false);

  const severityLabel = (severity: string) => $_(`events.options.cveSeverity.${severity}`);
  const errorText = (code: string | undefined) => {
    const key = `org.cves.feed.errors.${code}`;
    const text = $_(key);
    return text === key ? $_('org.cves.feed.errors.generic') : text;
  };
  const technologyName = (id: string) =>
    feed.technologies.find((item) => item.technologyId === id)?.name ??
    getTechnology(id)?.name ??
    id;

  function date(iso: string | null) {
    if (!iso) return '—';
    return new Intl.DateTimeFormat($locale ?? 'es', { dateStyle: 'medium' }).format(new Date(iso));
  }
  function dateTime(iso: string | null) {
    if (!iso) return $_('org.cves.feed.status.never');
    return new Intl.DateTimeFormat($locale ?? 'es', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  }

  const saveWatchlist: NonNullable<Parameters<typeof enhance>[1]> = () => {
    saving = true;
    return async ({ result, update }) => {
      saving = false;
      if (result.type === 'success') {
        toast.success($_('org.cves.feed.watchlistSaved'));
        open = false;
        await update({ reset: false });
        // sin el formulario en línea (`?manage=1`) de la versión sin JS
        if (feed.manage) await goto(feedQuery(filters), { invalidateAll: true });
      } else if (result.type === 'failure') {
        toast.error(errorText((result.data as { error?: string } | undefined)?.error));
      } else {
        await update();
      }
    };
  };

  const requestSync: NonNullable<Parameters<typeof enhance>[1]> = () => {
    syncing = true;
    return async ({ result, update }) => {
      syncing = false;
      if (result.type === 'success') {
        toast.success($_('org.cves.feed.syncRequested'), $_('org.cves.feed.syncRequestedHelp'));
        await update({ reset: false });
      } else if (result.type === 'failure') {
        toast.error(errorText((result.data as { error?: string } | undefined)?.error));
      } else {
        await update();
      }
    };
  };

  function openManager(event: MouseEvent) {
    // con JS se abre el modal; sin JS el enlace lleva a `?manage=1` (formulario en línea)
    if (feed.manage) return;
    event.preventDefault();
    open = true;
  }
</script>

<div class="space-y-6" data-testid="cve-feed">
  {#if !feed.enabled}
    <section class="k-card flex items-start gap-3 p-5" data-testid="cve-feed-disabled">
      <CircleAlert class="mt-0.5 h-5 w-5 shrink-0 text-warn" />
      <div class="min-w-0">
        <h2 class="font-semibold text-white">{$_('org.cves.feed.disabled.title')}</h2>
        <p class="mt-1 text-sm text-fg-muted">
          {$_('org.cves.feed.disabled.description')}
          <code class="k-kbd">CVE_FEED_ENABLED=true</code>
        </p>
      </div>
    </section>
  {/if}

  {#if form?.success && form.action === 'watchlist'}
    <p role="status" class="k-badge k-badge-ok h-auto py-1.5">
      {$_('org.cves.feed.watchlistSaved')}
    </p>
  {:else if form?.success && form.action === 'sync'}
    <p role="status" class="k-badge k-badge-ok h-auto py-1.5">
      {$_('org.cves.feed.syncRequested')}
    </p>
  {:else if form?.error && form.action === 'sync'}
    <p role="alert" class="k-badge k-badge-danger h-auto py-1.5">{errorText(form.error)}</p>
  {/if}

  <section class="k-card p-5" aria-labelledby="cve-followed">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="max-w-2xl">
        <h2 id="cve-followed" class="font-semibold text-white">
          {$_('org.cves.feed.followed')}
        </h2>
        <p class="mt-1 text-sm text-fg-muted">{$_('org.cves.feed.intro')}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        {#if feed.canUpdate && feed.enabled}
          <form method="POST" action="?/sync&tab=technology" use:enhance={requestSync}>
            <button type="submit" class="k-btn k-btn-secondary" disabled={syncing}>
              {#if syncing}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<RefreshCw
                  class="h-4 w-4"
                />{/if}
              {$_('org.cves.feed.sync')}
            </button>
          </form>
        {/if}
        {#if feed.canUpdate}
          <a
            href={feedQuery(filters, { manage: '1' })}
            class="k-btn k-btn-primary"
            onclick={openManager}
          >
            <Settings2 class="h-4 w-4" />{$_('org.cves.feed.manage')}
          </a>
        {/if}
      </div>
    </div>

    {#if following}
      <ul class="mt-4 flex flex-wrap gap-2" aria-label={$_('org.cves.feed.followed')}>
        {#each feed.technologies as item (item.technologyId)}
          {@const active = filters.technology === item.technologyId}
          <li>
            <a
              href={feedQuery({ ...filters, technology: active ? '' : item.technologyId, page: 1 })}
              aria-current={active ? 'true' : undefined}
              class="k-badge h-7 px-3 text-xs {active ? 'k-badge-brand' : 'hover:text-white'}"
            >
              {item.name}
              <span class="text-fg-subtle">{item.advisories}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if feed.manage && feed.canUpdate}
    <section class="k-card p-5" aria-labelledby="cve-manage" data-testid="cve-feed-manage-inline">
      <h2 id="cve-manage" class="font-semibold text-white">{$_('org.cves.feed.modal.title')}</h2>
      <p class="mb-5 mt-1 text-sm text-fg-muted">{$_('org.cves.feed.modal.description')}</p>
      <WatchlistForm
        formId="{formId}-inline"
        action="?/watchlist&tab=technology"
        watchlist={feed.watchlist}
        severityFloor={feed.severityFloor}
        suggestions={feed.suggestions}
        error={form?.action === 'watchlist' && form.error ? errorText(form.error) : null}
        onsubmit={saveWatchlist}
      />
      <div class="mt-5 flex justify-end gap-2">
        <a href={feedQuery(filters)} class="k-btn k-btn-ghost">{$_('common.cancel')}</a>
        <button type="submit" form="{formId}-inline" class="k-btn k-btn-primary">
          <Save class="h-4 w-4" />{$_('org.cves.feed.modal.save')}
        </button>
      </div>
    </section>
  {/if}

  {#if !following}
    <section class="k-card px-6 py-12 text-center" data-testid="cve-feed-empty">
      <ListChecks class="mx-auto h-8 w-8 text-fg-subtle" />
      <h2 class="mt-3 font-semibold text-white">{$_('org.cves.feed.empty.title')}</h2>
      <p class="mx-auto mt-1 max-w-md text-sm text-fg-muted">
        {$_(feed.canUpdate ? 'org.cves.feed.empty.description' : 'org.cves.feed.empty.readOnly')}
      </p>
      {#if feed.canUpdate && !feed.manage}
        <a
          href={feedQuery(filters, { manage: '1' })}
          class="k-btn k-btn-primary mt-5"
          onclick={openManager}
        >
          <Settings2 class="h-4 w-4" />{$_('org.cves.feed.empty.action')}
        </a>
      {/if}
    </section>
  {:else}
    <form method="GET" class="k-card p-5" aria-label={$_('org.cves.feed.filters.label')}>
      <input type="hidden" name="tab" value="technology" />
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={$_('org.cves.feed.filters.technology')}>
          {#snippet children(control)}
            <FormSelect
              name="technology"
              options={technologyOptions}
              value={filters.technology}
              {...control}
            />
          {/snippet}
        </Field>
        <Field label={$_('org.cves.feed.filters.severity')}>
          {#snippet children(control)}
            <FormSelect
              name="severity"
              options={severityOptions}
              value={filters.severity}
              {...control}
            />
          {/snippet}
        </Field>
        <label class="block">
          <span class="k-label">{$_('org.cves.feed.filters.from')}</span>
          <input type="date" class="k-input" name="from" value={filters.from} />
        </label>
        <label class="block">
          <span class="k-label">{$_('org.cves.feed.filters.to')}</span>
          <input type="date" class="k-input" name="to" value={filters.to} />
        </label>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label class="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" class="k-checkbox" name="kev" value="1" checked={filters.kev} />
          {$_('org.cves.feed.filters.kev')}
        </label>
        <label class="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            class="k-checkbox"
            name="affectsMe"
            value="1"
            checked={filters.affectsMe}
          />
          {$_('org.cves.feed.filters.affectsMe')}
        </label>
        <div class="ml-auto flex gap-2">
          {#if hasFilters}
            <a href="?tab=technology" class="k-btn k-btn-ghost"
              >{$_('org.cves.feed.filters.clear')}</a
            >
          {/if}
          <button type="submit" class="k-btn k-btn-secondary">
            {$_('org.cves.feed.filters.apply')}
          </button>
        </div>
      </div>
    </form>

    <section class="k-card overflow-hidden" aria-labelledby="cve-feed-table">
      <div class="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <h2 id="cve-feed-table" class="font-semibold text-white">
          {$_('org.cves.feed.tableTitle')}
          <span class="font-normal text-fg-subtle">{feed.total}</span>
        </h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-240 text-left text-sm">
          <thead class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
            <tr class="border-b border-white/8">
              <th class="px-5 py-3 font-semibold">{$_('org.cves.feed.columns.cve')}</th>
              <th class="px-3 py-3 font-semibold">{$_('org.cves.feed.columns.technology')}</th>
              <th class="px-3 py-3 font-semibold">{$_('org.cves.feed.columns.severity')}</th>
              <th class="px-3 py-3 font-semibold">{$_('org.cves.feed.columns.epss')}</th>
              <th class="px-3 py-3 font-semibold">{$_('org.cves.feed.columns.flags')}</th>
              <th class="px-3 py-3 font-semibold">{$_('org.cves.feed.columns.published')}</th>
              <th class="px-3 py-3 font-semibold">{$_('org.cves.feed.columns.updated')}</th>
              <th class="px-5 py-3 font-semibold">{$_('org.cves.feed.columns.fixed')}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            {#each feed.items as item (item.advisory.id)}
              {@const advisory = item.advisory}
              <tr class="transition-colors hover:bg-white/2.5">
                <td class="px-5 py-3">
                  <a
                    href="{base}/{encodeURIComponent(advisory.id)}"
                    class="font-mono text-xs font-medium text-white hover:text-brand-300"
                    >{advisory.id}</a
                  >
                  {#if advisory.title}
                    <p class="max-w-xs truncate text-xs text-fg-subtle" title={advisory.title}>
                      {advisory.title}
                    </p>
                  {/if}
                </td>
                <td class="px-3 py-3 text-xs text-fg">
                  {item.technologyIds.map(technologyName).join(', ')}
                  {#each advisory.affected.slice(0, 1) as affected (affected.package ?? affected.cpe)}
                    <p class="font-mono text-fg-subtle">{affected.package ?? affected.cpe}</p>
                  {/each}
                </td>
                <td class="whitespace-nowrap px-3 py-3">
                  <span class="k-badge {SEVERITY_BADGE[advisory.severity as SeverityKey]}"
                    >{severityLabel(advisory.severity)}</span
                  >
                  <span class="ml-1 text-xs tabular-nums text-fg-subtle"
                    >{advisory.cvssScore !== null ? advisory.cvssScore.toFixed(1) : '—'}</span
                  >
                </td>
                <td class="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-fg">
                  {advisory.epssScore !== null
                    ? `${(advisory.epssScore * 100).toFixed(advisory.epssScore < 0.01 ? 2 : 1)} %`
                    : '—'}
                </td>
                <td class="px-3 py-3">
                  <div class="flex flex-wrap gap-1">
                    {#if advisory.kev}
                      <span class="k-badge k-badge-danger"
                        ><Flame class="h-3 w-3" />{$_('org.cves.feed.badges.kev')}</span
                      >
                    {/if}
                    {#if item.affectsMe}
                      <span class="k-badge k-badge-warn"
                        >{$_('org.cves.feed.badges.affectsMe')}</span
                      >
                    {/if}
                  </div>
                </td>
                <td class="whitespace-nowrap px-3 py-3 text-xs text-fg-subtle"
                  >{date(advisory.publishedAt)}</td
                >
                <td class="whitespace-nowrap px-3 py-3 text-xs text-fg-subtle"
                  >{date(advisory.modifiedAt)}</td
                >
                <td class="px-5 py-3 font-mono text-xs">
                  {#if advisory.fixedVersions.length > 0}
                    <span class="text-ok">{advisory.fixedVersions.slice(0, 2).join(', ')}</span>
                  {:else}
                    <span class="text-fg-subtle">—</span>
                  {/if}
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="8" class="px-5 py-10 text-center text-sm text-fg-subtle">
                  {$_(hasFilters ? 'org.cves.feed.noResults' : 'org.cves.feed.noAdvisories')}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if feed.total > feed.pageSize}
        <nav
          class="flex items-center justify-between border-t border-white/8 px-5 py-3 text-xs text-fg-subtle"
          aria-label={$_('org.cves.feed.pagination.label')}
        >
          <span
            >{$_('org.cves.feed.pagination.summary', {
              values: { from: firstRow, to: lastRow, total: feed.total },
            })}</span
          >
          <div class="flex gap-2">
            {#if filters.page > 1}
              <a
                href={feedQuery({ ...filters, page: filters.page - 1 })}
                class="k-btn k-btn-secondary k-btn-sm"
                rel="prev"
                ><ChevronLeft class="h-3.5 w-3.5" />{$_('org.cves.feed.pagination.previous')}</a
              >
            {/if}
            {#if filters.page < pages}
              <a
                href={feedQuery({ ...filters, page: filters.page + 1 })}
                class="k-btn k-btn-secondary k-btn-sm"
                rel="next"
                >{$_('org.cves.feed.pagination.next')}<ChevronRight class="h-3.5 w-3.5" /></a
              >
            {/if}
          </div>
        </nav>
      {/if}
    </section>
  {/if}

  <section class="k-card p-5" aria-labelledby="cve-feed-status" data-testid="cve-feed-status">
    <h2 id="cve-feed-status" class="font-semibold text-white">
      {$_('org.cves.feed.status.title')}
    </h2>
    <p class="mt-1 text-xs text-fg-subtle">
      {$_('org.cves.feed.status.lastRun', { values: { date: dateTime(feed.status.lastRunAt) } })}
    </p>
    <ul class="mt-3 divide-y divide-white/6 text-sm">
      {#each sources as source (source.id)}
        <li class="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
          <span class="w-24 font-medium text-white">
            {$_(`org.cves.feed.status.sources.${source.id}`)}
          </span>
          <span class="text-xs text-fg-muted">
            {$_('org.cves.feed.status.lastSuccess', {
              values: { date: dateTime(source.lastSuccessAt) },
            })}
          </span>
          {#if source.lastError}
            <span
              class="k-badge k-badge-danger h-auto whitespace-normal py-1"
              title={source.lastError}
            >
              {source.lastError}
              {#if source.lastErrorAt}· {dateTime(source.lastErrorAt)}{/if}
            </span>
          {:else}
            <span class="k-badge k-badge-ok">{$_('org.cves.feed.status.noErrors')}</span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
</div>

{#if feed.canUpdate}
  <Modal
    bind:open
    size="2xl"
    dismissible={!saving}
    title={$_('org.cves.feed.modal.title')}
    description={$_('org.cves.feed.modal.description')}
  >
    <WatchlistForm
      {formId}
      action="?/watchlist&tab=technology"
      watchlist={feed.watchlist}
      severityFloor={feed.severityFloor}
      suggestions={feed.suggestions}
      scrollColumns
      onsubmit={saveWatchlist}
    />
    {#snippet footer()}
      <button type="button" class="k-btn k-btn-ghost" onclick={() => (open = false)}
        >{$_('common.cancel')}</button
      >
      <button type="submit" form={formId} class="k-btn k-btn-primary" disabled={saving}>
        {#if saving}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Save
            class="h-4 w-4"
          />{/if}
        {$_('org.cves.feed.modal.save')}
      </button>
    {/snippet}
  </Modal>
{/if}
