<script lang="ts">
  import { AlertCircle, Package, Search } from '@lucide/svelte';
  import type { SbomComponent } from '$lib/code-report/analysis-summary';

  type Analysis = { tool: string; status: string; createdAt: string; error?: string | null } | null;

  export let analysis: Analysis = null;
  export let components: SbomComponent[] = [];
  export let sbomQuery = '';
  export let sbomTypeFilter = 'all';

  $: componentTypes = [...new Set(components.map((component) => component.type))].sort();
  $: filteredComponents = components
    .filter((component) => {
      const query = sbomQuery.trim().toLowerCase();
      return (
        (!query ||
          [component.name, component.purl, component.version].some((value) =>
            value.toLowerCase().includes(query),
          )) &&
        (sbomTypeFilter === 'all' || component.type === sbomTypeFilter)
      );
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  $: licensedCount = components.filter((component) => component.licenses.length > 0).length;
</script>

<section class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
  {#if !analysis}
    <p class="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
      Todavía no se ha generado ningún SBOM con syft en este servicio.
    </p>
  {:else if analysis.status === 'failed'}
    <div
      class="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
    >
      <AlertCircle class="h-4 w-4" />{analysis.error || 'La generación del SBOM falló.'}
    </div>
  {:else if analysis.status === 'in_progress'}
    <p class="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
      La generación del SBOM está en curso.
    </p>
  {:else if components.length === 0}
    <p class="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
      El SBOM no contiene componentes o el formato no es reconocido.
    </p>
  {:else}
    <div class="grid gap-4 sm:grid-cols-3">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Componentes</p>
        <p class="mt-1 text-2xl font-bold text-slate-900">{components.length}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Ecosistemas</p>
        <p class="mt-1 text-2xl font-bold text-slate-900">{componentTypes.length}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Con licencia</p>
        <p class="mt-1 text-2xl font-bold text-slate-900">
          {licensedCount}<span class="text-sm font-medium text-slate-500">/{components.length}</span>
        </p>
      </div>
    </div>
    <div class="mt-5 flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row">
      <label class="relative min-w-0 flex-1">
        <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          bind:value={sbomQuery}
          placeholder="Buscar componente, versión o purl..."
          class="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
        />
      </label>
      <select
        bind:value={sbomTypeFilter}
        aria-label="Filtrar por ecosistema"
        class="rounded-xl border border-slate-200 px-3 py-2 text-sm"
      >
        <option value="all">Todos los ecosistemas</option>
        {#each componentTypes as type}<option value={type}>{type}</option>{/each}
      </select>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="text-xs uppercase tracking-wide text-slate-500">
          <tr class="border-b border-slate-200">
            <th class="py-2 pr-4 font-semibold">Componente</th>
            <th class="py-2 pr-4 font-semibold">Versión</th>
            <th class="py-2 pr-4 font-semibold">Tipo</th>
            <th class="py-2 pr-4 font-semibold">Licencias</th>
            <th class="py-2 font-semibold">Ubicación</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each filteredComponents as component, index (component.purl + component.name + index)}
            <tr class="align-top">
              <td class="py-3 pr-4">
                <span class="flex items-center gap-2 font-semibold text-slate-900">
                  <Package class="h-3.5 w-3.5 text-slate-400" />{component.name}
                </span>
                {#if component.purl}
                  <span class="mt-1 block break-all font-mono text-[11px] text-slate-500"
                    >{component.purl}</span
                  >
                {/if}
              </td>
              <td class="py-3 pr-4 font-mono text-xs text-slate-700">{component.version}</td>
              <td class="py-3 pr-4">
                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                  >{component.type}</span
                >
              </td>
              <td class="py-3 pr-4 text-xs text-slate-600">
                {component.licenses.length > 0 ? component.licenses.join(', ') : 'No declarada'}
              </td>
              <td class="py-3 break-all font-mono text-[11px] text-slate-500">
                {component.locations[0] || '—'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
