<script lang="ts">
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import { ArrowLeft, History, Trash2, Upload, X } from 'lucide-svelte';
  import CodeReportVisualization from '$lib/components/CodeReportVisualization.svelte';

  export let data: {
    service: { name: string; slug: string };
    latestAnalysis: any;
    analysisHistory: any[];
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

  let deleteModalOpen = false;
  let uploadModalOpen = false;
  let deleting = false;
  let uploading = false;
  let dragActive = false;
  let jsonText = '';
  let fileName = '';
  let deleteError: string | null = null;
  let uploadError: string | null = null;

  function readFile(file: File) {
    fileName = file.name;
    const reader = new FileReader();
    reader.onload = () => (jsonText = String(reader.result ?? ''));
    reader.readAsText(file);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragActive = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) readFile(file);
  }

  function handleFileSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) readFile(file);
  }

  $: if (form?.uploadSuccess) uploadModalOpen = false;
  $: if (form?.json !== undefined) jsonText = form.json;
  $: if (form?.uploadError) uploadError = form.uploadError;
  $: if (form?.error) deleteError = form.error;
</script>

<svelte:head><title>{data.service.name} - Code Report - GitVault Suite</title></svelte:head>

<div class="space-y-6">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <a
      href={servicesHref}
      class="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
    >
      <ArrowLeft class="h-3.5 w-3.5" />Volver a servicios
    </a>
    <div class="flex flex-wrap items-center gap-2">
      <a
        href={historyHref}
        class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <History class="h-4 w-4" />Ver histórico
      </a>
      <button
        type="button"
        on:click={() => {
          uploadError = null;
          uploadModalOpen = true;
        }}
        class="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
      >
        <Upload class="h-4 w-4" />Subir análisis
      </button>
      <button
        type="button"
        on:click={() => {
          deleteError = null;
          deleteModalOpen = true;
        }}
        class="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600"
      >
        <Trash2 class="h-4 w-4" />Borrar servicio
      </button>
    </div>
  </div>

  <CodeReportVisualization
    service={data.service}
    analysis={data.latestAnalysis}
    analysisHistory={data.analysisHistory}
  />
</div>

{#if deleteModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
    <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <div class="flex items-start justify-between">
        <h3 class="text-lg font-semibold">Borrar servicio</h3>
        <button type="button" on:click={() => (deleteModalOpen = false)}
          ><X class="h-5 w-5" /></button
        >
      </div>
      <p class="mt-3 text-sm text-slate-600">
        Vas a borrar <strong>{data.service.name}</strong> y todos sus análisis. Esta acción no se puede
        deshacer.
      </p>
      {#if deleteError}<p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {deleteError}
        </p>{/if}
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
          on:click={() => (deleteModalOpen = false)}
          class="rounded-full border px-4 py-2 text-sm">Cancelar</button
        >
        <button
          type="submit"
          disabled={deleting}
          class="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white"
          >{deleting ? 'Borrando...' : 'Borrar servicio y análisis'}</button
        >
      </form>
    </div>
  </div>
{/if}

{#if uploadModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
    <div class="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
      <div class="flex items-start justify-between">
        <h3 class="text-lg font-semibold">Subir análisis</h3>
        <button type="button" on:click={() => (uploadModalOpen = false)}
          ><X class="h-5 w-5" /></button
        >
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
        {#if uploadError}<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {uploadError}
          </p>{/if}
        <label
          for="analysis-file"
          class={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center ${dragActive ? 'border-slate-400 bg-slate-50' : 'border-slate-200'}`}
          on:dragover|preventDefault={() => (dragActive = true)}
          on:dragleave|preventDefault={() => (dragActive = false)}
          on:drop={handleDrop}
          ><Upload class="h-6 w-6 text-slate-400" /><span class="text-sm font-medium"
            >Selecciona o arrastra un archivo JSON aquí</span
          >{#if fileName}<span class="text-xs text-slate-500">{fileName}</span>{/if}<input
            id="analysis-file"
            type="file"
            accept="application/json,.json"
            on:change={handleFileSelect}
            class="hidden"
          /></label
        >
        <input type="hidden" name="json" value={jsonText} />
        <div class="flex justify-end gap-2">
          <button
            type="button"
            on:click={() => (uploadModalOpen = false)}
            class="rounded-full border px-4 py-2 text-sm">Cancelar</button
          ><button
            type="submit"
            disabled={uploading || !jsonText.trim()}
            class="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >{uploading ? 'Subiendo...' : 'Subir análisis'}</button
          >
        </div>
      </form>
    </div>
  </div>
{/if}
