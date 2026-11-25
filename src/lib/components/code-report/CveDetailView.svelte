<!--
  Detalle de un CVE, reutilizable en cualquier ámbito (proyecto, organización…).
  Quien lo usa decide los enlaces: `backHref` y `serviceHref` para cada servicio afectado.
  `showProject` añade la columna de proyecto (vista global).
-->
<script lang="ts" module>
  type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

  export type CveDetail = {
    id: string;
    title: string;
    description: string;
    severity: Severity;
    cvssScore: number | null;
    epssScore: number | null;
    epssPercentile: number | null;
    primaryUrl: string;
    cveUrl: string;
    cweIds: string[];
    references: string[];
    publishedDate: string | null;
    lastModifiedDate: string | null;
  };

  export type CveRemediation = {
    packageName: string;
    installedVersions: string[];
    fixedVersion: string;
    serviceCount: number;
  };

  export type CveAffected = {
    serviceSlug: string;
    serviceName: string;
    projectSlug: string;
    projectName: string;
    packageName: string;
    installedVersion: string;
    fixedVersion: string;
    target: string;
    severity: Severity;
    status: string;
    scannedAt: string | null;
  };
</script>

<script lang="ts">
  import {
    ArrowLeft,
    ArrowRight,
    Calendar,
    CircleAlert,
    ExternalLink,
    Search,
    Wrench,
  } from '@lucide/svelte';
  import {
    renderVulnerabilityDescription,
    vulnerabilitySourceLabel,
  } from '#lib/code-report/vulnerability-format';
  import { SEVERITY_FILL, SEVERITY_LABEL, severityBadge } from '#lib/code-report/severity-ui';
  import { locale } from '#lib/i18n';

  let {
    cve,
    remediations,
    affected,
    backHref = null,
    backLabel = 'Volver a CVEs',
    serviceHref,
    showProject = false,
  }: {
    cve: CveDetail;
    remediations: CveRemediation[];
    affected: CveAffected[];
    backHref?: string | null;
    backLabel?: string;
    serviceHref: (service: CveAffected) => string;
    showProject?: boolean;
  } = $props();

  let query = $state('');

  const description = $derived(
    cve.description ? renderVulnerabilityDescription(cve.description) : '',
  );
  const fixable = $derived(remediations.some((item) => item.fixedVersion));
  const serviceCount = $derived(
    new Set(affected.map((a) => `${a.projectSlug}/${a.serviceSlug}`)).size,
  );
  const projectCount = $derived(new Set(affected.map((a) => a.projectSlug)).size);

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return affected.filter(
      (item) =>
        !q ||
        [item.serviceName, item.projectName, item.packageName, item.target].some((value) =>
          value.toLowerCase().includes(q),
        ),
    );
  });

  const cvssLabel = $derived(
    cve.cvssScore === null
      ? null
      : cve.cvssScore >= 9
        ? 'Crítica'
        : cve.cvssScore >= 7
          ? 'Alta'
          : cve.cvssScore >= 4
            ? 'Media'
            : 'Baja',
  );

  function date(iso: string | null) {
    if (!iso) return '—';
    return new Intl.DateTimeFormat($locale ?? 'es', { dateStyle: 'medium' }).format(new Date(iso));
  }

  function cweUrl(id: string) {
    const number = id.match(/\d+/)?.[0];
    return number ? `https://cwe.mitre.org/data/definitions/${number}.html` : null;
  }

  function host(url: string) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }
</script>

