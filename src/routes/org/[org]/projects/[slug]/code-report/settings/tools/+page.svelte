<script lang="ts">
  import { enhance } from '$app/forms';
  import { Wrench, CheckCircle2, XCircle } from '@lucide/svelte';

  export let data;

  type AnalysisTool = {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    scanner?: string;
    soon?: boolean;
  };

  $: tools = data.tools as AnalysisTool[];
  let localTools: AnalysisTool[] = [];

  $: localTools = tools.map((tool: AnalysisTool) => ({ ...tool }));

  let loading = false;
</script>

<svelte:head>
  <title>Tools - Code Report</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <div class="mb-1 flex items-center gap-2">
      <Wrench class="h-5 w-5 text-slate-700" />
      <h1 class="text-lg font-semibold text-slate-900">Herramientas de Análisis</h1>
    </div>
    <p class="text-sm text-slate-500">
      Gestiona las categorías de análisis habilitadas para este proyecto. Lo que actives aquí se guarda
      en settings del proyecto y se devolverá en la API de scan.
    </p>
  </div>

  <form
    method="POST"
    action="?/updateTools"
    use:enhance={() => {
      loading = true;
      return async ({ update }) => {
        await update();
        loading = false;
      };
    }}
  >
    <div class="space-y-4">
      {#each localTools as tool}
        <div class="flex items-start gap-4 rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50">
          <div class="flex h-6 items-center">
            <input
              type="checkbox"
              id={`tool-${tool.id}`}
              name="tools"
              value={tool.id}
              bind:checked={tool.enabled}
              disabled={tool.soon}
              class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
          </div>
          <div class="flex-1">
            <label for={`tool-${tool.id}`} class="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-900 {tool.soon ? 'opacity-70' : ''}">
              {tool.name}
              {#if tool.soon}
                <span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                  Soon
                </span>
              {:else if tool.enabled}
                <span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  <CheckCircle2 class="h-3 w-3" /> Habilitada
                </span>
              {:else}
                <span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  <XCircle class="h-3 w-3" /> Deshabilitada
                </span>
              {/if}
            </label>
            <p class="mt-1 text-xs text-slate-500">{tool.description}</p>
          </div>
        </div>
      {/each}
    </div>

    <div class="mt-6 flex justify-end border-t border-slate-100 pt-5">
      <button
        type="submit"
        disabled={loading}
        class="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:opacity-50"
      >
        {loading ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </div>
  </form>
</div>
