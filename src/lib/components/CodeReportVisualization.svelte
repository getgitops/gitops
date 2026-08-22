<script lang="ts">
  import { onDestroy } from 'svelte';
  import { AlertCircle, Clock, GitBranch, Github, Gitlab, Info, Search, X } from 'lucide-svelte';
  import {
    extractVulnerabilities,
    summarizeAnalysisResult,
    type VulnerabilityFinding,
  } from '$lib/code-report/analysis-summary';

  type AnalysisData = {
    id: string;
    tool: string;
    status: 'in_progress' | 'completed' | 'failed';
    result: unknown;
    summary?: unknown;
    error?: string | null;
    gitInfo?: {
      repositoryUrl?: string | null;
      branch?: string | null;
      commit?: string | null;
    } | null;
    createdAt: string;
    updatedAt: string;
  };
  type Analysis = AnalysisData | null;

  export let analysis: Analysis;
  export let analysisHistory: AnalysisData[] = [];
  export let heading = 'Análisis';
  let activeTab = 'summary';
  let riskInfoModalOpen = false;
  let fileQuery = '';
  let vulnerabilityQuery = '';
  let severityFilter = 'all';
  let selectedFilePath = '';
  let chart: { destroy: () => void } | null = null;
  const riskWeights = { critical: 10, high: 6, medium: 3, low: 1 };
  const statusStyles: Record<string, string> = {
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
  };
  const severityStyles: Record<string, string> = {
    critical: 'bg-red-50 text-red-700 border-red-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-slate-50 text-slate-600 border-slate-200',
    unknown: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const severityKeys = ['critical', 'high', 'medium', 'low', 'unknown'] as const;
  $: summary = analysis ? summarizeAnalysisResult(analysis.result) : null;
  $: vulnerabilities = analysis ? extractVulnerabilities(analysis.result) : [];
  $: fileGroups = groupByFile(vulnerabilities);
  $: selectedFile = fileGroups.find((file) => file.path === selectedFilePath) ?? null;
  $: historyPoints = analysisHistory
    .filter((item) => item.status === 'completed')
    .slice()
    .reverse()
    .map((item) => ({
      date: new Date(item.createdAt).toLocaleDateString(),
      summary: summarizeAnalysisResult(item.result),
    }));
  $: riskScore = summary
    ? summary.vulnerabilities.critical * riskWeights.critical +
      summary.vulnerabilities.high * riskWeights.high +
      summary.vulnerabilities.medium * riskWeights.medium +
      summary.vulnerabilities.low * riskWeights.low
    : 0;
  $: riskLevel =
    !summary || riskScore === 0
      ? { label: 'Sin riesgo', className: 'safe' }
      : summary.vulnerabilities.critical > 0 || riskScore >= 40
        ? { label: 'Riesgo crítico', className: 'critical' }
        : riskScore >= 20
          ? { label: 'Riesgo alto', className: 'high' }
          : riskScore >= 8
            ? { label: 'Riesgo medio', className: 'medium' }
            : { label: 'Riesgo bajo', className: 'low' };
  $: filteredVulnerabilities = vulnerabilities
    .filter((finding) => {
      const query = vulnerabilityQuery.trim().toLowerCase();
      return (
        (!query ||
          [finding.id, finding.packageName, finding.target, finding.title].some((value) =>
            value.toLowerCase().includes(query),
          )) &&
        (severityFilter === 'all' || finding.severity === severityFilter)
      );
    })
    .sort(
      (left, right) => (severityRank[right.severity] ?? 0) - (severityRank[left.severity] ?? 0),
    );
  $: filteredFileGroups = fileGroups.filter((file) =>
    getFileName(file.path).toLowerCase().includes(fileQuery.trim().toLowerCase()),
  );
  function calculateRiskScore(value: ReturnType<typeof summarizeAnalysisResult>) {
    return (
      value.vulnerabilities.critical * riskWeights.critical +
      value.vulnerabilities.high * riskWeights.high +
      value.vulnerabilities.medium * riskWeights.medium +
      value.vulnerabilities.low * riskWeights.low
    );
  }
  function setupChart(canvas: HTMLCanvasElement) {
    let disposed = false;
    import('chart.js').then(({ Chart, registerables }) => {
      if (disposed || historyPoints.length === 0) return;
      Chart.register(...registerables);
      chart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: historyPoints.map((point) => point.date),
          datasets: [
            {
              label: 'Riesgo ponderado',
              data: historyPoints.map((point) => calculateRiskScore(point.summary)),
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              fill: true,
              tension: 0.35,
            },
            {
              label: 'Vulnerabilidades',
              data: historyPoints.map((point) => point.summary.totalVulnerabilities),
              borderColor: '#2457ff',
              fill: false,
              tension: 0.35,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'bottom' } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        },
      });
    });
    return {
      destroy: () => {
        disposed = true;
        chart?.destroy();
        chart = null;
      },
    };
  }
  onDestroy(() => chart?.destroy());
  function groupByFile(findings: VulnerabilityFinding[]) {
    const groups = new Map<string, VulnerabilityFinding[]>();
    for (const finding of findings)
      groups.set(finding.packagePath, [...(groups.get(finding.packagePath) ?? []), finding]);
    return [...groups.entries()]
      .map(([path, groupedFindings]) => ({ path, vulnerabilities: groupedFindings }))
      .sort((a, b) => b.vulnerabilities.length - a.vulnerabilities.length);
  }
  function getFileName(path: string) {
    return path.split(/[\\/]/).pop() || path;
  }
  function findingStatus(finding: VulnerabilityFinding) {
    return finding.status === 'fixed' || finding.fixedVersion
      ? 'Actualizar'
      : finding.status === 'will_not_fix'
        ? 'Excepción'
        : finding.status === 'unknown'
          ? 'Revisar'
          : 'Afectada';
  }
  function providerIcon(url: string) {
    return url.includes('github.com') ? Github : url.includes('gitlab.com') ? Gitlab : GitBranch;
  }
