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
    ShieldAlert,
    Trash2,
    Upload,
    X,
  } from 'lucide-svelte';
  import { summarizeAnalysisResult } from '$lib/code-report/analysis-summary';

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
      {:else}
        <pre
          class="mt-4 max-h-[480px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">{JSON.stringify(
            data.latestAnalysis.result ?? {},
            null,
            2,
          )}</pre>
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
