<script lang="ts">
  import { page } from '$app/stores';
  import { ArrowLeft, Clock, Search } from 'lucide-svelte';
  export let data: { services: { id: string; slug: string; name: string }[]; analyses: any[] };
  let serviceFilter = $page.url.searchParams.get('service') ?? 'all';
  let statusFilter = 'all';
  let dateFilter = '';
  let query = '';
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
    ><select
      bind:value={serviceFilter}
      aria-label="Filtrar por servicio"
      class="rounded-xl border border-slate-200 px-3 py-2 text-sm"
      ><option value="all">Todos los servicios</option>{#each data.services as service}<option
          value={service.slug}>{service.name}</option
        >{/each}</select
    ><select
      bind:value={statusFilter}
      aria-label="Filtrar por estado"
      class="rounded-xl border border-slate-200 px-3 py-2 text-sm"
      ><option value="all">Todos los estados</option><option value="completed">Completado</option
      ><option value="in_progress">En progreso</option><option value="failed">Fallido</option
      ></select
    ><input
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
          class="block p-5 hover:bg-slate-50"
          ><div class="flex flex-wrap items-center gap-3">
            <span class="font-semibold text-slate-900"
              >{analysis.service?.name ?? 'Servicio eliminado'}</span
            ><span
              class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600"
              >{analysis.status}</span
            ><span class="text-sm text-slate-600">{analysis.tool}</span><span
              class="ml-auto inline-flex items-center gap-1 text-xs text-slate-500"
              ><Clock class="h-3.5 w-3.5" />{new Date(analysis.createdAt).toLocaleString()}</span
            >
          </div></a
        >{/each}{/if}
  </div>
</div>
