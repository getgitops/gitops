<script lang="ts">
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import { ArrowLeft, History, Trash2, X } from 'lucide-svelte';
  import CodeReportVisualization from '$lib/components/CodeReportVisualization.svelte';
  import type { SecurityPolicy } from '$lib/code-report/security-policy';

  export let data: {
    service: { id: string; name: string; slug: string; tags?: string[] };
    latestAnalysis: any;
    latestByTool: Record<string, any>;
    analysisHistory: any[];
    securityPolicies: SecurityPolicy[];
  };
  export let form: {
    error?: string;
  } | null;

  $: orgSlug = $page.params.org;
  $: projectSlug = $page.params.slug;
  $: servicesHref = `/org/${orgSlug}/projects/${projectSlug}/code-report/services`;
  $: historyHref = `/org/${orgSlug}/projects/${projectSlug}/code-report/history?service=${data.service.slug}`;

  let deleteModalOpen = false;
  let deleting = false;
  let deleteError: string | null = null;
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
    latestByTool={data.latestByTool}
    analysisHistory={data.analysisHistory}
    securityPolicies={data.securityPolicies}
    securityPoliciesHref={`/org/${orgSlug}/projects/${projectSlug}/code-report/security-policy`}
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
