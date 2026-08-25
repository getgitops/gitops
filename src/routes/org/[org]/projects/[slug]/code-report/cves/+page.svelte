<script lang="ts">
  import { page } from '$app/stores';
  import { AlertTriangle, Info, Search, ShieldAlert } from 'lucide-svelte';

  type CveRow = {
    id: string;
    title: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
    cvssScore: number | null;
    affectedServiceCount: number;
    occurrenceCount: number;
  };

  export let data: { cves: CveRow[] };

  const severityStyles: Record<CveRow['severity'], string> = {
    critical: 'border-red-200 bg-red-50 text-red-700',
    high: 'border-orange-200 bg-orange-50 text-orange-700',
    medium: 'border-amber-200 bg-amber-50 text-amber-700',
    low: 'border-slate-200 bg-slate-50 text-slate-600',
    unknown: 'border-slate-200 bg-slate-50 text-slate-600',
  };

  let searchQuery = '';
  let severityFilter = 'all';

  $: orgSlug = $page.params.org;
  $: projectSlug = $page.params.slug;
  $: baseHref = `/org/${orgSlug}/projects/${projectSlug}/code-report/cves`;

  $: filteredCves = data.cves.filter((cve) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !query || cve.id.toLowerCase().includes(query) || cve.title.toLowerCase().includes(query);
    const matchesSeverity = severityFilter === 'all' || cve.severity === severityFilter;
    return matchesQuery && matchesSeverity;
  });
</script>

<svelte:head>
  <title>Code Report - CVEs - GitVault Suite</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
    <Info class="mt-0.5 h-4 w-4 shrink-0" />
    <p>
      Este listado muestra los CVEs detectados en el <strong>último análisis</strong> de cada servicio.
      Los servicios sin un análisis reciente completado no aparecen reflejados aquí.
    </p>
  </div>

  <div class="flex flex-col gap-3 lg:flex-row">
    <label class="relative min-w-0 flex-1">
      <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Buscar por CVE o título..."
        class="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
      />
    </label>
    <select
      bind:value={severityFilter}
      aria-label="Filtrar por severidad"
      class="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
    >
      <option value="all">Todas las severidades</option>
      <option value="critical">Critical</option>
      <option value="high">High</option>
      <option value="medium">Medium</option>
      <option value="low">Low</option>
      <option value="unknown">Unknown</option>
    </select>
  </div>

  {#if filteredCves.length === 0}
    <div
      class="rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"
    >
      <ShieldAlert class="mx-auto h-8 w-8 text-slate-400" />
      <p class="mt-3 text-sm font-medium text-slate-900">
        {data.cves.length === 0
          ? 'Todavía no se han detectado CVEs en este proyecto.'
          : 'Sin resultados para tu búsqueda.'}
      </p>
    </div>
  {:else}
    <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th class="px-5 py-3 font-semibold">CVE</th>
            <th class="px-5 py-3 font-semibold">Severidad</th>
            <th class="px-5 py-3 font-semibold">CVSS</th>
            <th class="px-5 py-3 font-semibold">Servicios afectados</th>
            <th class="px-5 py-3 font-semibold">Apariciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each filteredCves as cve (cve.id)}
            <tr class="hover:bg-slate-50">
              <td class="px-5 py-3">
                <a href={`${baseHref}/${cve.id}`} class="font-mono font-semibold text-slate-900 hover:underline">
                  {cve.id}
                </a>
                {#if cve.title}
                  <p class="mt-0.5 max-w-md truncate text-xs text-slate-500">{cve.title}</p>
                {/if}
              </td>
              <td class="px-5 py-3">
                <span
                  class={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${severityStyles[cve.severity]}`}
                >
                  {#if cve.severity === 'critical'}<AlertTriangle class="h-3 w-3" />{/if}
                  {cve.severity}
                </span>
              </td>
              <td class="px-5 py-3 text-slate-700">
                {cve.cvssScore !== null ? cve.cvssScore.toFixed(1) : '—'}
              </td>
              <td class="px-5 py-3 text-slate-700">{cve.affectedServiceCount}</td>
              <td class="px-5 py-3 text-slate-700">{cve.occurrenceCount}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