</script>

<div class="space-y-6">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">{heading}</p>
      {#if analysis}<div class="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span
            class={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[analysis.status]}`}
            >{analysis.status}</span
          ><span class="font-medium text-slate-900">{analysis.tool}</span><span
            class="inline-flex items-center gap-1"
            ><Clock class="h-3.5 w-3.5" />{new Date(analysis.createdAt).toLocaleString()}</span
          >
        </div>{/if}
    </div>
    {#if analysis?.gitInfo?.repositoryUrl}{@const ProviderIcon = providerIcon(
        analysis.gitInfo.repositoryUrl,
      )}<a
        href={analysis.gitInfo.repositoryUrl}
        target="_blank"
        rel="noreferrer noopener"
        class="inline-flex items-center gap-2 text-sm font-medium text-blue-700"
        ><svelte:component this={ProviderIcon} class="h-4 w-4" />Repositorio</a
      >{/if}
  </div>
  <div class="flex gap-1 border-b border-slate-200" role="tablist" aria-label="Vista del reporte">
    {#each [{ id: 'summary', label: 'Resumen' }, { id: 'vulnerabilities', label: 'Vulnerabilidades', count: vulnerabilities.length }, { id: 'files', label: 'Archivos', count: fileGroups.length }] as tab}<button
        type="button"
        role="tab"
        aria-selected={activeTab === tab.id}
        on:click={() => (activeTab = tab.id)}
        class={`border-b-2 px-4 py-3 text-sm font-semibold ${activeTab === tab.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
        >{tab.label}{#if tab.count !== undefined}<span
            class="ml-1 text-xs font-normal text-slate-400">{tab.count}</span
          >{/if}</button
      >{/each}
  </div>
  {#if !analysis}<div
      class="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600"
    >
      Todavía no se ha ejecutado ningún análisis.
    </div>{:else if activeTab === 'summary'}<section
      class={`rounded-[28px] border p-6 shadow-sm sm:p-8 ${riskLevel.className === 'critical' ? 'border-red-200 bg-red-50' : riskLevel.className === 'high' ? 'border-orange-200 bg-orange-50' : riskLevel.className === 'medium' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}
    >
      <div class="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Estado de seguridad
          </p>
          <h2 class="mt-2 text-2xl font-bold text-slate-950">{riskLevel.label}</h2>
          <p class="mt-1 text-sm text-slate-600">
            Puntuación calculada según la severidad de las vulnerabilidades detectadas.
          </p>
        </div>
        <div class="rounded-2xl bg-white/80 px-5 py-4 text-center shadow-sm">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Riesgo</p>
          <p class="mt-1 text-4xl font-black text-slate-950">{riskScore}</p>
          <p class="text-xs text-slate-500">puntos ponderados</p>
        </div>
      </div>
      <button
        type="button"
        on:click={() => (riskInfoModalOpen = true)}
        class="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 underline"
        ><Info class="h-4 w-4" />¿Cómo se calcula este riesgo?</button
      >
    </section>
    <div class="grid gap-4 lg:grid-cols-2">
      <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 class="font-semibold text-slate-900">Evolución del riesgo</h3>
        <div class="relative mt-4 h-72">
          {#if historyPoints.length > 0}<canvas use:setupChart aria-label="Evolución del riesgo"
            ></canvas>{:else}<div
              class="flex h-full items-center justify-center text-sm text-slate-500"
            >
              Todavía no hay historial suficiente.
            </div>{/if}
        </div>
      </section>
      <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 class="font-semibold text-slate-900">Indicadores clave</h3>
        <div class="mt-4 grid grid-cols-2 gap-3">
          {#each severityKeys as severity}<div
              class="rounded-xl border border-slate-200 bg-slate-50 p-3"
            >
              <p class="text-2xl font-bold text-slate-900">{summary?.vulnerabilities[severity]}</p>
              <p class="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {severity}
              </p>
            </div>{/each}
        </div>
        <dl class="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
          <div>
            <dt class="text-xs text-slate-500">Dependencias</dt>
            <dd class="mt-1 text-xl font-bold text-slate-900">{summary?.dependencies}</dd>
          </div>
          <div>
            <dt class="text-xs text-slate-500">Archivos afectados</dt>
            <dd class="mt-1 text-xl font-bold text-slate-900">{fileGroups.length}</dd>
          </div>
        </dl>
      </section>
    </div>{:else if activeTab === 'vulnerabilities'}<section
      class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      {#if analysis.status === 'failed' && analysis.error}<div
          class="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle class="h-4 w-4" />{analysis.error}
        </div>{:else if vulnerabilities.length === 0}<p
          class="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800"
        >
          No se han detectado vulnerabilidades en este análisis.
        </p>{:else}<div class="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row">
          <label class="relative min-w-0 flex-1"
            ><Search
              class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            /><input
              bind:value={vulnerabilityQuery}
              placeholder="Buscar CVE, paquete, título o archivo..."
              class="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
            /></label
          ><select
            bind:value={severityFilter}
            aria-label="Filtrar por severidad"
            class="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            ><option value="all">Todas las severidades</option><option value="critical"
              >Critical</option
            ><option value="high">High</option><option value="medium">Medium</option><option
              value="low">Low</option
            ></select
          >
        </div>
        <div class="divide-y divide-slate-200">
          {#each filteredVulnerabilities as finding}<details class="group py-4">
              <summary class="flex cursor-pointer list-none flex-wrap items-center gap-3"
                ><span
                  class={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${severityStyles[finding.severity]}`}
                  >{finding.severity}</span
                ><span class="font-mono text-sm font-semibold text-slate-900">{finding.id}</span
                ><span class="text-sm text-slate-600">{finding.title}</span><span
                  class="ml-auto text-xs text-slate-500">{findingStatus(finding)}</span
                ></summary
              >
              <div class="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                <p>{finding.description || finding.title}</p>
                <p class="mt-2 break-all font-mono text-xs">{finding.packagePath}</p>
                {#if finding.codeSnippet}<pre
                    class="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{finding.codeSnippet}</pre>{/if}
              </div>
            </details>{/each}
        </div>{/if}
    </section>{:else}<section
      class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <label class="relative block"
        ><Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input
          bind:value={fileQuery}
          placeholder="Buscar archivo..."
          class="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
        /></label
      >{#if filteredFileGroups.length === 0}<p class="py-8 text-center text-sm text-slate-500">
          No se han detectado vulnerabilidades asociadas a archivos.
        </p>{:else}<div class="mt-4 grid gap-4 lg:grid-cols-[minmax(16rem,0.4fr)_minmax(0,1fr)]">
          <div class="space-y-2">
            {#each filteredFileGroups as file}<button
                type="button"
                on:click={() => (selectedFilePath = file.path)}
                class={`w-full rounded-xl border p-4 text-left ${selectedFilePath === file.path ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 hover:bg-slate-50'}`}
                ><p class="truncate font-mono text-sm font-semibold">{getFileName(file.path)}</p>
                <p class="mt-2 text-xs opacity-70">
                  {file.vulnerabilities.length} hallazgos
                </p></button
              >{/each}
          </div>
          <div class="min-h-[16rem] rounded-2xl border border-slate-200 p-5">
            {#if selectedFile}<h4 class="break-all font-mono text-sm font-semibold text-slate-900">
                {selectedFile.path}
              </h4>
              {#each selectedFile.vulnerabilities as finding}<article
                  class="border-b border-slate-100 py-4"
                >
                  <p class="font-semibold text-slate-900">{finding.id}</p>
                  <p class="mt-1 text-sm text-slate-600">{finding.title}</p>
                </article>{/each}{:else}<div
                class="flex min-h-[14rem] items-center justify-center text-sm text-slate-500"
              >
                Selecciona un archivo para inspeccionar.
              </div>{/if}
          </div>
        </div>{/if}
    </section>{/if}
</div>
{#if riskInfoModalOpen}<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
    role="presentation"
    on:click={(event) => event.currentTarget === event.target && (riskInfoModalOpen = false)}
  >
    <section
      class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
      role="dialog"
      aria-modal="true"
    >
      <div class="flex items-start justify-between">
        <h2 class="text-xl font-bold text-slate-900">¿Cómo se calcula este riesgo?</h2>
        <button type="button" on:click={() => (riskInfoModalOpen = false)} aria-label="Cerrar"
          ><X class="h-5 w-5" /></button
        >
      </div>
      <p class="mt-4 text-sm leading-6 text-slate-600">
        Critical × 10, High × 6, Medium × 3 y Low × 1.
      </p>
      <p class="mt-4 rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100">
        Resultado: {riskScore} puntos
      </p>
    </section>
  </div>{/if}
