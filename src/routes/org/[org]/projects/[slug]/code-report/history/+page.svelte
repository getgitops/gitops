<script lang="ts">
  import { page } from '$app/stores';
  import { ArrowLeft, Check, ChevronDown, Clock, Search } from 'lucide-svelte';
  import { summarizeAnalysisResult } from '$lib/code-report/analysis-summary';
  import CodeReportToolBadge from '$lib/components/code-report/CodeReportToolBadge.svelte';
  export let data: { services: { id: string; slug: string; name: string }[]; analyses: any[] };
  let serviceFilter = $page.url.searchParams.get('service') ?? 'all';
  let statusFilter = 'all';
  let dateFilter = '';
  let query = '';
  let openDropdown = '';
  const riskWeights = { critical: 10, high: 6, medium: 3, low: 1 };

  const statusOptions = [
    { value: 'all', label: 'Todos los estados' },
    { value: 'completed', label: 'Completado' },
    { value: 'in_progress', label: 'En progreso' },
    { value: 'failed', label: 'Fallido' },
  ];

  function riskScore(analysis: any) {
    const summary = summarizeAnalysisResult(analysis.result);
    return (
      summary.vulnerabilities.critical * riskWeights.critical +
      summary.vulnerabilities.high * riskWeights.high +
      summary.vulnerabilities.medium * riskWeights.medium +
      summary.vulnerabilities.low * riskWeights.low
    );
  }

  function riskLabel(analysis: any) {
    const summary = summarizeAnalysisResult(analysis.result);
    const score = riskScore(analysis);
    if (summary.vulnerabilities.critical > 0 || score >= 40) return 'Crítico';
    if (score >= 20) return 'Alto';
    if (score >= 8) return 'Medio';
    if (score > 0) return 'Bajo';
    return 'Sin riesgo';
  }

  function riskClass(analysis: any) {
    const label = riskLabel(analysis);
    return label === 'Crítico'
      ? 'bg-red-50 text-red-700'
      : label === 'Alto'
        ? 'bg-orange-50 text-orange-700'
        : label === 'Medio'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-emerald-50 text-emerald-700';
  }

  function serviceLabel() {
    return (
      data.services.find((service) => service.slug === serviceFilter)?.name ?? 'Todos los servicios'
    );
  }

  function statusLabel() {
    return (
      statusOptions.find((option) => option.value === statusFilter)?.label ?? 'Todos los estados'
    );
  }

  function selectFilter(filter: 'service' | 'status', value: string) {
    if (filter === 'service') serviceFilter = value;
    else statusFilter = value;
    openDropdown = '';
  }

  function analysisSummary(analysis: any) {
    return summarizeAnalysisResult(analysis.result);
  }
  $: filteredAnalyses = data.analyses.filter(
    (analysis) =>
      (!query ||
        `${analysis.tool} ${analysis.service?.name ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (serviceFilter === 'all' || analysis.service?.slug === serviceFilter) &&
      (statusFilter === 'all' || analysis.status === statusFilter) &&
      (!dateFilter || analysis.createdAt.slice(0, 10) === dateFilter),
  );
  $: base = `/org/${$page.params.org}/projects/${$page.params.slug}/code-report`;
</script>

<svelte:head><title>Histórico de Code Report - GitVault Suite</title></svelte:head>
<div class="space-y-6">
  <a href={`${base}/services`} class="inline-flex items-center gap-1.5 text-sm text-slate-600"
    ><ArrowLeft class="h-3.5 w-3.5" />Volver a servicios</a
  >
  <div>
    <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Code Report</p>
    <h1 class="mt-2 text-3xl font-bold text-slate-950">Histórico de análisis</h1>
    <p class="mt-2 text-sm text-slate-600">
      Consulta todos los informes del proyecto y abre cualquier ejecución.
    </p>
  </div>
  <section
    class="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
  >
    <label class="relative"
      ><Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input
        bind:value={query}
        placeholder="Buscar servicio o herramienta..."
        class="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
      /></label
    >
    <div class="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={openDropdown === 'service'}
        on:click={() => (openDropdown = openDropdown === 'service' ? '' : 'service')}
        class="inline-flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 md:min-w-52"
      >
        <span class="truncate">{serviceLabel()}</span>
        <ChevronDown class="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {#if openDropdown === 'service'}
        <div
          class="absolute left-0 top-full z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
          role="listbox"
        >
          <button
            type="button"
            on:click={() => selectFilter('service', 'all')}
            class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            Todos los servicios
            {#if serviceFilter === 'all'}<Check class="h-4 w-4 text-blue-600" />{/if}
          </button>
          {#each data.services as service}
            <button
              type="button"
              on:click={() => selectFilter('service', service.slug)}
              class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span class="truncate">{service.name}</span>
              {#if serviceFilter === service.slug}<Check class="h-4 w-4 text-blue-600" />{/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <div class="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={openDropdown === 'status'}
        on:click={() => (openDropdown = openDropdown === 'status' ? '' : 'status')}
        class="inline-flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 md:min-w-44"
      >
        <span>{statusLabel()}</span>
        <ChevronDown class="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {#if openDropdown === 'status'}
        <div
          class="absolute left-0 top-full z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
          role="listbox"
        >
          {#each statusOptions as option}
            <button
              type="button"
              on:click={() => selectFilter('status', option.value)}
              class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              {option.label}
              {#if statusFilter === option.value}<Check class="h-4 w-4 text-blue-600" />{/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <input
      type="date"
      bind:value={dateFilter}
      aria-label="Filtrar por fecha"
      class="rounded-xl border border-slate-200 px-3 py-2 text-sm"
    />
  </section>
  <p class="text-sm text-slate-500">
    {filteredAnalyses.length} informe{filteredAnalyses.length === 1 ? '' : 's'}
  </p>
  <div
    class="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white"
  >
    {#if filteredAnalyses.length === 0}<p class="p-8 text-center text-sm text-slate-500">
        No hay informes que coincidan con los filtros.
      </p>{:else}{#each filteredAnalyses as analysis}<a
          href={`${base}/history/${analysis.id}`}
          class="block p-5 transition hover:bg-slate-50"
          ><div class="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <span class="font-semibold text-slate-900"
                  >Servicio: {analysis.service?.name ?? 'Servicio eliminado'}</span
                >
                <span class="text-slate-400">·</span>
                <span class="font-mono text-xs text-slate-500">ID: {analysis.id.slice(0, 8)}</span>
              </div>
              <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <CodeReportToolBadge tool={analysis.tool} size="sm" />
                <span class="inline-flex items-center gap-1"
                  ><Clock class="h-3.5 w-3.5" />{new Date(
                    analysis.createdAt,
                  ).toLocaleString()}</span
                >
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class={`rounded-full px-2.5 py-1 text-xs font-semibold ${riskClass(analysis)}`}>
                Riesgo {riskLabel(analysis)} · {riskScore(analysis)}
              </span>
              <span
                class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
                >{analysis.status}</span
              >
              <span class="text-xs text-slate-500">
                {analysisSummary(analysis).totalVulnerabilities} vulnerabilidades
                <span class="mx-1">·</span>
                {analysisSummary(analysis).vulnerabilities.critical} Critical
                <span class="mx-1">·</span>
                {analysisSummary(analysis).vulnerabilities.high} High
                <span class="mx-1">·</span>
                {analysisSummary(analysis).vulnerabilities.medium} Medium
                <span class="mx-1">·</span>
                {analysisSummary(analysis).vulnerabilities.low} Low
              </span>
            </div>
          </div></a
        >{/each}{/if}
  </div>
</div>
