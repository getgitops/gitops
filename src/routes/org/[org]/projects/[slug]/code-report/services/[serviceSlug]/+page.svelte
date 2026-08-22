<script lang="ts">
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import {
    AlertCircle,
    ArrowLeft,
    Clock,
    GitBranch,
    Github,
    Gitlab,
    History,
    Info,
    Search,
    ShieldAlert,
    Trash2,
    Upload,
    X,
  } from 'lucide-svelte';
  import {
    extractVulnerabilities,
    summarizeAnalysisResult,
    type VulnerabilityFinding,
  } from '$lib/code-report/analysis-summary';

  type ServiceRow = {
    id: string;
    slug: string;
    name: string;
    description?: string | null;
    tags: string[];
  };

  type GitInfo = {
    repositoryUrl?: string | null;
    branch?: string | null;
    commit?: string | null;
    commitMessage?: string | null;
    author?: string | null;
  } | null;

  type AnalysisRow = {
    id: string;
    tool: string;
    status: 'in_progress' | 'completed' | 'failed';
    result: unknown;
    summary: unknown;
    error?: string | null;
    gitInfo?: GitInfo;
    createdAt: string;
    updatedAt: string;
  } | null;

  type HistoryRow = {
    id: string;
    createdAt: string;
    result: unknown;
  };

  type FileGroup = {
    path: string;
    vulnerabilities: VulnerabilityFinding[];
  };

  export let data: {
    service: ServiceRow;
    latestAnalysis: AnalysisRow;
    analysisHistory: HistoryRow[];
  };
  export let form: {
    error?: string;
    uploadError?: string;
    uploadSuccess?: boolean;
    json?: string;
  } | null;

  $: orgSlug = $page.params.org;
  $: projectSlug = $page.params.slug;
  $: servicesHref = `/org/${orgSlug}/projects/${projectSlug}/code-report/services`;
  $: historyHref = `/org/${orgSlug}/projects/${projectSlug}/code-report/history?service=${data.service.slug}`;

  $: analysisSummary = data.latestAnalysis
    ? summarizeAnalysisResult(data.latestAnalysis.result)
    : null;
  $: historyPoints = data.analysisHistory
    .slice()
    .reverse()
    .map((analysis) => ({
      date: new Date(analysis.createdAt).toLocaleDateString(),
      summary: summarizeAnalysisResult(analysis.result),
    }));
  $: currentRiskScore = analysisSummary ? calculateRiskScore(analysisSummary) : 0;
  $: currentRiskLevel = getRiskLevel(analysisSummary, currentRiskScore);
  $: vulnerabilities = data.latestAnalysis
    ? extractVulnerabilities(data.latestAnalysis.result)
    : [];
  $: fileGroups = groupVulnerabilitiesByFile(vulnerabilities);
  $: selectedFile = fileGroups.find((file) => file.path === selectedFilePath) ?? null;

  let activeReportTab = 'summary';
  let riskInfoModalOpen = false;
  let selectedFilePath = '';
  let fileQuery = '';
  let vulnerabilityQuery = '';
  let severityFilter = 'all';

  const riskWeights = { critical: 10, high: 6, medium: 3, low: 1 };

  function calculateRiskScore(summary: NonNullable<typeof analysisSummary>) {
    return (
      summary.vulnerabilities.critical * riskWeights.critical +
      summary.vulnerabilities.high * riskWeights.high +
      summary.vulnerabilities.medium * riskWeights.medium +
      summary.vulnerabilities.low * riskWeights.low
    );
  }

  function getRiskLevel(summary: NonNullable<typeof analysisSummary> | null, score: number) {
    if (!summary || score === 0) return { label: 'Sin riesgo', className: 'safe' };
    if (summary.vulnerabilities.critical > 0 || score >= 40) {
      return { label: 'Riesgo crítico', className: 'critical' };
    }
    if (score >= 20) return { label: 'Riesgo alto', className: 'high' };
    if (score >= 8) return { label: 'Riesgo medio', className: 'medium' };
    return { label: 'Riesgo bajo', className: 'low' };
  }

  function setupRiskChart(canvas: HTMLCanvasElement) {
    let disposed = false;
    let chart: { destroy: () => void } | null = null;

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
              pointRadius: 4,
              pointHoverRadius: 6,
            },
            {
              label: 'Vulnerabilidades',
              data: historyPoints.map((point) => point.summary.totalVulnerabilities),
              borderColor: '#2457ff',
              backgroundColor: 'transparent',
              fill: false,
              tension: 0.35,
              pointRadius: 4,
              pointHoverRadius: 6,
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
      destroy() {
        disposed = true;
        chart?.destroy();
      },
    };
  }

  const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const fileSeverityOrder = ['critical', 'high', 'medium', 'low'] as const;

  function filterVulnerabilities(
    findings: VulnerabilityFinding[],
    queryValue: string,
    severityValue: string,
  ) {
    const query = queryValue.trim().toLowerCase();

    return findings
      .filter((vulnerability) => {
        const matchesQuery =
          !query ||
          [
            vulnerability.id,
            vulnerability.packageName,
            vulnerability.target,
            vulnerability.title,
          ].some((value) => value.toLowerCase().includes(query));
        const matchesSeverity = severityValue === 'all' || vulnerability.severity === severityValue;
        return matchesQuery && matchesSeverity;
      })
      .sort((a, b) => {
        const severityDifference =
          (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0);
        return (
          severityDifference || (b.cvssScore ?? 0) - (a.cvssScore ?? 0) || a.id.localeCompare(b.id)
        );
      });
  }

  $: filteredVulnerabilities = filterVulnerabilities(
    vulnerabilities,
    vulnerabilityQuery,
    severityFilter,
  );
  $: filteredFileGroups = fileGroups.filter((file) =>
    getFileName(file.path).toLowerCase().includes(fileQuery.trim().toLowerCase()),
  );

  function groupVulnerabilitiesByFile(findings: VulnerabilityFinding[]): FileGroup[] {
    const groups = new Map<string, VulnerabilityFinding[]>();
    for (const finding of findings) {
      const current = groups.get(finding.packagePath) ?? [];
      groups.set(finding.packagePath, [...current, finding]);
    }

    return [...groups.entries()]
      .map(([path, groupedFindings]) => ({
        path,
        vulnerabilities: filterVulnerabilities(groupedFindings, '', 'all'),
      }))
      .sort(
        (a, b) =>
          b.vulnerabilities.length - a.vulnerabilities.length || a.path.localeCompare(b.path),
      );
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

  function findingStatus(vulnerability: VulnerabilityFinding) {
    if (vulnerability.status === 'fixed' || vulnerability.fixedVersion) return 'Actualizar';
    if (vulnerability.status === 'will_not_fix') return 'Excepción';
    return vulnerability.status === 'unknown' ? 'Revisar' : 'Afectada';
  }

  function findingStatusClass(vulnerability: VulnerabilityFinding) {
    if (vulnerability.status === 'fixed' || vulnerability.fixedVersion) {
      return 'bg-emerald-50 text-emerald-700';
    }
    if (vulnerability.status === 'will_not_fix') return 'bg-slate-100 text-slate-600';
    return 'bg-red-50 text-red-700';
  }

  $: repositoryUrl = data.latestAnalysis?.gitInfo?.repositoryUrl ?? null;

  function detectGitProviderIcon(url: string) {
    const host = url.toLowerCase();
    if (host.includes('github.com')) return Github;
    if (host.includes('gitlab.com')) return Gitlab;
    return GitBranch;
  }

  $: repositoryIcon = repositoryUrl ? detectGitProviderIcon(repositoryUrl) : null;

  const statusStyles: Record<string, string> = {
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
  };

  const severityStyles = {
    critical: 'bg-red-50 text-red-700 border-red-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-slate-50 text-slate-600 border-slate-200',
    unknown: 'bg-slate-50 text-slate-600 border-slate-200',
  };

  let deleteModalOpen = false;
  let deleting = false;
  let deleteError: string | null = null;

  function openDeleteModal() {
    deleteError = null;
    deleteModalOpen = true;
  }

  function closeDeleteModal() {
    deleteModalOpen = false;
    deleteError = null;
  }

  let uploadModalOpen = false;
  let uploading = false;
  let jsonText = '';
  let fileName = '';
  let dragActive = false;
  let uploadError: string | null = null;

  function openUploadModal() {
    jsonText = '';
    fileName = '';
    uploadError = null;
    uploadModalOpen = true;
  }

  function closeUploadModal() {
    uploadModalOpen = false;
    uploadError = null;
  }

  function readFile(file: File) {
    fileName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      jsonText = String(reader.result ?? '');
    };
    reader.readAsText(file);
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) readFile(file);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragActive = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) readFile(file);
  }

  $: if (form?.uploadSuccess) {
    uploadModalOpen = false;
    jsonText = '';
  }

  $: if (form?.json !== undefined) {
    jsonText = form.json;
  }

  $: if (uploadModalOpen && form?.uploadError) {
    uploadError = form.uploadError;
  }

  $: if (deleteModalOpen && form?.error) {
    deleteError = form.error;
  }
