<script lang="ts">
  import { untrack } from 'svelte';
  import { createPageStore } from '#lib/page-store';
  import { ChevronLeft, ChevronRight, Clock, FileSearch, Search, X } from '@lucide/svelte';
  import { summarizeAnalysisResult } from '#lib/code-report/analysis-summary';
  import CodeReportToolBadge from '#lib/components/code-report/CodeReportToolBadge.svelte';
  import { Select } from '#lib/components/ui';
  import { _, locale } from '#lib/i18n';

  type RiskWeights = { critical: number; high: number; medium: number; low: number };

  let {
    data,
  }: {
    data: {
      services: { id: string; slug: string; name: string }[];
      analyses: any[];
      riskWeights: RiskWeights;
      project?: { slug?: string; organization?: { slug?: string | null } | null };
    };
  } = $props();

  const page = createPageStore();
  const base = $derived(
    `/org/${data.project?.organization?.slug ?? $page.params.org ?? ''}/projects/${data.project?.slug ?? $page.params.slug ?? ''}/code-report`,
  );

  let serviceFilter = $state(untrack(() => $page.url.searchParams.get('service') ?? 'all'));
  let statusFilter = $state('all');
  let dateFilter = $state('');
  let query = $state('');

  const hasFilters = $derived(
    serviceFilter !== 'all' || statusFilter !== 'all' || !!dateFilter || !!query.trim(),
  );

  function clearFilters() {
    serviceFilter = 'all';
    statusFilter = 'all';
    dateFilter = '';
    query = '';
  }

  const serviceOptions = $derived([
    { value: 'all', label: $_('codeReport.history.allServices') },
    ...data.services.map((service) => ({ value: service.slug, label: service.name })),
  ]);

  const statusOptions = $derived([
    { value: 'all', label: $_('codeReport.history.allStatuses') },
    { value: 'completed', label: $_('codeReport.history.completed') },
    { value: 'in_progress', label: $_('codeReport.history.inProgress') },
    { value: 'failed', label: $_('codeReport.history.failed') },
  ]);

  type Risk = 'critical' | 'high' | 'medium' | 'low' | 'noRisk';

  const riskBadge: Record<Risk, string> = {
    critical: 'k-badge-danger',
    high: 'k-badge-brand',
    medium: 'k-badge-warn',
    low: '',
    noRisk: 'k-badge-ok',
  };

  const statusBadge: Record<string, { className: string; dot: string; key: string }> = {
    completed: { className: 'k-badge-ok', dot: 'bg-ok', key: 'completed' },
    in_progress: { className: 'k-badge-info', dot: 'bg-info', key: 'inProgress' },
    failed: { className: 'k-badge-danger', dot: 'bg-danger', key: 'failed' },
  };

  // resumen y riesgo calculados una vez por análisis
  const rows = $derived(
    data.analyses.map((analysis) => {
      const summary = summarizeAnalysisResult(analysis.result);
      const v = summary.vulnerabilities;
      const w = data.riskWeights;
      const score = v.critical * w.critical + v.high * w.high + v.medium * w.medium + v.low * w.low;
      const risk: Risk =
        v.critical > 0 || score >= 40
          ? 'critical'
          : score >= 20
            ? 'high'
            : score >= 8
              ? 'medium'
              : score > 0
                ? 'low'
                : 'noRisk';
      return { analysis, summary, score, risk };
    }),
  );

  const filteredRows = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      ({ analysis }) =>
        (!q || `${analysis.tool} ${analysis.service?.name ?? ''}`.toLowerCase().includes(q)) &&
        (serviceFilter === 'all' || analysis.service?.slug === serviceFilter) &&
        (statusFilter === 'all' || analysis.status === statusFilter) &&
        (!dateFilter || analysis.createdAt.slice(0, 10) === dateFilter),
    );
  });

  const PAGE_SIZE = 10;
  let currentPage = $state(1);
  const totalPages = $derived(Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE)));
  const pagedRows = $derived(
    filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
  );

  // al cambiar filtros vuelve a la primera página
  $effect(() => {
    serviceFilter;
    statusFilter;
    dateFilter;
    query;
    currentPage = 1;
  });

  // ventana de páginas: 1 … n-1 n n+1 … último
  const pageItems = $derived.by(() => {
    const total = totalPages;
    const set = new Set([1, total, currentPage - 1, currentPage, currentPage + 1]);
    const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    const out: (number | null)[] = [];
    nums.forEach((n, i) => {
      if (i > 0 && n - nums[i - 1] > 1) out.push(null);
      out.push(n);
    });
    return out;
  });

  function formatDate(value: string) {
    return new Intl.DateTimeFormat($locale ?? 'es', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }
</script>

<svelte:head><title>{$_('codeReport.history.title')} - GitOps</title></svelte:head>

<div class="space-y-6">
  <header class="max-w-2xl">
    <h1 class="text-2xl font-semibold tracking-tight text-white">
      {$_('codeReport.history.title')}
    </h1>
    <p class="mt-1 text-sm text-fg-muted">{$_('codeReport.history.description')}</p>
  </header>

  <div class="k-card overflow-hidden">
    <div class="flex flex-wrap items-center gap-3 border-b border-white/8 p-4">
      <label class="relative w-full sm:w-64">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
        />
        <input
          type="search"
          bind:value={query}
          placeholder={$_('codeReport.history.searchPlaceholder')}
          aria-label={$_('codeReport.history.searchPlaceholder')}
          class="k-input h-9 pl-9"
        />
      </label>
      <div class="w-full sm:w-52">
        <label for="history-service" class="sr-only">{$_('codeReport.history.serviceLabel')}</label>
        <Select
          id="history-service"
          options={serviceOptions}
          bind:value={serviceFilter}
          searchable
        />
      </div>
      <div class="w-full sm:w-44">
        <label for="history-status" class="sr-only">{$_('common.status')}</label>
        <Select id="history-status" options={statusOptions} bind:value={statusFilter} />
      </div>
      <input
        type="date"
        bind:value={dateFilter}
        aria-label={$_('codeReport.history.filterByDate')}
        class="k-input h-9 w-full sm:w-44"
      />
      {#if hasFilters}
        <button type="button" class="k-btn k-btn-ghost k-btn-sm" onclick={clearFilters}>
          <X class="h-3.5 w-3.5" />Limpiar
        </button>
      {/if}
      <span class="ml-auto text-xs text-fg-subtle tabular-nums">
        {filteredRows.length}
        {filteredRows.length === 1
          ? $_('codeReport.history.reportSingular')
          : $_('codeReport.history.reportPlural')}
      </span>
    </div>

    {#if filteredRows.length === 0}
      <div class="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span class="grid h-12 w-12 place-items-center rounded-xl bg-white/4 text-fg-subtle">
          <FileSearch class="h-6 w-6" />
        </span>
        {#if data.analyses.length === 0}
          <p class="text-sm font-medium text-white">Aún no hay análisis</p>
          <p class="max-w-sm text-sm text-fg-muted">
            Aparecerán aquí cuando tu pipeline envíe el primer resultado a la API de scan.
          </p>
        {:else}
          <p class="text-sm font-medium text-white">{$_('codeReport.history.noReports')}</p>
        {/if}
        {#if hasFilters}
          <button type="button" class="k-btn k-btn-secondary k-btn-sm" onclick={clearFilters}>
            <X class="h-3.5 w-3.5" />Limpiar filtros
          </button>
        {/if}
      </div>
    {:else}
      <ul class="divide-y divide-white/6">
        {#each pagedRows as { analysis, summary, score, risk } (analysis.id)}
          {@const status = statusBadge[analysis.status]}
          <li>
            <a
              href={`${base}/history/${analysis.id}`}
              class="group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-white/2.5 lg:flex-row lg:items-center"
            >
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium text-white">
                    {analysis.service?.name ?? $_('codeReport.history.serviceDeleted')}
                  </span>
                  <CodeReportToolBadge tool={analysis.tool} size="sm" />
                </div>
                <div
                  class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle"
                >
                  <span class="inline-flex items-center gap-1"
                    ><Clock class="h-3.5 w-3.5" />{formatDate(analysis.createdAt)}</span
                  >
                  <span class="font-mono">{analysis.id.slice(0, 8)}</span>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                {#if summary.totalVulnerabilities > 0}
                  <span class="k-badge k-badge-danger font-semibold tabular-nums"
                    >C · {summary.vulnerabilities.critical}</span
                  >
                  <span class="k-badge k-badge-brand font-semibold tabular-nums"
                    >H · {summary.vulnerabilities.high}</span
                  >
                  <span class="k-badge k-badge-warn font-semibold tabular-nums"
                    >M · {summary.vulnerabilities.medium}</span
                  >
                  <span class="k-badge font-semibold tabular-nums"
                    >L · {summary.vulnerabilities.low}</span
                  >
                  <span class="mx-1 hidden h-5 w-px bg-white/10 sm:block"></span>
                {/if}
                <span class="k-badge {riskBadge[risk]} font-semibold">
                  {$_('codeReport.history.risk')}
                  {$_(`codeReport.history.${risk}`)} · {score}
                </span>
                {#if status}
                  <span class="k-badge {status.className}"
                    ><span class="h-1.5 w-1.5 rounded-full {status.dot}"></span>{$_(
                      `codeReport.history.${status.key}`,
                    )}</span
                  >
                {:else}
                  <span class="k-badge">{analysis.status}</span>
                {/if}
                <ChevronRight
                  class="hidden h-4 w-4 text-fg-subtle transition group-hover:translate-x-0.5 group-hover:text-brand-400 lg:block"
                />
              </div>
            </a>
          </li>
        {/each}
      </ul>
      {#if totalPages > 1}
        <nav
          class="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 px-5 py-3"
          aria-label={$_('codeReport.history.pagination')}
        >
          <span class="text-xs text-fg-subtle tabular-nums">
            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredRows.length)}
            / {filteredRows.length}
          </span>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
              aria-label={$_('codeReport.history.previousPage')}
              disabled={currentPage === 1}
              onclick={() => (currentPage = Math.max(1, currentPage - 1))}
              ><ChevronLeft class="h-4 w-4" /></button
            >
            {#each pageItems as n}
              {#if n === null}
                <span class="px-1 text-sm text-fg-subtle">…</span>
              {:else}
                <button
                  type="button"
                  aria-current={currentPage === n ? 'page' : undefined}
                  class="h-8 min-w-8 rounded-lg px-2 text-sm font-medium tabular-nums transition-colors {currentPage ===
                  n
                    ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/40'
                    : 'text-fg-muted hover:bg-white/5'}"
                  onclick={() => (currentPage = n)}>{n}</button
                >
              {/if}
            {/each}
            <button
              type="button"
              class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
              aria-label={$_('codeReport.history.nextPage')}
              disabled={currentPage === totalPages}
              onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
              ><ChevronRight class="h-4 w-4" /></button
            >
          </div>
        </nav>
      {/if}
    {/if}
  </div>
</div>
