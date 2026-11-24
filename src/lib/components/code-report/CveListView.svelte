<!--
  Listado de CVEs, reutilizable en un proyecto o en toda la organización.
  Los enlaces los decide quien lo usa (`cveHref`), así el componente no conoce las rutas.
  Con `projects` muestra el filtro por proyecto (vista global); sin él, filtra por servicio.
-->
<script lang="ts" module>
  type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

  export type CveListItem = {
    id: string;
    title: string;
    severity: Severity;
    cvssScore: number | null;
    epssScore: number | null;
    fixable: boolean;
    packages: string[];
    services: { slug: string; name: string; projectSlug: string; projectName: string }[];
    projectSlugs: string[];
    occurrenceCount: number;
  };
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import {
    ChevronLeft,
    ChevronRight,
    CircleCheck,
    Search,
    ShieldAlert,
    Wrench,
    X,
  } from '@lucide/svelte';
  import {
    SEVERITY_FILL,
    SEVERITY_LABEL,
    SEVERITY_ORDER,
    severityBadge,
  } from '#lib/code-report/severity-ui';
  import { Select, Tabs } from '#lib/components/ui';

  let {
    cves,
    cveHref,
    projects = null,
    initialProject = 'all',
    emptyTitle = 'Sin CVEs detectados',
    emptyMessage = 'Ningún servicio tiene vulnerabilidades en su último análisis.',
  }: {
    cves: CveListItem[];
    cveHref: (id: string) => string;
    /** Vista global: proyectos para filtrar. */
    projects?: { slug: string; name: string }[] | null;
    initialProject?: string;
    emptyTitle?: string;
    emptyMessage?: string;
  } = $props();

  const PER_PAGE = 25;

  let query = $state('');
  let severity = $state('all');
  let scope = $state(untrack(() => initialProject));
  let onlyFixable = $state(false);
  let sort = $state('severity');
  let page = $state(1);

  const services = $derived(
    [
      ...new Map(
        cves
          .flatMap((cve) => cve.services)
          .map((service) => [`${service.projectSlug}/${service.slug}`, service]),
      ).values(),
    ].sort((left, right) => left.name.localeCompare(right.name)),
  );

  const scopeOptions = $derived(
    projects
      ? [
          { value: 'all', label: 'Todos los proyectos' },
          ...projects.map((project) => ({ value: project.slug, label: project.name })),
        ]
      : [
          { value: 'all', label: 'Todos los servicios' },
          ...services.map((service) => ({
            value: `${service.projectSlug}/${service.slug}`,
            label: service.name,
          })),
        ],
  );

  function inScope(cve: CveListItem) {
    if (scope === 'all') return true;
    return projects
      ? cve.projectSlugs.includes(scope)
      : cve.services.some((service) => `${service.projectSlug}/${service.slug}` === scope);
  }

  // filtros salvo la severidad, para que los contadores de severidad respondan al resto
  const base = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return cves.filter(
      (cve) =>
        inScope(cve) &&
        (!onlyFixable || cve.fixable) &&
        (!q ||
          cve.id.toLowerCase().includes(q) ||
          cve.title.toLowerCase().includes(q) ||
          cve.packages.some((name) => name.toLowerCase().includes(q))),
    );
  });

  const counts = $derived(
    Object.fromEntries(
      SEVERITY_ORDER.map((key) => [key, base.filter((cve) => cve.severity === key).length]),
    ) as Record<Severity, number>,
  );

  const filtered = $derived.by(() => {
    const list = base.filter((cve) => severity === 'all' || cve.severity === severity);
    if (sort === 'cvss') return [...list].sort((a, b) => (b.cvssScore ?? -1) - (a.cvssScore ?? -1));
    if (sort === 'epss') return [...list].sort((a, b) => (b.epssScore ?? -1) - (a.epssScore ?? -1));
    if (sort === 'services') return [...list].sort((a, b) => b.services.length - a.services.length);
    return list; // ya viene por severidad desde el servidor
  });

  const pages = $derived(Math.max(1, Math.ceil(filtered.length / PER_PAGE)));
  const visible = $derived(filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE));

  $effect(() => {
    void [query, severity, scope, onlyFixable, sort];
    page = 1;
  });

  const hasFilters = $derived(
    !!query.trim() || severity !== 'all' || scope !== 'all' || onlyFixable,
  );

  function clear() {
    query = '';
    severity = 'all';
    scope = 'all';
    onlyFixable = false;
  }

  // cifras de cabecera sobre el ámbito elegido
  const scoped = $derived(cves.filter(inScope));
  const stats = $derived({
    total: scoped.length,
    critical: scoped.filter((cve) => cve.severity === 'critical').length,
    high: scoped.filter((cve) => cve.severity === 'high').length,
    fixable: scoped.filter((cve) => cve.fixable).length,
    services: new Set(
      scoped.flatMap((cve) => cve.services.map((s) => `${s.projectSlug}/${s.slug}`)),
    ).size,
  });

  const severityItems = $derived([
    { value: 'all', label: `Todas ${base.length}` },
    ...SEVERITY_ORDER.filter((key) => key !== 'unknown' || counts.unknown > 0).map((key) => ({
      value: key,
      label: `${SEVERITY_LABEL[key]} ${counts[key]}`,
      disabled: counts[key] === 0 && severity !== key,
    })),
  ]);
