<script lang="ts">
  import {
    ArrowLeft,
    Calendar,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Gauge,
    Info,
    Search,
    ShieldAlert,
    TrendingUp,
    Wrench,
  } from 'lucide-svelte';

  type CveDetail = {
    id: string;
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
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

  type Remediation = {
    packageName: string;
    installedVersion: string;
    fixedVersion: string;
    status: string;
  };

  type AffectedService = {
    serviceId: string;
    serviceSlug: string;
    serviceName: string;
    projectName?: string;
    packageName: string;
    installedVersion: string;
    fixedVersion: string;
    target: string;
    severity: string;
    status: string;
    scannedAt: string | null;
    projectSlug?: string;
  };

  export let cve: CveDetail;
  export let remediations: Remediation[] = [];
  export let affectedServices: AffectedService[] = [];
  export let cvesHref = '';
  export let orgSlug = '';
  export let defaultProjectSlug = '';

  const severityStyles: Record<string, string> = {
    critical: 'border-red-200 bg-red-50 text-red-700',
    high: 'border-orange-200 bg-orange-50 text-orange-700',
    medium: 'border-amber-200 bg-amber-50 text-amber-700',
    low: 'border-slate-200 bg-slate-50 text-slate-600',
    unknown: 'border-slate-200 bg-slate-50 text-slate-600',
  };

  const severityBannerStyles: Record<string, string> = {
    critical: 'border-red-200 bg-red-50 text-red-800',
    high: 'border-orange-200 bg-orange-50 text-orange-800',
    medium: 'border-amber-200 bg-amber-50 text-amber-800',
    low: 'border-slate-200 bg-slate-50 text-slate-700',
    unknown: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  function cweUrl(cweId: string) {
    const number = cweId.match(/\d+/)?.[0];
    return number ? `https://cwe.mitre.org/data/definitions/${number}.html` : '';
  }

  function splitTarget(target: string) {
    if (!target) {
      return { dirParts: [], file: '-' };
    }

    const parts = target.split(/[\\/]+/).filter(Boolean);
    const file = parts.pop() ?? target;
    return { dirParts: parts, file };
  }

  function splitVersions(value: string) {
    return value
      .split(',')
      .map((version) => version.trim())
      .filter(Boolean);
  }

  function serviceHref(service: AffectedService) {
    const projectSlug = service.projectSlug || defaultProjectSlug;
    if (!projectSlug) return '#';
    return `/org/${orgSlug}/projects/${projectSlug}/code-report/services/${service.serviceSlug}`;
  }

  let activeTab: 'info' | 'services' = 'info';

  let affectedServicesQuery = '';
  const affectedServicesPerPageOptions = [10, 25, 50, 100];
  let affectedServicesPerPage = 10;
  let affectedServicesPage = 1;

  $: tabs = [
    { id: 'info' as const, label: 'Informacion' },
    { id: 'services' as const, label: 'Servicios afectados', count: affectedServices.length },
  ];

  $: cvssPercent = cve.cvssScore !== null ? Math.min(100, (cve.cvssScore / 10) * 100) : 0;
  $: epssScorePercent = cve.epssScore !== null ? Math.min(100, cve.epssScore * 100) : 0;
  $: epssPercentilePercent =
    cve.epssPercentile !== null ? Math.min(100, cve.epssPercentile * 100) : 0;

  $: filteredAffectedServices = affectedServices.filter((service) => {
    const query = affectedServicesQuery.trim().toLowerCase();
    if (!query) return true;

    const serviceName = String(service.serviceName ?? '').toLowerCase();
    const packageName = String(service.packageName ?? '').toLowerCase();
    const target = String(service.target ?? '').toLowerCase();

    return (
      serviceName.includes(query) ||
      packageName.includes(query) ||
      target.includes(query)
    );
  });

  $: affectedServicesTotalPages = Math.max(
    1,
    Math.ceil(filteredAffectedServices.length / affectedServicesPerPage),
  );
  $: if (affectedServicesPage > affectedServicesTotalPages)
    affectedServicesPage = affectedServicesTotalPages;
  $: affectedServicesQuery, affectedServicesPerPage, (affectedServicesPage = 1);
  $: paginatedAffectedServices = filteredAffectedServices.slice(
    (affectedServicesPage - 1) * affectedServicesPerPage,
    affectedServicesPage * affectedServicesPerPage,
  );
  $: affectedServicesRangeStart =
    filteredAffectedServices.length === 0 ? 0 : (affectedServicesPage - 1) * affectedServicesPerPage + 1;
  $: affectedServicesRangeEnd = Math.min(
    affectedServicesPage * affectedServicesPerPage,
    filteredAffectedServices.length,
  );
</script>

<div class="space-y-6">
  <a href={cvesHref} class="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
    <ArrowLeft class="h-3.5 w-3.5" />Volver a CVEs
  </a>

  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="font-mono text-2xl font-bold text-slate-950">{cve.id}</h1>
      <span
        class={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${severityStyles[cve.severity]}`}
      >
        {cve.severity}
      </span>
      {#if cve.cvssScore !== null}
        <span class="text-xs font-semibold text-slate-500">CVSS {cve.cvssScore.toFixed(1)}</span>
      {/if}
    </div>
    {#if cve.title}
      <p class="mt-2 text-sm text-slate-600">{cve.title}</p>
    {/if}
  </section>

  <div class="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Detalle del CVE">
    {#each tabs as tab}
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === tab.id}
        on:click={() => (activeTab = tab.id)}
        class={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold ${
          activeTab === tab.id
            ? 'border-slate-900 text-slate-900'
            : 'border-transparent text-slate-500 hover:text-slate-900'
        }`}
      >
        {tab.label}
        {#if tab.count !== undefined}<span class="ml-1 text-xs font-normal text-slate-400">{tab.count}</span>{/if}
      </button>
    {/each}
  </div>

  {#if activeTab === 'info'}
    <section
      class={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-6 shadow-sm ${severityBannerStyles[cve.severity]}`}
    >
      <div class="flex items-center gap-4">
        <ShieldAlert class="h-10 w-10 shrink-0" />
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide opacity-70">Severidad</p>
          <p class="text-3xl font-black uppercase leading-tight">{cve.severity}</p>
        </div>
      </div>
      {#if cve.publishedDate}
        <div class="flex items-center gap-2 text-sm">
          <Calendar class="h-4 w-4 shrink-0" />
          <div>
            <p class="text-xs opacity-70">Publicado</p>
            <p class="font-semibold">{new Date(cve.publishedDate).toLocaleDateString()}</p>
          </div>
        </div>
      {/if}
    </section>

    <section class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Overview</h2>
      <p class="mt-2 text-sm text-slate-600">{cve.description || 'Sin descripcion disponible.'}</p>
      {#if cve.lastModifiedDate}
        <p class="mt-3 text-xs text-slate-400">
          Ultima actualizacion: {new Date(cve.lastModifiedDate).toLocaleDateString()}
        </p>
      {/if}
    </section>

    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-sm font-semibold text-slate-900">CWE</h2>
      {#if cve.cweIds.length === 0}
        <p class="mt-3 text-sm text-slate-500">No se ha indicado una clasificacion CWE para este CVE.</p>
      {:else}
        <div class="mt-3 flex flex-wrap gap-2">
          {#each cve.cweIds as cweId (cweId)}
            <a
              href={cweUrl(cweId)}
              target="_blank"
              rel="noreferrer noopener"
              class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <ExternalLink class="h-3 w-3" />{cweId}
            </a>
          {/each}
        </div>
      {/if}
    </section>

    <div class="grid gap-4 sm:grid-cols-3">
      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Gauge class="h-3.5 w-3.5" />
          CVSS
          <span title="Common Vulnerability Scoring System: mide la gravedad tecnica de la vulnerabilidad de 0 a 10.">
            <Info class="h-3.5 w-3.5 cursor-help text-slate-400" />
          </span>
        </div>
        <p class="mt-2 text-3xl font-black text-slate-900">
          {cve.cvssScore !== null ? cve.cvssScore.toFixed(1) : '-'}
        </p>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div class="h-2 rounded-full bg-red-500" style={`width: ${cvssPercent}%`}></div>
        </div>
        <p class="mt-1 text-[11px] text-slate-400">Escala 0-10</p>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <TrendingUp class="h-3.5 w-3.5" />
          EPSS Score
          <span title="Exploit Prediction Scoring System: probabilidad estimada de que esta CVE sea explotada en los proximos 30 dias.">
            <Info class="h-3.5 w-3.5 cursor-help text-slate-400" />
          </span>
        </div>
        <p class="mt-2 text-3xl font-black text-slate-900">
          {cve.epssScore !== null ? `${(cve.epssScore * 100).toFixed(3)}%` : '-'}
        </p>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div class="h-2 rounded-full bg-amber-500" style={`width: ${epssScorePercent}%`}></div>
        </div>
        <p class="mt-1 text-[11px] text-slate-400">Probabilidad de explotacion</p>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Gauge class="h-3.5 w-3.5" />
          EPSS Percentil
          <span title="Indica en que percentil se encuentra esta CVE frente a todas las demas segun su probabilidad de explotacion.">
            <Info class="h-3.5 w-3.5 cursor-help text-slate-400" />
          </span>
        </div>
        <p class="mt-2 text-3xl font-black text-slate-900">
          {cve.epssPercentile !== null ? `${(cve.epssPercentile * 100).toFixed(1)}%` : '-'}
        </p>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div class="h-2 rounded-full bg-blue-500" style={`width: ${epssPercentilePercent}%`}></div>
        </div>
        <p class="mt-1 text-[11px] text-slate-400">Frente al resto de CVEs conocidas</p>
      </div>
    </div>

    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <Wrench class="h-4 w-4" />Como solucionarlo
      </h2>
      {#if remediations.some((remediation) => remediation.fixedVersion)}
        <ul class="mt-4 space-y-3">
          {#each remediations as remediation (remediation.packageName)}
            <li class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <span class="font-semibold text-slate-800">{remediation.packageName}</span>
              {#if remediation.fixedVersion}
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <span class="font-mono text-xs font-semibold text-red-700">{remediation.installedVersion}</span>
                  <span class="text-slate-400">-></span>
                  {#each splitVersions(remediation.fixedVersion) as version (version)}
                    <span
                      class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-emerald-700"
                    >
                      {version}
                    </span>
                  {/each}
                </div>
              {:else}
                <span class="text-slate-500"> - todavia no hay una version corregida publicada.</span>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="mt-3 text-sm text-slate-500">
          Ninguno de los paquetes afectados tiene aun una version corregida publicada. Revisa el advisory
          para posibles mitigaciones alternativas.
        </p>
      {/if}
    </section>

    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-sm font-semibold text-slate-900">References</h2>
      {#if cve.references.length === 0 && !cve.primaryUrl}
        <p class="mt-3 text-sm text-slate-500">No hay referencias disponibles para este CVE.</p>
      {:else}
        <ul class="mt-4 space-y-2">
          <li>
            <a
              href={cve.cveUrl}
              target="_blank"
              rel="noreferrer noopener"
              class="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-900"
            >
              <ExternalLink class="h-3.5 w-3.5" />NVD: {cve.id}
            </a>
          </li>
          {#if cve.primaryUrl}
            <li>
              <a
                href={cve.primaryUrl}
                target="_blank"
                rel="noreferrer noopener"
                class="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-900"
              >
                <ExternalLink class="h-3.5 w-3.5" />Advisory principal
              </a>
            </li>
          {/if}
          {#each cve.references as reference (reference)}
            <li>
              <a
                href={reference}
                target="_blank"
                rel="noreferrer noopener"
                class="inline-flex items-center gap-1.5 break-all text-sm text-blue-700 hover:text-blue-900 hover:underline"
              >
                <ExternalLink class="h-3.5 w-3.5 shrink-0" />{reference}
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {:else}
    <div class="flex flex-col gap-3 sm:flex-row">
      <label class="relative min-w-0 flex-1">
        <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          bind:value={affectedServicesQuery}
          placeholder="Buscar por servicio, paquete o nombre de archivo..."
          class="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
        />
      </label>
    </div>

    <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th class="px-5 py-3 font-semibold">Servicio</th>
            <th class="px-5 py-3 font-semibold">Paquete</th>
            <th class="px-5 py-3 font-semibold">Version instalada</th>
            <th class="px-5 py-3 font-semibold">Version corregida</th>
            <th class="px-5 py-3 font-semibold">Objetivo</th>
            <th class="px-5 py-3 font-semibold">Ultimo escaneo</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each paginatedAffectedServices as service (service.serviceId + service.target + service.packageName)}
            {@const target = splitTarget(service.target)}
            <tr class="hover:bg-slate-50">
              <td class="px-5 py-3">
                <a href={serviceHref(service)} class="font-semibold text-slate-900 hover:underline">
                  {service.serviceName}
                </a>
                {#if service.projectName || service.projectSlug}
                  <p class="mt-1 text-xs text-slate-500">
                    Proyecto:
                    <span class="font-medium text-slate-700">{service.projectName || service.projectSlug}</span>
                  </p>
                {/if}
              </td>
              <td class="px-5 py-3 text-slate-700">{service.packageName}</td>
              <td class="px-5 py-3 font-mono text-xs font-semibold text-red-700">
                {service.installedVersion}
              </td>
              <td class="px-5 py-3">
                {#if service.fixedVersion}
                  <div class="flex flex-wrap gap-1.5">
                    {#each splitVersions(service.fixedVersion) as version (version)}
                      <span
                        class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-700"
                      >
                        {version}
                      </span>
                    {/each}
                  </div>
                {:else}
                  <span class="text-xs text-slate-400">No indicada</span>
                {/if}
              </td>
              <td class="max-w-xs px-5 py-3 align-top" title={service.target}>
                {#if target.dirParts.length > 0}
                  <p class="wrap-break-word text-[11px] leading-snug text-slate-400">
                    {#each target.dirParts as part, i (i)}{part}<wbr />{#if i < target.dirParts.length - 1}/<wbr />{/if}{/each}/
                  </p>
                {/if}
                <p class="break-all font-mono text-xs font-semibold text-slate-800">{target.file}</p>
              </td>
              <td class="px-5 py-3 text-slate-500">
                {service.scannedAt ? new Date(service.scannedAt).toLocaleString() : '-'}
              </td>
            </tr>
          {/each}
          {#if paginatedAffectedServices.length === 0}
            <tr>
              <td colspan="6" class="px-5 py-8 text-center text-sm text-slate-500">
                {affectedServices.length === 0
                  ? 'No hay servicios afectados.'
                  : 'Sin resultados para tu busqueda.'}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </section>

    <div class="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <div class="flex items-center gap-2 text-sm text-slate-600">
        <span>Mostrando {affectedServicesRangeStart}-{affectedServicesRangeEnd} de {filteredAffectedServices.length}</span>
        <label class="flex items-center gap-1.5">
          <span class="text-slate-500">Por pagina</span>
          <select
            bind:value={affectedServicesPerPage}
            aria-label="Elementos por pagina"
            class="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
          >
            {#each affectedServicesPerPageOptions as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </label>
      </div>

      <div class="flex items-center gap-1">
        <button
          type="button"
          disabled={affectedServicesPage === 1}
          on:click={() => (affectedServicesPage -= 1)}
          aria-label="Pagina anterior"
          class="inline-flex items-center justify-center rounded-full border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft class="h-4 w-4" />
        </button>
        <span class="px-3 text-sm text-slate-600">
          Pagina {affectedServicesPage} de {affectedServicesTotalPages}
        </span>
        <button
          type="button"
          disabled={affectedServicesPage === affectedServicesTotalPages}
          on:click={() => (affectedServicesPage += 1)}
          aria-label="Pagina siguiente"
          class="inline-flex items-center justify-center rounded-full border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight class="h-4 w-4" />
        </button>
      </div>
    </div>
  {/if}
</div>
