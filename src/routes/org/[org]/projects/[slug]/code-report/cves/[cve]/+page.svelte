<script lang="ts">
  import { page } from '$app/stores';
  import { ArrowLeft } from 'lucide-svelte';

  type CveDetail = {
    id: string;
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
    cvssScore: number | null;
    primaryUrl: string;
    cveUrl: string;
    cweIds: string[];
  };

  type AffectedService = {
    serviceId: string;
    serviceSlug: string;
    serviceName: string;
    packageName: string;
    installedVersion: string;
    fixedVersion: string;
    target: string;
    severity: string;
    status: string;
    scannedAt: string | null;
  };

  export let data: { cve: CveDetail; affectedServices: AffectedService[] };

  const severityStyles: Record<string, string> = {
    critical: 'border-red-200 bg-red-50 text-red-700',
    high: 'border-orange-200 bg-orange-50 text-orange-700',
    medium: 'border-amber-200 bg-amber-50 text-amber-700',
    low: 'border-slate-200 bg-slate-50 text-slate-600',
    unknown: 'border-slate-200 bg-slate-50 text-slate-600',
  };

  let activeTab: 'info' | 'services' = 'info';

  $: orgSlug = $page.params.org;
  $: projectSlug = $page.params.slug;
  $: cvesHref = `/org/${orgSlug}/projects/${projectSlug}/code-report/cves`;
  $: servicesHref = (slug: string) =>
    `/org/${orgSlug}/projects/${projectSlug}/code-report/services/${slug}`;

  $: tabs = [
    { id: 'info' as const, label: 'Información' },
    { id: 'services' as const, label: 'Servicios afectados', count: data.affectedServices.length },
  ];
</script>

<svelte:head>
  <title>{data.cve.id} - Code Report - GitVault Suite</title>
</svelte:head>

<div class="space-y-6">
  <a href={cvesHref} class="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
    <ArrowLeft class="h-3.5 w-3.5" />Volver a CVEs
  </a>

  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="font-mono text-2xl font-bold text-slate-950">{data.cve.id}</h1>
      <span
        class={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${severityStyles[data.cve.severity]}`}
      >
        {data.cve.severity}
      </span>
      {#if data.cve.cvssScore !== null}
        <span class="text-xs font-semibold text-slate-500">CVSS {data.cve.cvssScore.toFixed(1)}</span>
      {/if}
    </div>
    {#if data.cve.title}
      <p class="mt-2 text-sm text-slate-600">{data.cve.title}</p>
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
    <section class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p class="text-sm text-slate-600">{data.cve.description || 'Sin descripción disponible.'}</p>

      <dl class="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">CWE</dt>
          <dd class="mt-0.5 text-sm text-slate-800">
            {data.cve.cweIds.length > 0 ? data.cve.cweIds.join(', ') : 'No indicado'}
          </dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">CVSS</dt>
          <dd class="mt-0.5 text-sm text-slate-800">
            {data.cve.cvssScore !== null ? data.cve.cvssScore.toFixed(1) : 'No indicado'}
          </dd>
        </div>
      </dl>

      <div class="mt-6 flex flex-wrap gap-4">
        <a
          href={data.cve.cveUrl}
          target="_blank"
          rel="noreferrer noopener"
          class="text-xs font-semibold text-blue-700 hover:text-blue-900"
        >
          Abrir {data.cve.id} en NVD ↗
        </a>
        {#if data.cve.primaryUrl}
          <a
            href={data.cve.primaryUrl}
            target="_blank"
            rel="noreferrer noopener"
            class="text-xs font-semibold text-blue-700 hover:text-blue-900"
          >
            Ver advisory ↗
          </a>
        {/if}
      </div>
    </section>
  {:else}
    <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th class="px-5 py-3 font-semibold">Servicio</th>
            <th class="px-5 py-3 font-semibold">Paquete</th>
            <th class="px-5 py-3 font-semibold">Versión instalada</th>
            <th class="px-5 py-3 font-semibold">Versión corregida</th>
            <th class="px-5 py-3 font-semibold">Objetivo</th>
            <th class="px-5 py-3 font-semibold">Último escaneo</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each data.affectedServices as service (service.serviceId + service.target + service.packageName)}
            <tr class="hover:bg-slate-50">
              <td class="px-5 py-3">
                <a
                  href={servicesHref(service.serviceSlug)}
                  class="font-semibold text-slate-900 hover:underline"
                >
                  {service.serviceName}
                </a>
              </td>
              <td class="px-5 py-3 text-slate-700">{service.packageName}</td>
              <td class="px-5 py-3 font-mono text-xs font-semibold text-red-700">
                {service.installedVersion}
              </td>
              <td class="px-5 py-3 font-mono text-xs font-semibold text-emerald-700">
                {service.fixedVersion || 'No indicada'}
              </td>
              <td class="px-5 py-3 text-slate-700">{service.target}</td>
              <td class="px-5 py-3 text-slate-500">
                {service.scannedAt ? new Date(service.scannedAt).toLocaleString() : '—'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</div>
