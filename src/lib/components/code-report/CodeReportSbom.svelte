<script lang="ts">
  import { CircleAlert, Package, Search } from '@lucide/svelte';
  import type { SbomComponent } from '#lib/code-report/analysis-summary';
  import { Select } from '#lib/components/ui';

  type Analysis = { status: string; error?: string | null } | null;

  let { analysis, components }: { analysis: Analysis; components: SbomComponent[] } = $props();

  const PAGE = 100;

  let query = $state('');
  let type = $state('all');
  let license = $state('all');
  let limit = $state(PAGE);

  const types = $derived(
    [...new Set(components.map((component) => component.type))].sort().map((value) => ({
      value,
      count: components.filter((component) => component.type === value).length,
    })),
  );

  // licencias más frecuentes, para el filtro y el resumen
  const licenses = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const component of components) {
      const list = component.licenses.length > 0 ? component.licenses : ['Sin declarar'];
      for (const name of list) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  });

  const licensed = $derived(components.filter((component) => component.licenses.length > 0).length);

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return components
      .filter(
        (component) =>
          (type === 'all' || component.type === type) &&
          (license === 'all' ||
            (license === 'Sin declarar'
              ? component.licenses.length === 0
              : component.licenses.includes(license))) &&
          (!q ||
            [component.name, component.purl, component.version].some((value) =>
              value.toLowerCase().includes(q),
            )),
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  });

  $effect(() => {
    // vuelve a la primera página al cambiar los filtros
    void [query, type, license];
    limit = PAGE;
  });
</script>

{#if !analysis}
  <div class="k-card px-6 py-12 text-center text-sm text-fg-muted">
    Este servicio todavía no tiene un inventario de dependencias (Syft · SBOM).
  </div>
{:else if analysis.status === 'failed'}
  <div class="k-card flex items-start gap-3 border-red-500/30 px-5 py-4 text-sm text-red-200">
    <CircleAlert class="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
    {analysis.error || 'La generación del SBOM falló.'}
  </div>
{:else if analysis.status === 'in_progress'}
  <div class="k-card px-6 py-12 text-center text-sm text-fg-muted">
    La generación del SBOM está en curso.
  </div>
{:else if components.length === 0}
  <div class="k-card px-6 py-12 text-center text-sm text-fg-muted">
    El SBOM no contiene componentes o su formato no se reconoce.
  </div>
{:else}
  <div class="space-y-4">
    <div class="grid gap-4 sm:grid-cols-3">
      <div class="k-card p-5">
        <p class="text-sm text-fg-muted">Componentes</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-white">{components.length}</p>
      </div>
      <div class="k-card p-5">
        <p class="text-sm text-fg-muted">Ecosistemas</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-white">{types.length}</p>
        <p class="mt-1 truncate text-xs text-fg-subtle">
          {types
            .slice()
            .sort((left, right) => right.count - left.count)
            .slice(0, 3)
            .map((item) => item.value)
            .join(' · ')}
        </p>
      </div>
      <div class="k-card p-5">
        <p class="text-sm text-fg-muted">Con licencia declarada</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-white">
          {Math.round((licensed / components.length) * 100)}<span class="text-lg text-fg-subtle"
            >%</span
          >
        </p>
        <p class="mt-1 text-xs text-fg-subtle">{licensed} de {components.length}</p>
      </div>
    </div>

    <div class="k-card overflow-hidden">
      <div class="flex flex-wrap items-center gap-3 border-b border-white/8 p-4">
        <label class="relative w-full sm:w-72">
          <Search
            class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
          />
          <input
            type="search"
            class="k-input h-9 pl-9"
            placeholder="Buscar componente, versión o purl…"
            aria-label="Buscar componentes"
            bind:value={query}
          />
        </label>
        <div class="w-full sm:w-48 **:[[role=combobox]]:h-9">
          <label for="sbom-type" class="sr-only">Ecosistema</label>
          <Select
            id="sbom-type"
            bind:value={type}
            options={[
              { value: 'all', label: 'Todos los ecosistemas' },
              ...types.map((item) => ({
                value: item.value,
                label: item.value,
                hint: String(item.count),
              })),
            ]}
          />
        </div>
        <div class="w-full sm:w-52 **:[[role=combobox]]:h-9">
          <label for="sbom-license" class="sr-only">Licencia</label>
          <Select
            id="sbom-license"
            bind:value={license}
            searchable={licenses.length > 8}
            options={[
              { value: 'all', label: 'Todas las licencias' },
              ...licenses.map(([name, count]) => ({
                value: name,
                label: name,
                hint: String(count),
              })),
            ]}
          />
        </div>
        <span class="ml-auto text-xs tabular-nums text-fg-subtle"
          >{filtered.length} de {components.length}</span
        >
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-176 text-left text-sm">
          <thead class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
            <tr class="border-b border-white/8">
              <th class="px-5 py-3 font-semibold">Componente</th>
              <th class="px-3 py-3 font-semibold">Versión</th>
              <th class="px-3 py-3 font-semibold">Ecosistema</th>
              <th class="px-3 py-3 font-semibold">Licencias</th>
              <th class="px-5 py-3 font-semibold">Ubicación</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            {#each filtered.slice(0, limit) as component, index (component.purl + component.name + index)}
              <tr class="align-top transition-colors hover:bg-white/2.5">
                <td class="px-5 py-2.5">
                  <span class="flex items-center gap-2 font-medium text-white">
                    <Package class="h-3.5 w-3.5 shrink-0 text-fg-subtle" />{component.name}
                  </span>
                  {#if component.purl}
                    <span
                      class="mt-0.5 block max-w-md truncate font-mono text-[11px] text-fg-subtle"
                      title={component.purl}>{component.purl}</span
                    >
                  {/if}
                </td>
                <td class="px-3 py-2.5 font-mono text-xs text-fg">{component.version}</td>
                <td class="px-3 py-2.5"><span class="k-badge">{component.type}</span></td>
                <td class="px-3 py-2.5 text-xs">
                  {#if component.licenses.length > 0}
                    <span class="text-fg">{component.licenses.join(', ')}</span>
                  {:else}
                    <span class="text-amber-300">Sin declarar</span>
                  {/if}
                </td>
                <td
                  class="max-w-xs truncate px-5 py-2.5 font-mono text-[11px] text-fg-subtle"
                  title={component.locations[0] ?? ''}
                >
                  {component.locations[0] || '—'}
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="5" class="px-5 py-10 text-center text-sm text-fg-subtle">
                  Ningún componente coincide con los filtros.
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if filtered.length > limit}
        <div class="flex items-center justify-center border-t border-white/8 p-3">
          <button type="button" class="k-btn k-btn-ghost k-btn-sm" onclick={() => (limit += PAGE)}
            >Mostrar {Math.min(PAGE, filtered.length - limit)} más</button
          >
        </div>
      {/if}
    </div>
  </div>
{/if}
