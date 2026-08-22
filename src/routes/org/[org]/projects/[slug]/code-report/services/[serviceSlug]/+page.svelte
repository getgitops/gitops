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

  export let data: { service: ServiceRow; latestAnalysis: AnalysisRow };
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
  $: vulnerabilities = data.latestAnalysis
    ? extractVulnerabilities(data.latestAnalysis.result)
    : [];

  let vulnerabilityQuery = '';
  let severityFilter = 'all';

  const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

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

  <div class="grid gap-4 lg:grid-cols-3">
    <section class="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 class="text-base font-semibold text-slate-900">{data.service.name}</h2>
      <p class="mt-2 text-sm text-slate-600">
        <span class="font-medium text-slate-900">Slug:</span>
        {data.service.slug}
      </p>
      {#if data.service.description}
        <p class="mt-2 text-sm font-medium text-slate-900">Description</p>
        <p class="mt-0.5 line-clamp-3 text-sm leading-6 text-slate-600">
          {data.service.description}
        </p>
      {/if}
      {#if data.service.tags.length > 0}
        <div class="mt-3 flex flex-wrap gap-1.5">
          {#each data.service.tags as tag}
            <span
              class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
            >
              {tag}
            </span>
          {/each}
        </div>
      {/if}

      {#if repositoryUrl && repositoryIcon}
        <a
          href={repositoryUrl}
          target="_blank"
          rel="noreferrer noopener"
          title={repositoryUrl}
          class="absolute bottom-4 right-4 text-slate-400 hover:text-slate-900"
        >
          <svelte:component this={repositoryIcon} class="h-5 w-5" />
        </a>
      {/if}
    </section>

    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 class="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <ShieldAlert class="h-4 w-4" />
        Vulnerabilidades detectadas
      </h3>
      {#if analysisSummary}
        <div class="mt-3 grid grid-cols-2 gap-2">
          <div class={`rounded-xl border px-3 py-2 ${severityStyles.critical}`}>
            <p class="text-xl font-bold">{analysisSummary.vulnerabilities.critical}</p>
            <p class="text-[11px] font-medium uppercase tracking-wide">Critical</p>
          </div>
          <div class={`rounded-xl border px-3 py-2 ${severityStyles.high}`}>
            <p class="text-xl font-bold">{analysisSummary.vulnerabilities.high}</p>
            <p class="text-[11px] font-medium uppercase tracking-wide">High</p>
          </div>
          <div class={`rounded-xl border px-3 py-2 ${severityStyles.medium}`}>
            <p class="text-xl font-bold">{analysisSummary.vulnerabilities.medium}</p>
            <p class="text-[11px] font-medium uppercase tracking-wide">Medium</p>
          </div>
          <div class={`rounded-xl border px-3 py-2 ${severityStyles.low}`}>
            <p class="text-xl font-bold">{analysisSummary.vulnerabilities.low}</p>
            <p class="text-[11px] font-medium uppercase tracking-wide">Low</p>
          </div>
        </div>
      {:else}
        <p class="mt-3 text-sm text-slate-500">Sin datos todavía.</p>
      {/if}
    </section>

    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 class="text-sm font-semibold text-slate-900">Resumen</h3>
      {#if analysisSummary}
        <dl class="mt-3 grid grid-cols-2 gap-3">
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Total vulnerabilidades
            </dt>
            <dd class="text-lg font-bold text-slate-900">
              {analysisSummary.totalVulnerabilities}
            </dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Secretos expuestos
            </dt>
            <dd class="text-lg font-bold text-slate-900">{analysisSummary.exposedSecrets}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Dependencias
            </dt>
            <dd class="text-lg font-bold text-slate-900">{analysisSummary.dependencies}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Archivos analizados
            </dt>
            <dd class="text-lg font-bold text-slate-900">{analysisSummary.targetsScanned}</dd>
          </div>
        </dl>
      {:else}
        <p class="mt-3 text-sm text-slate-500">Sin datos todavía.</p>
      {/if}
    </section>
  </div>

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

      {#if data.latestAnalysis.status === 'failed' && data.latestAnalysis.error}
        <div
          class="mt-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
          <span>{data.latestAnalysis.error}</span>
        </div>
      {:else if vulnerabilities.length > 0}
        <div class="mt-6 overflow-hidden rounded-2xl border border-slate-200">
          <div class="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-4 lg:flex-row">
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
              Mostrando <strong class="text-slate-900">{filteredVulnerabilities.length}</strong> de
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
    {/if}
  </section>
</div>

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
