<script lang="ts">
  import { onDestroy } from 'svelte';
  import { AlertCircle, GitBranch, Github, Gitlab, Info, Search, X } from 'lucide-svelte';
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
  type ServiceData = {
    name: string;
    slug: string;
    description?: string | null;
    tags?: string[];
  } | null;

  export let analysis: Analysis;
  export let analysisHistory: AnalysisData[] = [];
  export let service: ServiceData = null;
  let activeTab = 'summary';
  let riskInfoModalOpen = false;
  let fileQuery = '';
  let vulnerabilityQuery = '';
  let severityFilter = 'all';
  let selectedFilePath = '';
  let chart: { destroy: () => void } | null = null;
  const riskWeights = { critical: 10, high: 6, medium: 3, low: 1 };
  const severityStyles: Record<string, string> = {
    critical: 'bg-red-50 text-red-700 border-red-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-slate-50 text-slate-600 border-slate-200',
    unknown: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const severityKeys = ['critical', 'high', 'medium', 'low', 'unknown'] as const;
  const fileSeverityOrder = ['critical', 'high', 'medium', 'low'] as const;
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
  $: riskScore = summary ? calculateRiskScore(summary) : 0;
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
  function countSeverity(findings: VulnerabilityFinding[], severity: string) {
    return findings.filter((finding) => finding.severity === severity).length;
  }
  function severityLabel(severity: string) {
    return severity.charAt(0).toUpperCase() + severity.slice(1);
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
    <div class="grid gap-4 lg:grid-cols-3">
      <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Información del servicio
        </p>
        {#if service}
          <h3 class="mt-2 text-lg font-semibold text-slate-900">{service.name}</h3>
          <p class="mt-1 font-mono text-xs text-slate-500">{service.slug}</p>
          {#if service.description}
            <p class="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{service.description}</p>
          {/if}
          {#if service.tags && service.tags.length > 0}
            <div class="mt-3 flex flex-wrap gap-1.5">
              {#each service.tags as tag}
                <span
                  class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                >
                  {tag}
                </span>
              {/each}
            </div>
          {/if}
        {:else}
          <p class="mt-3 text-sm text-slate-500">Información no disponible.</p>
        {/if}
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Información del repositorio
            </p>
            <h3 class="mt-2 text-base font-semibold text-slate-900">
              {analysis?.gitInfo?.repositoryUrl
                ? 'Repositorio conectado'
                : 'Sin repositorio conectado'}
            </h3>
          </div>
          {#if analysis?.gitInfo?.repositoryUrl}
            {@const ProviderIcon = providerIcon(analysis.gitInfo.repositoryUrl)}
            <svelte:component this={ProviderIcon} class="h-5 w-5 text-slate-500" />
          {/if}
        </div>
        {#if analysis?.gitInfo?.repositoryUrl}
          <a
            href={analysis.gitInfo.repositoryUrl}
            target="_blank"
            rel="noreferrer noopener"
            class="mt-3 block break-all text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            {analysis.gitInfo.repositoryUrl}
          </a>
        {:else}
          <p class="mt-3 text-sm text-slate-500">
            Este análisis no incluye un repositorio configurado.
          </p>
        {/if}
        {#if analysis?.gitInfo?.branch}
          <p class="mt-3 text-xs text-slate-500">
            Rama <span class="font-mono font-semibold text-slate-700"
              >{analysis.gitInfo.branch}</span
            >
          </p>
        {/if}
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Histórico de ejecuciones
        </p>
        <h3 class="mt-2 text-lg font-semibold text-slate-900">
          {analysisHistory.length} análisis completado{analysisHistory.length === 1 ? '' : 's'}
        </h3>
        {#if analysis}
          <p class="mt-3 text-xs text-slate-500">
            Último: <span class="font-semibold text-slate-700">{analysis.tool}</span>
            <span class="mx-1">·</span>{new Date(analysis.createdAt).toLocaleString()}
          </p>
        {/if}
      </section>
    </div>
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
          {#each filteredVulnerabilities as finding, index (finding.id + finding.target + finding.packageName + index)}
            <details class="group py-4">
              <summary class="flex cursor-pointer list-none flex-wrap items-center gap-3">
                <span
                  class={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${severityStyles[finding.severity]}`}
                >
                  {finding.severity}
                </span>
                <span class="font-mono text-sm font-semibold text-slate-900">{finding.id}</span>
                <span class="text-sm text-slate-600">{finding.title}</span>
                <span class="ml-auto text-xs text-slate-500">{findingStatus(finding)}</span>
                <span class="text-xs font-semibold text-slate-500">
                  {finding.cvssScore !== null ? `CVSS ${finding.cvssScore.toFixed(1)}` : 'Sin CVSS'}
                </span>
                <a
                  href={finding.cveUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  on:click|stopPropagation
                  class="text-xs font-semibold text-blue-700 hover:text-blue-900"
                >
                  CVE ↗
                </a>
              </summary>
              <div class="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                <p>{finding.description || finding.title}</p>
                <div class="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                  <div class="rounded-xl border border-slate-200 bg-white p-3">
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Ubicación detectada
                    </p>
                    <p class="mt-1 break-all font-mono text-xs text-slate-800">
                      {finding.packagePath}
                    </p>
                    {#if finding.packageIdentifier}
                      <p class="mt-1 break-all text-xs text-slate-500">
                        Identificador: {finding.packageIdentifier}
                      </p>
                    {/if}
                    {#if finding.lineStart !== null}
                      <p class="mt-2 text-xs font-semibold text-slate-700">
                        Línea{finding.lineEnd !== null && finding.lineEnd !== finding.lineStart
                          ? `s ${finding.lineStart}-${finding.lineEnd}`
                          : ` ${finding.lineStart}`}
                      </p>
                    {:else}
                      <p class="mt-2 text-xs text-slate-500">
                        Este informe no incluye línea ni fragmento de código.
                      </p>
                    {/if}
                    {#if finding.codeSnippet}
                      <pre
                        class="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{finding.codeSnippet}</pre>
                    {/if}
                  </div>
                  <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-xs lg:min-w-64">
                    <div>
                      <dt class="text-slate-500">Paquete</dt>
                      <dd class="mt-0.5 font-semibold text-slate-800">{finding.packageName}</dd>
                    </div>
                    <div>
                      <dt class="text-slate-500">Estado Trivy</dt>
                      <dd class="mt-0.5 font-semibold text-slate-800">{finding.status}</dd>
                    </div>
                    <div>
                      <dt class="text-slate-500">Versión instalada</dt>
                      <dd class="mt-0.5 font-mono font-semibold text-red-700">
                        {finding.installedVersion}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-slate-500">Versión corregida</dt>
                      <dd class="mt-0.5 font-mono font-semibold text-emerald-700">
                        {finding.fixedVersion || 'No indicada'}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-slate-500">CWE</dt>
                      <dd class="mt-0.5 font-semibold text-slate-800">
                        {finding.cweIds.length > 0 ? finding.cweIds.join(', ') : 'No indicado'}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div class="mt-4 flex flex-wrap gap-4">
                  <a
                    href={finding.cveUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    class="text-xs font-semibold text-blue-700 hover:text-blue-900"
                  >
                    Abrir {finding.id} en NVD ↗
                  </a>
                  {#if finding.primaryUrl}
                    <a
                      href={finding.primaryUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      class="text-xs font-semibold text-blue-700 hover:text-blue-900"
                    >
                      Ver advisory ↗
                    </a>
                  {/if}
                </div>
              </div>
            </details>
          {/each}
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
          <aside class="rounded-2xl border border-slate-200 bg-slate-50 p-2" aria-label="Archivos">
            <div class="px-3 py-3">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Archivos</p>
              <p class="mt-1 text-xs text-slate-500">{fileGroups.length} archivos con hallazgos</p>
            </div>
            <div class="max-h-[34rem] space-y-2 overflow-y-auto">
              {#each filteredFileGroups as file, index (file.path + index)}
                <button
                  type="button"
                  on:click={() => (selectedFilePath = file.path)}
                  aria-pressed={selectedFilePath === file.path}
                  title={file.path}
                  class={`w-full rounded-xl border p-4 text-left shadow-sm transition ${selectedFilePath === file.path ? 'border-slate-900 bg-slate-900 text-white shadow-md' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:shadow-md'}`}
                >
                  <p class="truncate font-mono text-sm font-semibold" title={file.path}>
                    {getFileName(file.path)}
                  </p>
                  <div class="mt-3 flex flex-wrap gap-1.5">
                    {#each fileSeverityOrder as severity}
                      {@const count = countSeverity(file.vulnerabilities, severity)}
                      {#if count > 0}
                        <span
                          class={`rounded-md px-2 py-1 text-[11px] font-semibold ${selectedFilePath === file.path ? 'bg-white/15 text-white' : severityStyles[severity]}`}
                        >
                          {severityLabel(severity)}
                          {count}
                        </span>
                      {/if}
                    {/each}
                  </div>
                  <p
                    class={`mt-3 text-xs ${selectedFilePath === file.path ? 'text-slate-300' : 'text-slate-500'}`}
                  >
                    {file.vulnerabilities.length} CVE{file.vulnerabilities.length === 1 ? '' : 's'}
                  </p>
                </button>
              {/each}
            </div>
          </aside>
          <div class="min-h-[20rem] rounded-2xl border border-slate-200 bg-white">
            {#if selectedFile}
              <div class="border-b border-slate-200 p-5">
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Archivo seleccionado
                </p>
                <h4 class="mt-1 break-all font-mono text-sm font-semibold text-slate-900">
                  {selectedFile.path}
                </h4>
                <p class="mt-2 text-sm text-slate-500">
                  {selectedFile.vulnerabilities.length} vulnerabilidades detectadas en este archivo
                </p>
              </div>
              <div class="divide-y divide-slate-100 px-5">
                {#each selectedFile.vulnerabilities as finding, index (finding.id + finding.packageName + finding.installedVersion + index)}
                  <article class="py-4">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <span
                          class={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${severityStyles[finding.severity]}`}
                          >{finding.severity}</span
                        >
                        <span class="font-mono text-sm font-semibold text-slate-900"
                          >{finding.id}</span
                        >
                      </div>
                      <a
                        href={finding.cveUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        class="text-xs font-semibold text-blue-700 hover:text-blue-900">Ver CVE ↗</a
                      >
                    </div>
                    <p class="mt-2 text-sm font-medium text-slate-800">{finding.packageName}</p>
                    <p class="mt-1 text-xs text-slate-500">
                      {finding.installedVersion} → {finding.fixedVersion || 'Sin versión corregida'}
                    </p>
                    <p class="mt-2 text-sm leading-6 text-slate-600">
                      {finding.description || finding.title}
                    </p>
                    <div
                      class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
                    >
                      {#if finding.lineStart !== null}
                        <p class="font-semibold text-slate-800">
                          Línea{finding.lineEnd !== null && finding.lineEnd !== finding.lineStart
                            ? `s ${finding.lineStart}-${finding.lineEnd}`
                            : ` ${finding.lineStart}`}
                        </p>
                      {:else}
                        <p>Este informe no incluye línea ni fragmento de código.</p>
                      {/if}
                      {#if finding.codeSnippet}<pre
                          class="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-3 leading-5 text-slate-100">{finding.codeSnippet}</pre>{/if}
                    </div>
                    <div class="mt-3 flex flex-wrap gap-4 text-xs">
                      <span class="text-slate-500"
                        >CWE: {finding.cweIds.length > 0
                          ? finding.cweIds.join(', ')
                          : 'No indicado'}</span
                      >
                      {#if finding.primaryUrl}<a
                          href={finding.primaryUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          class="font-semibold text-blue-700 hover:text-blue-900">Ver advisory ↗</a
                        >{/if}
                    </div>
                  </article>
                {/each}
              </div>
            {:else}
              <div class="flex min-h-[20rem] items-center justify-center p-8 text-center">
                <div>
                  <p class="text-base font-semibold text-slate-900">
                    Selecciona un archivo para inspeccionar
                  </p>
                  <p class="mt-1 text-sm text-slate-500">
                    Elige un archivo del listado para ver sus vulnerabilidades.
                  </p>
                </div>
              </div>
            {/if}
          </div>
        </div>{/if}
    </section>{/if}
</div>
{#if riskInfoModalOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
    role="presentation"
    on:click={(event) => event.currentTarget === event.target && (riskInfoModalOpen = false)}
  >
    <section
      class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="risk-info-title"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Método de evaluación
          </p>
          <h2 id="risk-info-title" class="mt-1 text-xl font-bold text-slate-900">
            ¿Cómo se calcula este riesgo?
          </h2>
        </div>
        <button
          type="button"
          on:click={() => (riskInfoModalOpen = false)}
          aria-label="Cerrar información del riesgo"
          class="text-slate-400 hover:text-slate-700"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <p class="mt-4 text-sm leading-6 text-slate-600">
        La puntuación suma el peso de cada vulnerabilidad encontrada en el último análisis. Cuanto
        mayor sea el resultado, mayor es la prioridad de remediación.
      </p>

      <div class="mt-5 grid grid-cols-2 gap-2">
        <div class="rounded-xl border border-red-200 bg-red-50 p-3">
          <p class="text-sm font-bold text-red-700">Critical × 10</p>
          <p class="mt-1 text-xs text-red-700">
            {summary?.vulnerabilities.critical ?? 0} detectadas
          </p>
        </div>
        <div class="rounded-xl border border-orange-200 bg-orange-50 p-3">
          <p class="text-sm font-bold text-orange-700">High × 6</p>
          <p class="mt-1 text-xs text-orange-700">
            {summary?.vulnerabilities.high ?? 0} detectadas
          </p>
        </div>
        <div class="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p class="text-sm font-bold text-amber-700">Medium × 3</p>
          <p class="mt-1 text-xs text-amber-700">
            {summary?.vulnerabilities.medium ?? 0} detectadas
          </p>
        </div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p class="text-sm font-bold text-slate-700">Low × 1</p>
          <p class="mt-1 text-xs text-slate-600">
            {summary?.vulnerabilities.low ?? 0} detectadas
          </p>
        </div>
      </div>

      <div class="mt-5 border-t border-slate-100 pt-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Fórmula aplicada</p>
        <p class="mt-2 rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100">
          (Critical × 10) + (High × 6) + (Medium × 3) + (Low × 1) = {riskScore} puntos
        </p>
        <p class="mt-3 text-xs leading-5 text-slate-500">
          Riesgo bajo: 1-7 · medio: 8-19 · alto: 20-39 · crítico: 40+ o cualquier Critical.
        </p>
      </div>
    </section>
  </div>
{/if}