</script>

<svelte:head>
  <title>{data.service.name} - Code Report - GitVault Suite</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between gap-3">
    <a
      href={servicesHref}
      class="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
    >
      <ArrowLeft class="h-3.5 w-3.5" />
      Volver a servicios
    </a>

    <div class="flex items-center gap-2">
      <a
        href={historyHref}
        class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <History class="h-4 w-4" />
        Ver histórico
      </a>
      <button
        type="button"
        on:click={openUploadModal}
        class="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        <Upload class="h-4 w-4" />
        Subir análisis
      </button>
      <button
        type="button"
        on:click={openDeleteModal}
        class="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
      >
        <Trash2 class="h-4 w-4" />
        Borrar servicio
      </button>
    </div>
  </div>

  <div class="flex gap-1 border-b border-slate-200" role="tablist" aria-label="Vista del reporte">
    <button
      type="button"
      role="tab"
      aria-selected={activeReportTab === 'summary'}
      on:click={() => (activeReportTab = 'summary')}
      class={`border-b-2 px-4 py-3 text-sm font-semibold transition ${activeReportTab === 'summary' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
    >
      Resumen
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={activeReportTab === 'vulnerabilities'}
      on:click={() => (activeReportTab = 'vulnerabilities')}
      class={`border-b-2 px-4 py-3 text-sm font-semibold transition ${activeReportTab === 'vulnerabilities' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
    >
      Vulnerabilidades
      <span class="ml-1 text-xs font-normal text-slate-400">{vulnerabilities.length}</span>
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={activeReportTab === 'files'}
      on:click={() => (activeReportTab = 'files')}
      class={`border-b-2 px-4 py-3 text-sm font-semibold transition ${activeReportTab === 'files' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
    >
      Archivos
      <span class="ml-1 text-xs font-normal text-slate-400">{fileGroups.length}</span>
    </button>
  </div>

  {#if activeReportTab === 'summary'}
    {#if analysisSummary}
      <section
        class={`rounded-[28px] border p-6 shadow-sm sm:p-8 ${currentRiskLevel.className === 'critical' ? 'border-red-200 bg-red-50' : currentRiskLevel.className === 'high' ? 'border-orange-200 bg-orange-50' : currentRiskLevel.className === 'medium' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}
      >
        <div class="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p class="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Estado de seguridad
            </p>
            <h2 class="mt-2 text-2xl font-bold text-slate-950">{currentRiskLevel.label}</h2>
            <p class="mt-1 max-w-2xl text-sm text-slate-600">
              {analysisSummary.vulnerabilities.critical > 0
                ? 'Hay vulnerabilidades críticas que requieren atención prioritaria.'
                : 'Puntuación calculada según la severidad de las vulnerabilidades detectadas.'}
            </p>
          </div>
          <div class="shrink-0 rounded-2xl bg-white/80 px-5 py-4 text-center shadow-sm">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Riesgo</p>
            <p class="mt-1 text-4xl font-black text-slate-950">{currentRiskScore}</p>
            <p class="text-xs text-slate-500">puntos ponderados</p>
          </div>
        </div>
        <button
          type="button"
          on:click={() => (riskInfoModalOpen = true)}
          class="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
        >
          <Info class="h-4 w-4" />
          ¿Cómo se calcula este riesgo?
        </button>
      </section>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.8fr)]">
        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-slate-900">Evolución del riesgo</h3>
              <p class="mt-1 text-sm text-slate-500">
                {historyPoints.length} análisis completado{historyPoints.length === 1 ? '' : 's'}
              </p>
            </div>
            <span
              class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
            >
              Riesgo + vulnerabilidades
            </span>
          </div>
          <div class="relative mt-4 h-72">
            {#if historyPoints.length > 0}
              <canvas use:setupRiskChart aria-label="Evolución del riesgo del proyecto"></canvas>
            {:else}
              <div class="flex h-full items-center justify-center text-sm text-slate-500">
                Todavía no hay historial suficiente para mostrar evolución.
              </div>
            {/if}
          </div>
        </section>

        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="text-base font-semibold text-slate-900">Indicadores clave</h3>
          <div class="mt-4 grid grid-cols-2 gap-3">
            <div class="rounded-xl border border-red-200 bg-red-50 p-3">
              <p class="text-2xl font-bold text-red-700">
                {analysisSummary.vulnerabilities.critical}
              </p>
              <p class="mt-1 text-xs font-semibold uppercase tracking-wide text-red-700">
                Critical
              </p>
            </div>
            <div class="rounded-xl border border-orange-200 bg-orange-50 p-3">
              <p class="text-2xl font-bold text-orange-700">
                {analysisSummary.vulnerabilities.high}
              </p>
              <p class="mt-1 text-xs font-semibold uppercase tracking-wide text-orange-700">High</p>
            </div>
            <div class="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p class="text-2xl font-bold text-amber-700">
                {analysisSummary.vulnerabilities.medium}
              </p>
              <p class="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                Medium
              </p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p class="text-2xl font-bold text-slate-700">{analysisSummary.vulnerabilities.low}</p>
              <p class="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Low</p>
            </div>
          </div>
          <dl class="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
            <div>
              <dt class="text-xs text-slate-500">Dependencias</dt>
              <dd class="mt-1 text-xl font-bold text-slate-900">{analysisSummary.dependencies}</dd>
            </div>
            <div>
              <dt class="text-xs text-slate-500">Archivos afectados</dt>
              <dd class="mt-1 text-xl font-bold text-slate-900">{fileGroups.length}</dd>
            </div>
          </dl>
        </section>
      </div>
    {/if}

    <div class="grid gap-4 lg:grid-cols-3">
      <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Servicio</p>
        <h3 class="mt-2 text-lg font-semibold text-slate-900">{data.service.name}</h3>
        <p class="mt-1 font-mono text-xs text-slate-500">{data.service.slug}</p>
        {#if data.service.description}
          <p class="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
            {data.service.description}
          </p>
        {/if}
        {#if data.service.tags.length > 0}
          <div class="mt-3 flex flex-wrap gap-1.5">
            {#each data.service.tags as tag}
              <span
                class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
              >
                {tag}
              </span>
            {/each}
          </div>
        {/if}
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Repositorio</p>
            <h3 class="mt-2 text-base font-semibold text-slate-900">
              {repositoryUrl ? 'Repositorio conectado' : 'Sin repositorio conectado'}
            </h3>
          </div>
          {#if repositoryUrl && repositoryIcon}
            <svelte:component this={repositoryIcon} class="h-5 w-5 text-slate-500" />
          {/if}
        </div>
        {#if repositoryUrl}
          <a
            href={repositoryUrl}
            target="_blank"
            rel="noreferrer noopener"
            class="mt-3 block break-all text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            {repositoryUrl}
          </a>
        {:else}
          <p class="mt-3 text-sm text-slate-500">Este servicio no tiene repositorio configurado.</p>
        {/if}
        {#if data.latestAnalysis?.gitInfo?.branch}
          <p class="mt-3 text-xs text-slate-500">
            Rama <span class="font-mono font-semibold text-slate-700"
              >{data.latestAnalysis.gitInfo.branch}</span
            >
          </p>
        {/if}
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Ejecuciones</p>
        <h3 class="mt-2 text-lg font-semibold text-slate-900">Histórico de ejecuciones</h3>
        <p class="mt-1 text-sm text-slate-600">
          {data.analysisHistory.length} análisis completado{data.analysisHistory.length === 1
            ? ''
            : 's'}
        </p>
        {#if data.latestAnalysis}
          <p class="mt-3 text-xs text-slate-500">
            Último: <span class="font-semibold text-slate-700">{data.latestAnalysis.tool}</span>
            <span class="mx-1">·</span>
            {new Date(data.latestAnalysis.createdAt).toLocaleString()}
          </p>
        {/if}
        <a
          href={historyHref}
          class="mt-4 inline-flex text-xs font-semibold text-blue-700 hover:text-blue-900"
        >
          Ver histórico completo ↗
        </a>
      </section>
    </div>
  {/if}

  {#if activeReportTab !== 'summary'}
    <section class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h3 class="text-lg font-semibold text-slate-900">Último análisis</h3>

      {#if !data.latestAnalysis}
        <p class="mt-3 text-sm text-slate-600">Todavía no se ha ejecutado ningún análisis.</p>
      {:else}
        <div class="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span
            class={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[data.latestAnalysis.status]}`}
          >
            {data.latestAnalysis.status}
          </span>
          <span class="font-medium text-slate-900">{data.latestAnalysis.tool}</span>
          <span class="inline-flex items-center gap-1 text-slate-500">
            <Clock class="h-3.5 w-3.5" />
            {new Date(data.latestAnalysis.createdAt).toLocaleString()}
          </span>
        </div>

        {#if data.latestAnalysis.gitInfo}
          <div class="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <GitBranch class="h-3.5 w-3.5" />
            {#if data.latestAnalysis.gitInfo.repositoryUrl}
              <span>{data.latestAnalysis.gitInfo.repositoryUrl}</span>
            {/if}
            {#if data.latestAnalysis.gitInfo.branch}
              <span>@ {data.latestAnalysis.gitInfo.branch}</span>
            {/if}
            {#if data.latestAnalysis.gitInfo.commit}
              <span class="font-mono">{data.latestAnalysis.gitInfo.commit.slice(0, 7)}</span>
            {/if}
          </div>
        {/if}

        {#if activeReportTab === 'vulnerabilities'}
          {#if data.latestAnalysis.status === 'failed' && data.latestAnalysis.error}
            <div
              class="mt-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
              <span>{data.latestAnalysis.error}</span>
            </div>
          {:else if vulnerabilities.length > 0}
            <div class="mt-6 overflow-hidden rounded-2xl border border-slate-200">
              <div
                class="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-4 lg:flex-row"
              >
                <label class="relative min-w-0 flex-1">
                  <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <span class="sr-only">Buscar vulnerabilidades</span>
                  <input
                    bind:value={vulnerabilityQuery}
                    placeholder="Buscar CVE, paquete, título o archivo..."
                    class="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                  />
                </label>
                <select
                  bind:value={severityFilter}
                  aria-label="Filtrar por severidad"
                  class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                >
                  <option value="all">Todas las severidades</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div class="flex items-center justify-between px-4 py-3 text-xs text-slate-500">
                <span>
                  Mostrando <strong class="text-slate-900">{filteredVulnerabilities.length}</strong>
                  de
                  {vulnerabilities.length} CVEs
                </span>
                <span class="hidden sm:inline">Ordenado por severidad y CVSS</span>
              </div>

              {#if filteredVulnerabilities.length === 0}
                <p class="border-t border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                  No hay vulnerabilidades que coincidan con esos filtros.
                </p>
              {:else}
                <div class="divide-y divide-slate-200">
                  {#each filteredVulnerabilities as vulnerability, index (vulnerability.id + vulnerability.target + vulnerability.packageName + vulnerability.installedVersion + index)}
                    <details class="group bg-white">
                      <summary
                        class="grid cursor-pointer list-none gap-3 px-4 py-4 text-left transition hover:bg-slate-50 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.4fr)_auto_auto_auto_auto] lg:items-center [&::-webkit-details-marker]:hidden"
                      >
                        <div class="min-w-0">
                          <div class="flex flex-wrap items-center gap-2">
                            <span
                              class={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase ${severityStyles[vulnerability.severity]}`}
                            >
                              {vulnerability.severity}
                            </span>
                            <span class="font-mono text-sm font-semibold text-slate-900"
                              >{vulnerability.id}</span
                            >
                          </div>
                          <p class="mt-1 truncate text-sm text-slate-600">{vulnerability.title}</p>
                        </div>
                        <div class="min-w-0 text-xs">
                          <p class="truncate font-semibold text-slate-800">
                            {vulnerability.packageName}
                          </p>
                          <p class="mt-1 truncate text-slate-500">{vulnerability.target}</p>
                        </div>
                        <span class="font-mono text-xs text-slate-500"
                          >{vulnerability.installedVersion}</span
                        >
                        <span
                          class={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${findingStatusClass(vulnerability)}`}
                        >
                          {findingStatus(vulnerability)}
                        </span>
                        <span class="text-xs font-semibold text-slate-500">
                          {vulnerability.cvssScore !== null
                            ? `CVSS ${vulnerability.cvssScore.toFixed(1)}`
                            : 'Sin CVSS'}
                        </span>
                        <a
                          href={vulnerability.cveUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          on:click|stopPropagation
                          class="text-xs font-semibold text-blue-700 hover:text-blue-900"
                        >
                          CVE ↗
                        </a>
                      </summary>

                      <div class="border-t border-slate-100 bg-slate-50 px-4 py-4 text-sm">
                        <div class="grid gap-4 lg:grid-cols-[1fr_auto]">
                          <div>
                            <p class="font-semibold text-slate-900">Por qué no cumple</p>
                            <p class="mt-1 leading-6 text-slate-600">
                              {vulnerability.description || vulnerability.title}
                            </p>
                            <div class="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                              <p
                                class="text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                              >
                                Ubicación detectada
                              </p>
                              <p class="mt-1 break-all font-mono text-xs text-slate-800">
                                {vulnerability.packagePath}
                              </p>
                              {#if vulnerability.packageIdentifier}
                                <p class="mt-1 break-all text-xs text-slate-500">
                                  Identificador: {vulnerability.packageIdentifier}
                                </p>
                              {/if}
                              {#if vulnerability.lineStart !== null}
                                <p class="mt-2 text-xs font-semibold text-slate-700">
                                  Línea{vulnerability.lineEnd !== null &&
                                  vulnerability.lineEnd !== vulnerability.lineStart
                                    ? `s ${vulnerability.lineStart}-${vulnerability.lineEnd}`
                                    : ` ${vulnerability.lineStart}`}
                                </p>
                              {:else}
                                <p class="mt-2 text-xs text-slate-500">
                                  Este informe no incluye línea ni fragmento de código.
                                </p>
                              {/if}
                              {#if vulnerability.codeSnippet}
                                <pre
                                  class="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">{vulnerability.codeSnippet}</pre>
                              {/if}
                            </div>
                          </div>
                          <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-xs lg:min-w-64">
                            <div>
                              <dt class="text-slate-500">Versión instalada</dt>
                              <dd class="mt-0.5 font-mono font-semibold text-red-700">
                                {vulnerability.installedVersion}
                              </dd>
                            </div>
                            <div>
                              <dt class="text-slate-500">Versión corregida</dt>
                              <dd class="mt-0.5 font-mono font-semibold text-emerald-700">
                                {vulnerability.fixedVersion || 'No indicada'}
                              </dd>
                            </div>
                            <div>
                              <dt class="text-slate-500">CWE</dt>
                              <dd class="mt-0.5 font-semibold text-slate-800">
                                {vulnerability.cweIds.length > 0
                                  ? vulnerability.cweIds.join(', ')
                                  : 'No indicado'}
                              </dd>
                            </div>
                            <div>
                              <dt class="text-slate-500">Estado Trivy</dt>
                              <dd class="mt-0.5 font-semibold text-slate-800">
                                {vulnerability.status}
                              </dd>
                            </div>
                          </dl>
                        </div>
                        <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                          <a
                            href={vulnerability.cveUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            class="inline-flex text-xs font-semibold text-blue-700 hover:text-blue-900"
                          >
                            Abrir {vulnerability.id} en NVD <span aria-hidden="true">&nbsp;↗</span>
                          </a>
                          {#if vulnerability.primaryUrl}
                            <a
                              href={vulnerability.primaryUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              class="mt-4 inline-flex text-xs font-semibold text-blue-700 hover:text-blue-900"
                            >
                              Ver advisory de {vulnerability.id}
                              <span aria-hidden="true">&nbsp;↗</span>
                            </a>
                          {/if}
                        </div>
                      </div>
                    </details>
                  {/each}
                </div>
              {/if}
            </div>
          {:else}
            <div
              class="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800"
            >
              No se han detectado vulnerabilidades en este análisis.
            </div>
          {/if}
        {:else if activeReportTab === 'files'}
          {#if fileGroups.length === 0}
            <div
              class="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800"
            >
              No se han detectado vulnerabilidades asociadas a archivos.
            </div>
          {:else}
            <div class="mt-6 grid gap-4 lg:grid-cols-[minmax(20rem,0.42fr)_minmax(0,1fr)]">
              <aside
                class="rounded-2xl border border-slate-200 bg-slate-50 p-2"
                aria-label="Archivos"
              >
                <div class="px-3 py-3">
                  <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Archivos
                  </p>
                  <p class="mt-1 text-xs text-slate-500">
                    {fileGroups.length} archivos con hallazgos
                  </p>
                  <label class="relative mt-4 block">
                    <Search
                      class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    />
                    <span class="sr-only">Buscar archivos</span>
                    <input
                      bind:value={fileQuery}
                      placeholder="Buscar archivo..."
                      class="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                    />
                  </label>
                </div>
                <div class="max-h-[34rem] space-y-1 overflow-y-auto">
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
                          {@const severityCount = countSeverity(file.vulnerabilities, severity)}
                          {#if severityCount > 0}
                            <span
                              class={`rounded-md px-2 py-1 text-[11px] font-semibold ${selectedFilePath === file.path ? 'bg-white/15 text-white' : severityStyles[severity]}`}
                            >
                              {severityLabel(severity)}
                              {severityCount}
                            </span>
                          {/if}
                        {/each}
                      </div>
                      <p
                        class={`mt-3 text-xs ${selectedFilePath === file.path ? 'text-slate-300' : 'text-slate-500'}`}
                      >
                        {file.vulnerabilities.length} CVE{file.vulnerabilities.length === 1
                          ? ''
                          : 's'}
                      </p>
                    </button>
                  {/each}
                  {#if filteredFileGroups.length === 0}
                    <p class="px-3 py-6 text-center text-xs text-slate-500">
                      No hay archivos que coincidan con la búsqueda.
                    </p>
                  {/if}
                </div>
              </aside>

              <section class="min-h-[20rem] rounded-2xl border border-slate-200 bg-white">
                {#if !selectedFile}
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
                {:else}
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
                    {#each selectedFile.vulnerabilities as vulnerability, vulnerabilityIndex (vulnerability.id + vulnerability.packageName + vulnerability.installedVersion + vulnerabilityIndex)}
                      <article class="py-4">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                          <div class="flex flex-wrap items-center gap-2">
                            <span
                              class={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${severityStyles[vulnerability.severity]}`}
                            >
                              {vulnerability.severity}
                            </span>
                            <span class="font-mono text-sm font-semibold text-slate-900">
                              {vulnerability.id}
                            </span>
                          </div>
                          <a
                            href={vulnerability.cveUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            class="text-xs font-semibold text-blue-700 hover:text-blue-900"
                          >
                            Ver CVE ↗
                          </a>
                        </div>
                        <p class="mt-2 text-sm font-medium text-slate-800">
                          {vulnerability.packageName}
                        </p>
                        <p class="mt-1 text-xs text-slate-500">
                          {vulnerability.installedVersion} → {vulnerability.fixedVersion ||
                            'Sin versión corregida'}
                        </p>
                        <p class="mt-2 text-sm leading-6 text-slate-600">
                          {vulnerability.description || vulnerability.title}
                        </p>
                        {#if vulnerability.lineStart !== null || vulnerability.codeSnippet}
                          <div class="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                            {#if vulnerability.lineStart !== null}
                              <p class="font-semibold text-slate-800">
                                Línea{vulnerability.lineEnd !== null &&
                                vulnerability.lineEnd !== vulnerability.lineStart
                                  ? `s ${vulnerability.lineStart}-${vulnerability.lineEnd}`
                                  : ` ${vulnerability.lineStart}`}
                              </p>
                            {/if}
                            {#if vulnerability.codeSnippet}
                              <pre
                                class="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-3 leading-5 text-slate-100">{vulnerability.codeSnippet}</pre>
                            {/if}
                          </div>
                        {/if}
                      </article>
                    {/each}
                  </div>
                {/if}
              </section>
            </div>
          {/if}
        {/if}
      {/if}
    </section>
  {/if}
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
            {analysisSummary?.vulnerabilities.critical ?? 0} detectadas
          </p>
        </div>
        <div class="rounded-xl border border-orange-200 bg-orange-50 p-3">
          <p class="text-sm font-bold text-orange-700">High × 6</p>
          <p class="mt-1 text-xs text-orange-700">
            {analysisSummary?.vulnerabilities.high ?? 0} detectadas
          </p>
        </div>
        <div class="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p class="text-sm font-bold text-amber-700">Medium × 3</p>
          <p class="mt-1 text-xs text-amber-700">
            {analysisSummary?.vulnerabilities.medium ?? 0} detectadas
          </p>
        </div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p class="text-sm font-bold text-slate-700">Low × 1</p>
          <p class="mt-1 text-xs text-slate-600">
            {analysisSummary?.vulnerabilities.low ?? 0} detectadas
          </p>
        </div>
      </div>

      <div class="mt-5 border-t border-slate-100 pt-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Fórmula aplicada</p>
        <p class="mt-2 rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100">
          (Critical × 10) + (High × 6) + (Medium × 3) + (Low × 1) = {currentRiskScore} puntos
        </p>
        <p class="mt-3 text-xs leading-5 text-slate-500">
          Riesgo bajo: 1-7 · medio: 8-19 · alto: 20-39 · crítico: 40+ o cualquier Critical.
        </p>
      </div>
    </section>
  </div>
{/if}

{#if deleteModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
    <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <div class="flex items-start justify-between">
        <h3 class="text-lg font-semibold text-slate-900">Borrar servicio</h3>
        <button
          type="button"
          on:click={closeDeleteModal}
          class="text-slate-400 hover:text-slate-600"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <p class="mt-3 text-sm text-slate-600">
        Vas a borrar <span class="font-semibold text-slate-900">{data.service.name}</span> y
        <span class="font-semibold text-slate-900">todos sus análisis</span>. Esta acción no se
        puede deshacer.
      </p>

      {#if deleteError}
        <p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>
      {/if}

      <form
        method="POST"
        action="?/deleteService"
        use:enhance={() => {
          deleting = true;
          return async ({ update }) => {
            await update();
            deleting = false;
          };
        }}
        class="mt-5 flex justify-end gap-2"
      >
        <button
          type="button"
          on:click={closeDeleteModal}
          class="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={deleting}
          class="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
        >
          {deleting ? 'Borrando...' : 'Borrar servicio y análisis'}
        </button>
      </form>
    </div>
  </div>
{/if}

{#if uploadModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
    <div class="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
      <div class="flex items-start justify-between">
        <h3 class="text-lg font-semibold text-slate-900">Subir análisis</h3>
        <button
          type="button"
          on:click={closeUploadModal}
          class="text-slate-400 hover:text-slate-600"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <form
        method="POST"
        action="?/uploadAnalysis"
        use:enhance={() => {
          uploading = true;
          return async ({ update }) => {
            await update();
            uploading = false;
          };
        }}
        class="mt-4 space-y-4"
      >
        {#if uploadError}
          <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{uploadError}</p>
        {/if}

        <label
          for="analysis-file"
          class={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition ${dragActive ? 'border-slate-400 bg-slate-50' : 'border-slate-200'}`}
          on:dragover|preventDefault={() => (dragActive = true)}
          on:dragleave|preventDefault={() => (dragActive = false)}
          on:drop={handleDrop}
        >
          <Upload class="h-6 w-6 text-slate-400" />
          <span class="text-sm font-medium text-slate-700">
            Selecciona o arrastra un archivo JSON aquí
          </span>
          {#if fileName}
            <span class="text-xs text-slate-500">{fileName}</span>
          {/if}
          <input
            id="analysis-file"
            type="file"
            accept="application/json,.json"
            on:change={handleFileSelect}
            class="hidden"
          />
        </label>

        <input type="hidden" name="json" value={jsonText} />

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            on:click={closeUploadModal}
            class="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={uploading || !jsonText.trim()}
            class="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {uploading ? 'Subiendo...' : 'Subir análisis'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