<div class="space-y-6">
  {#if backHref}
    <a
      href={backHref}
      class="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-white"
    >
      <ArrowLeft class="h-3.5 w-3.5" />{backLabel}
    </a>
  {/if}

  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0 max-w-3xl">
      <div class="flex flex-wrap items-center gap-2">
        <span class="k-badge {severityBadge(cve.severity)} font-semibold"
          >{SEVERITY_LABEL[cve.severity]}</span
        >
        {#if fixable}
          <span class="k-badge k-badge-ok"><Wrench class="h-3 w-3" />Parche disponible</span>
        {:else}
          <span class="k-badge">Sin parche</span>
        {/if}
      </div>
      <h1 class="mt-2 font-mono text-2xl font-semibold tracking-tight text-white">{cve.id}</h1>
      {#if cve.title}<p class="mt-1 text-fg-muted">{cve.title}</p>{/if}
      <p class="mt-2 text-sm text-fg-subtle">
        Afecta a {serviceCount}
        {serviceCount === 1 ? 'servicio' : 'servicios'}{#if showProject && projectCount > 1}
          en {projectCount} proyectos{/if}.
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if cve.cveUrl}
        <a
          href={cve.cveUrl}
          target="_blank"
          rel="noreferrer noopener"
          class="k-btn k-btn-secondary"
        >
          <ExternalLink class="h-4 w-4" />{vulnerabilitySourceLabel(cve.id)}
        </a>
      {/if}
      {#if cve.primaryUrl && cve.primaryUrl !== cve.cveUrl}
        <a
          href={cve.primaryUrl}
          target="_blank"
          rel="noreferrer noopener"
          class="k-btn k-btn-ghost"
        >
          <ExternalLink class="h-4 w-4" />Advisory
        </a>
      {/if}
    </div>
  </header>

  <div class="grid gap-4 lg:grid-cols-3">
    <div class="min-w-0 space-y-4 lg:col-span-2">
      <section class="k-card p-5" aria-labelledby="cve-description">
        <h2 id="cve-description" class="font-semibold text-white">Descripción</h2>
        {#if description}
          <div class="cve-description mt-3 text-sm leading-6 text-fg-muted">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown saneado en renderVulnerabilityDescription -->
            {@html description}
          </div>
        {:else}
          <p class="mt-3 text-sm text-fg-subtle">
            El informe no incluye descripción para este CVE.
          </p>
        {/if}
      </section>

      <section class="k-card overflow-hidden" aria-labelledby="cve-fix">
        <div class="border-b border-white/8 px-5 py-4">
          <h2 id="cve-fix" class="font-semibold text-white">Cómo corregirlo</h2>
          <p class="text-xs text-fg-subtle">
            Paquetes afectados y la versión a la que hay que actualizar
          </p>
        </div>
        <ul class="divide-y divide-white/6">
          {#each remediations as item (item.packageName + item.fixedVersion)}
            <li class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
              <span class="min-w-0 flex-1 truncate font-medium text-white">{item.packageName}</span>
              <span class="font-mono text-xs">
                <span class="text-red-300">{item.installedVersions.join(', ')}</span>
                <span class="text-fg-subtle">→</span>
                {#if item.fixedVersion}
                  <span class="text-ok">{item.fixedVersion}</span>
                {:else}
                  <span class="text-fg-subtle">sin versión corregida</span>
                {/if}
              </span>
              <span class="w-24 text-right text-xs text-fg-subtle">
                {item.serviceCount}
                {item.serviceCount === 1 ? 'servicio' : 'servicios'}
              </span>
            </li>
          {/each}
        </ul>
        {#if !fixable}
          <p
            class="flex items-start gap-2 border-t border-white/8 px-5 py-3 text-xs text-amber-200"
          >
            <CircleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            No hay versión corregida publicada. Valora mitigarlo (configuración, WAF) o sustituir el paquete.
          </p>
        {/if}
      </section>

      <section class="k-card overflow-hidden" aria-labelledby="cve-affected">
        <div class="flex flex-wrap items-center gap-3 border-b border-white/8 px-5 py-4">
          <div class="mr-auto">
            <h2 id="cve-affected" class="font-semibold text-white">Servicios afectados</h2>
            <p class="text-xs text-fg-subtle">Según el último análisis de cada servicio</p>
          </div>
          {#if affected.length > 5}
            <label class="relative w-full sm:w-64">
              <Search
                class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
              />
              <input
                type="search"
                class="k-input h-9 pl-9"
                placeholder="Buscar servicio o paquete…"
                aria-label="Buscar servicios afectados"
                bind:value={query}
              />
            </label>
          {/if}
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-176 text-left text-sm">
            <thead class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
              <tr class="border-b border-white/8">
                <th class="px-5 py-3 font-semibold">Servicio</th>
                <th class="px-3 py-3 font-semibold">Paquete</th>
                <th class="px-3 py-3 font-semibold">Versión</th>
                <th class="px-3 py-3 font-semibold">Ubicación</th>
                <th class="px-5 py-3 font-semibold">Analizado</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              {#each filtered as item, index (item.projectSlug + item.serviceSlug + item.packageName + item.target + index)}
                <tr class="transition-colors hover:bg-white/2.5">
                  <td class="px-5 py-3">
                    <a
                      href={serviceHref(item)}
                      class="group inline-flex items-center gap-1.5 font-medium text-white hover:text-brand-300"
                    >
                      {item.serviceName}
                      <ArrowRight
                        class="h-3 w-3 text-fg-subtle opacity-0 transition group-hover:opacity-100"
                      />
                    </a>
                    {#if showProject}<p class="text-xs text-fg-subtle">{item.projectName}</p>{/if}
                  </td>
                  <td class="px-3 py-3 font-mono text-xs text-fg">{item.packageName}</td>
                  <td class="px-3 py-3 font-mono text-xs">
                    <span class="text-red-300">{item.installedVersion}</span>
                    {#if item.fixedVersion}<span class="text-fg-subtle"> → </span><span
                        class="text-ok">{item.fixedVersion}</span
                      >{/if}
                  </td>
                  <td
                    class="max-w-56 truncate px-3 py-3 font-mono text-[11px] text-fg-subtle"
                    title={item.target}
                  >
                    {item.target || '—'}
                  </td>
                  <td class="whitespace-nowrap px-5 py-3 text-xs text-fg-subtle"
                    >{date(item.scannedAt)}</td
                  >
                </tr>
              {:else}
                <tr>
                  <td colspan="5" class="px-5 py-8 text-center text-sm text-fg-subtle"
                    >Ningún servicio coincide.</td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <aside class="min-w-0 space-y-4">
      <section class="k-card p-5" aria-label="Puntuaciones">
        <div>
          <div class="flex items-baseline justify-between">
            <p class="text-sm text-fg-muted">CVSS v3</p>
            {#if cvssLabel}<p class="text-xs text-fg-subtle">{cvssLabel}</p>{/if}
          </div>
          <p class="mt-1 text-3xl font-semibold tabular-nums text-white">
            {cve.cvssScore !== null ? cve.cvssScore.toFixed(1) : '—'}<span
              class="text-base text-fg-subtle"
            >
              / 10</span
            >
          </p>
          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-white/6">
            <div
              class="h-full rounded-full {SEVERITY_FILL[cve.severity]}"
              style="width:{(cve.cvssScore ?? 0) * 10}%"
            ></div>
          </div>
        </div>

        <div class="mt-5 border-t border-white/8 pt-5">
          <div class="flex items-baseline justify-between">
            <p class="text-sm text-fg-muted">EPSS</p>
            <p class="text-xs text-fg-subtle">probabilidad de explotación en 30 días</p>
          </div>
          {#if cve.epssScore !== null}
            <p
              class="mt-1 text-3xl font-semibold tabular-nums {cve.epssScore >= 0.1
                ? 'text-amber-300'
                : 'text-white'}"
            >
              {(cve.epssScore * 100).toFixed(cve.epssScore < 0.01 ? 2 : 1)}<span
                class="text-base text-fg-subtle"
              >
                %</span
              >
            </p>
            {#if cve.epssPercentile !== null}
              <p class="mt-1 text-xs text-fg-subtle">
                Más probable que el {Math.round(cve.epssPercentile * 100)} % de los CVEs
              </p>
              <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-white/6">
                <div
                  class="h-full rounded-full bg-warn"
                  style="width:{cve.epssPercentile * 100}%"
                ></div>
              </div>
            {/if}
          {:else}
            <p class="mt-1 text-sm text-fg-subtle">El informe no incluye EPSS.</p>
          {/if}
        </div>
      </section>

      <section class="k-card p-5" aria-label="Datos">
        <dl class="space-y-3 text-sm">
          <div class="flex items-center justify-between gap-3">
            <dt class="flex items-center gap-2 text-fg-muted">
              <Calendar class="h-3.5 w-3.5" />Publicado
            </dt>
            <dd class="text-fg">{date(cve.publishedDate)}</dd>
          </div>
          <div class="flex items-center justify-between gap-3">
            <dt class="flex items-center gap-2 text-fg-muted">
              <Calendar class="h-3.5 w-3.5" />Modificado
            </dt>
            <dd class="text-fg">{date(cve.lastModifiedDate)}</dd>
          </div>
          {#if cve.cweIds.length > 0}
            <div class="border-t border-white/8 pt-3">
              <dt class="text-fg-muted">Debilidad (CWE)</dt>
              <dd class="mt-1.5 flex flex-wrap gap-1.5">
                {#each cve.cweIds as id (id)}
                  {@const href = cweUrl(id)}
                  {#if href}
                    <a
                      {href}
                      target="_blank"
                      rel="noreferrer noopener"
                      class="k-badge font-mono hover:text-white">{id}</a
                    >
                  {:else}
                    <span class="k-badge font-mono">{id}</span>
                  {/if}
                {/each}
              </dd>
            </div>
          {/if}
        </dl>
      </section>

      {#if cve.references.length > 0}
        <section class="k-card overflow-hidden" aria-labelledby="cve-references">
          <h2
            id="cve-references"
            class="border-b border-white/8 px-5 py-3.5 text-sm font-semibold text-white"
          >
            Referencias <span class="font-normal text-fg-subtle">{cve.references.length}</span>
          </h2>
          <ul class="max-h-72 divide-y divide-white/5 overflow-y-auto">
            {#each cve.references as reference (reference)}
              <li>
                <a
                  href={reference}
                  target="_blank"
                  rel="noreferrer noopener"
                  class="flex items-center gap-2 px-5 py-2 text-xs transition-colors hover:bg-white/2.5"
                  title={reference}
                >
                  <ExternalLink class="h-3 w-3 shrink-0 text-fg-subtle" />
                  <span class="shrink-0 text-fg">{host(reference)}</span>
                  <span class="truncate text-fg-subtle"
                    >{reference.replace(/^https?:\/\/[^/]+/, '')}</span
                  >
                </a>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </aside>
  </div>
</div>

<style>
  .cve-description :global(p + p) {
    margin-top: 0.75rem;
  }
  .cve-description :global(a) {
    color: var(--color-brand-300);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .cve-description :global(code) {
    border-radius: 0.25rem;
    background: rgb(255 255 255 / 0.06);
    padding: 0.05rem 0.3rem;
    font-size: 0.8em;
  }
  .cve-description :global(pre) {
    margin-top: 0.75rem;
    overflow-x: auto;
    border-radius: 0.5rem;
    background: var(--color-ink-950);
    padding: 0.75rem;
    font-size: 0.75rem;
  }
  .cve-description :global(ul) {
    margin-top: 0.5rem;
    list-style: disc;
    padding-left: 1.25rem;
  }
</style>