</script>

{#if cves.length === 0}
  <div class="k-card flex flex-col items-center gap-3 px-6 py-14 text-center">
    <span class="grid h-12 w-12 place-items-center rounded-full bg-ok/10 text-ok"
      ><CircleCheck class="h-6 w-6" /></span
    >
    <p class="text-sm font-medium text-white">{emptyTitle}</p>
    <p class="max-w-md text-sm text-fg-muted">{emptyMessage}</p>
  </div>
{:else}
  <div class="space-y-4">
    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de CVEs">
      <div class="k-card p-5">
        <p class="text-sm text-fg-muted">CVEs abiertos</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-white">{stats.total}</p>
        <p class="mt-1 text-xs text-fg-subtle">
          en {stats.services}
          {stats.services === 1 ? 'servicio' : 'servicios'}
        </p>
      </div>
      <button
        type="button"
        class="k-card k-card-hover p-5 text-left"
        onclick={() => (severity = severity === 'critical' ? 'all' : 'critical')}
        aria-pressed={severity === 'critical'}
      >
        <p class="flex items-center gap-2 text-sm text-fg-muted">
          <span class="h-2 w-2 rounded-full {SEVERITY_FILL.critical}"></span>Críticos
        </p>
        <p
          class="mt-2 text-3xl font-semibold tabular-nums {stats.critical
            ? 'text-red-300'
            : 'text-white'}"
        >
          {stats.critical}
        </p>
        <p class="mt-1 text-xs text-fg-subtle">{stats.high} altos</p>
      </button>
      <button
        type="button"
        class="k-card k-card-hover p-5 text-left"
        onclick={() => (onlyFixable = !onlyFixable)}
        aria-pressed={onlyFixable}
      >
        <p class="flex items-center gap-2 text-sm text-fg-muted">
          <Wrench class="h-3.5 w-3.5 text-ok" />Con parche disponible
        </p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-white">
          {stats.total ? Math.round((stats.fixable / stats.total) * 100) : 0}<span
            class="text-lg text-fg-subtle">%</span
          >
        </p>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-white/6">
          <div
            class="h-full rounded-full bg-ok"
            style="width:{stats.total ? (stats.fixable / stats.total) * 100 : 0}%"
          ></div>
        </div>
      </button>
      <div class="k-card p-5">
        <p class="text-sm text-fg-muted">Por severidad</p>
        <div class="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
          {#each SEVERITY_ORDER as key (key)}
            {@const value = scoped.filter((cve) => cve.severity === key).length}
            {#if value > 0}
              <div
                class={SEVERITY_FILL[key]}
                style="width:{(value / Math.max(stats.total, 1)) * 100}%"
              ></div>
            {/if}
          {/each}
        </div>
        <ul class="mt-3 grid grid-cols-4 gap-1 text-xs">
          {#each ['critical', 'high', 'medium', 'low'] as const as key (key)}
            <li>
              <span class="block text-fg-subtle">{SEVERITY_LABEL[key]}</span>
              <span class="tabular-nums text-white"
                >{scoped.filter((cve) => cve.severity === key).length}</span
              >
            </li>
          {/each}
        </ul>
      </div>
    </section>

    <div class="max-w-full overflow-x-auto">
      <Tabs
        variant="segmented"
        size="sm"
        label="Severidad"
        items={severityItems}
        bind:value={severity}
      />
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
            placeholder="Buscar CVE, título o paquete…"
            aria-label="Buscar CVEs"
            bind:value={query}
          />
        </label>
        {#if scopeOptions.length > 2}
          <div class="w-full sm:w-56 **:[[role=combobox]]:h-9">
            <label for="cve-scope" class="sr-only">{projects ? 'Proyecto' : 'Servicio'}</label>
            <Select
              id="cve-scope"
              options={scopeOptions}
              bind:value={scope}
              searchable={scopeOptions.length > 8}
            />
          </div>
        {/if}
        <div class="w-full sm:w-48 **:[[role=combobox]]:h-9">
          <label for="cve-sort" class="sr-only">Ordenar por</label>
          <Select
            id="cve-sort"
            bind:value={sort}
            options={[
              { value: 'severity', label: 'Ordenar: severidad' },
              { value: 'cvss', label: 'Ordenar: CVSS' },
              { value: 'epss', label: 'Ordenar: EPSS' },
              { value: 'services', label: 'Ordenar: servicios' },
            ]}
          />
        </div>
        <label class="inline-flex items-center gap-2 text-sm text-fg-muted">
          <input type="checkbox" class="k-checkbox" bind:checked={onlyFixable} />Solo con parche
        </label>
        {#if hasFilters}
          <button type="button" class="k-btn k-btn-ghost k-btn-sm" onclick={clear}>
            <X class="h-3.5 w-3.5" />Limpiar
          </button>
        {/if}
        <span class="ml-auto text-xs tabular-nums text-fg-subtle"
          >{filtered.length} de {cves.length}</span
        >
      </div>

      {#if filtered.length === 0}
        <div class="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <ShieldAlert class="h-6 w-6 text-fg-subtle" />
          <p class="text-sm text-fg-muted">Ningún CVE coincide con los filtros.</p>
          <button type="button" class="k-btn k-btn-secondary k-btn-sm" onclick={clear}>
            <X class="h-3.5 w-3.5" />Limpiar filtros
          </button>
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full min-w-200 text-left text-sm">
            <thead class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
              <tr class="border-b border-white/8">
                <th class="px-5 py-3 font-semibold">CVE</th>
                <th class="px-3 py-3 font-semibold">Severidad</th>
                <th class="px-3 py-3 font-semibold">CVSS</th>
                <th class="px-3 py-3 font-semibold">EPSS</th>
                <th class="px-3 py-3 font-semibold">Afecta a</th>
                <th class="px-5 py-3 font-semibold">Parche</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              {#each visible as cve (cve.id)}
                <tr class="group relative transition-colors hover:bg-white/2.5">
                  <td class="max-w-md px-5 py-3">
                    <a
                      href={cveHref(cve.id)}
                      class="block font-mono text-[13px] font-medium text-white after:absolute after:inset-0 group-hover:text-brand-300"
                    >
                      {cve.id}
                    </a>
                    <p class="truncate text-xs text-fg-subtle" title={cve.title}>
                      {cve.title || '—'}
                    </p>
                  </td>
                  <td class="px-3 py-3">
                    <span class="k-badge {severityBadge(cve.severity)} font-semibold"
                      >{SEVERITY_LABEL[cve.severity]}</span
                    >
                  </td>
                  <td class="px-3 py-3">
                    {#if cve.cvssScore !== null}
                      <div class="flex items-center gap-2">
                        <span class="w-7 tabular-nums text-fg">{cve.cvssScore.toFixed(1)}</span>
                        <span
                          class="hidden h-1 w-12 overflow-hidden rounded-full bg-white/6 lg:block"
                        >
                          <span
                            class="block h-full rounded-full {SEVERITY_FILL[cve.severity]}"
                            style="width:{cve.cvssScore * 10}%"
                          ></span>
                        </span>
                      </div>
                    {:else}<span class="text-fg-subtle">—</span>{/if}
                  </td>
                  <td
                    class="px-3 py-3 tabular-nums {cve.epssScore !== null && cve.epssScore >= 0.1
                      ? 'text-amber-300'
                      : 'text-fg-muted'}"
                  >
                    {cve.epssScore !== null
                      ? `${(cve.epssScore * 100).toFixed(cve.epssScore < 0.01 ? 2 : 1)} %`
                      : '—'}
                  </td>
                  <td class="px-3 py-3">
                    <p
                      class="truncate text-xs text-fg"
                      title={cve.services.map((s) => s.name).join(', ')}
                    >
                      {cve.services.length === 1
                        ? cve.services[0].name
                        : `${cve.services.length} servicios`}
                      {#if projects && cve.projectSlugs.length > 1}
                        <span class="text-fg-subtle">· {cve.projectSlugs.length} proyectos</span>
                      {/if}
                    </p>
                    <p
                      class="truncate font-mono text-[11px] text-fg-subtle"
                      title={cve.packages.join(', ')}
                    >
                      {cve.packages.slice(0, 2).join(', ')}{#if cve.packages.length > 2}
                        +{cve.packages.length - 2}{/if}
                    </p>
                  </td>
                  <td class="px-5 py-3">
                    {#if cve.fixable}
                      <span class="k-badge k-badge-ok"><Wrench class="h-3 w-3" />Disponible</span>
                    {:else}
                      <span class="k-badge">Sin parche</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        {#if pages > 1}
          <div
            class="flex items-center justify-between gap-3 border-t border-white/8 px-5 py-3 text-xs text-fg-subtle"
          >
            <span class="tabular-nums">
              {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} de {filtered.length}
            </span>
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                aria-label="Página anterior"
                disabled={page === 1}
                onclick={() => (page -= 1)}
              >
                <ChevronLeft class="h-4 w-4" />
              </button>
              <span class="px-2 tabular-nums">{page} / {pages}</span>
              <button
                type="button"
                class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                aria-label="Página siguiente"
                disabled={page === pages}
                onclick={() => (page += 1)}
              >
                <ChevronRight class="h-4 w-4" />
              </button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}
