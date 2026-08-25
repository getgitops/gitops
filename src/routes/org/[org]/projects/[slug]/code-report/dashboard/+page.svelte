<script lang="ts">
  import { onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import {
    AlertTriangle,
    Boxes,
    Clock,
    KeySquare,
    ShieldAlert,
    ShieldCheck,
    Wrench,
  } from 'lucide-svelte';

  type SeverityCounts = {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown: number;
  };

  type CveRow = {
    id: string;
    title: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
    cvssScore: number | null;
    affectedServiceCount: number;
    occurrenceCount: number;
  };

  type ServiceRisk = {
    id: string;
    slug: string;
    name: string;
    severity: SeverityCounts;
    riskScore: number;
    lastScanAt: string | null;
  };

  type StaleService = {
    id: string;
    slug: string;
    name: string;
    scanned: boolean;
    lastScanAt: string | null;
  };

  export let data: {
    kpis: {
      totalServices: number;
      scannedServices: number;
      totalCves: number;
      criticalCount: number;
      highCount: number;
      exposedSecrets: number;
      remediationCoveragePercent: number | null;
      staleServicesCount: number;
    };
    severityBreakdown: SeverityCounts;
    topCves: CveRow[];
    riskiestServices: ServiceRisk[];
    staleServices: StaleService[];
  };

  const severityStyles: Record<keyof SeverityCounts, string> = {
    critical: 'border-red-200 bg-red-50 text-red-700',
    high: 'border-orange-200 bg-orange-50 text-orange-700',
    medium: 'border-amber-200 bg-amber-50 text-amber-700',
    low: 'border-slate-200 bg-slate-50 text-slate-600',
    unknown: 'border-slate-200 bg-slate-50 text-slate-600',
  };

  const severityColors: Record<keyof SeverityCounts, string> = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#f59e0b',
    low: '#94a3b8',
    unknown: '#cbd5e1',
  };

  let chart: { destroy: () => void } | null = null;

  function setupSeverityChart(canvas: HTMLCanvasElement) {
    let disposed = false;
    import('chart.js').then(({ Chart, registerables }) => {
      if (disposed) return;
      Chart.register(...registerables);
      chart = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: Object.keys(severityColors),
          datasets: [
            {
              data: Object.keys(severityColors).map((key) => data.severityBreakdown[key]),
              backgroundColor: Object.values(severityColors),
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: { legend: { display: false } },
        },
      });
    });
    return {
      destroy: () => {
        disposed = true;
        chart?.destroy();
        chart = null;
      },
    };
  }

  onDestroy(() => chart?.destroy());

  $: orgSlug = $page.params.org;
  $: projectSlug = $page.params.slug;
  $: cvesHref = (id?: string) =>
    `/org/${orgSlug}/projects/${projectSlug}/code-report/cves${id ? `/${id}` : ''}`;
  $: servicesHref = (slug: string) =>
    `/org/${orgSlug}/projects/${projectSlug}/code-report/services/${slug}`;

  $: totalSeverity =
    data.severityBreakdown.critical +
    data.severityBreakdown.high +
    data.severityBreakdown.medium +
    data.severityBreakdown.low +
    data.severityBreakdown.unknown;

  function formatDate(value: string | null) {
    return value ? new Date(value).toLocaleDateString() : 'Nunca';
  }
</script>

<svelte:head>
  <title>Code Report - Dashboard - GitVault Suite</title>
</svelte:head>

<div class="space-y-6">
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Boxes class="h-3.5 w-3.5" />Servicios
      </div>
      <p class="mt-2 text-3xl font-black text-slate-900">{data.kpis.totalServices}</p>
      <p class="mt-1 text-[11px] text-slate-400">
        {data.kpis.scannedServices} con al menos un análisis completado
      </p>
    </div>

    <div class="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
      <div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-700">
        <ShieldAlert class="h-3.5 w-3.5" />CVEs críticos + altos
      </div>
      <p class="mt-2 text-3xl font-black text-red-800">
        {data.kpis.criticalCount + data.kpis.highCount}
      </p>
      <p class="mt-1 text-[11px] text-red-600">de {data.kpis.totalCves} CVEs detectados en total</p>
    </div>

    <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <KeySquare class="h-3.5 w-3.5" />Secretos expuestos
      </div>
      <p class="mt-2 text-3xl font-black text-slate-900">{data.kpis.exposedSecrets}</p>
      <p class="mt-1 text-[11px] text-slate-400">detectados en los últimos análisis de gitleaks</p>
    </div>

    <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Wrench class="h-3.5 w-3.5" />Cobertura de remediación
      </div>
      <p class="mt-2 text-3xl font-black text-slate-900">
        {data.kpis.remediationCoveragePercent !== null
          ? `${data.kpis.remediationCoveragePercent}%`
          : '—'}
      </p>
      <p class="mt-1 text-[11px] text-slate-400">CVEs con una versión corregida disponible</p>
    </div>
  </div>

  <div class="grid gap-4 lg:grid-cols-3">
    <div class="flex flex-col gap-4 lg:col-span-1">
      <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 class="text-sm font-semibold text-slate-900">Distribución de severidad</h2>
        <p class="mt-1 text-xs text-slate-500">Vulnerabilidades del último análisis de cada servicio.</p>
        {#if totalSeverity === 0}
          <p class="mt-6 text-sm text-slate-500">No se han detectado vulnerabilidades.</p>
        {:else}
          <div class="mt-4 flex flex-col items-center gap-5 sm:flex-row">
            <div class="relative h-36 w-36 shrink-0">
              <canvas use:setupSeverityChart></canvas>
              <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-2xl font-black text-slate-900">{totalSeverity}</span>
                <span class="text-[10px] uppercase tracking-wide text-slate-400">Total</span>
              </div>
            </div>
            <ul class="w-full space-y-2 text-sm">
              {#each Object.entries(severityColors) as [key, color] (key)}
                <li class="flex items-center justify-between gap-2">
                  <span class="flex items-center gap-2 capitalize text-slate-600">
                    <span class="h-2.5 w-2.5 rounded-full" style={`background:${color}`}></span>
                    {key}
                  </span>
                  <span class="font-semibold text-slate-800">{data.severityBreakdown[key]}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </section>

      <section class="flex flex-1 flex-col rounded-2xl border border-dashed border-slate-300 bg-white p-6 shadow-sm">
        <h2 class="text-sm font-semibold text-slate-900">Security Policy</h2>
        <p class="mt-1 text-xs text-slate-500">
          Umbrales de aceptación y políticas de seguridad para este proyecto.
        </p>
        <div
          class="mt-4 flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 py-8 text-xs font-medium text-slate-400"
        >
          Próximamente
        </div>
      </section>
    </div>

    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
      <h2 class="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <AlertTriangle class="h-4 w-4" />CVEs más críticos
      </h2>
      {#if data.topCves.length === 0}
        <p class="mt-4 text-sm text-slate-500">No se han detectado CVEs en este proyecto.</p>
      {:else}
        <div class="mt-4 divide-y divide-slate-100">
          {#each data.topCves as cve (cve.id)}
            <a
              href={cvesHref(cve.id)}
              class="flex items-center justify-between gap-3 py-3 hover:bg-slate-50"
            >
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-sm font-semibold text-slate-900">{cve.id}</span>
                  <span
                    class={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${severityStyles[cve.severity]}`}
                  >
                    {cve.severity}
                  </span>
                </div>
                {#if cve.title}
                  <p class="mt-0.5 truncate text-xs text-slate-500">{cve.title}</p>
                {/if}
              </div>
              <div class="shrink-0 text-right text-xs text-slate-500">
                <p>CVSS {cve.cvssScore !== null ? cve.cvssScore.toFixed(1) : '—'}</p>
                <p>{cve.affectedServiceCount} servicio(s)</p>
              </div>
            </a>
          {/each}
        </div>
        <a
          href={cvesHref()}
          class="mt-4 inline-block text-xs font-semibold text-blue-700 hover:text-blue-900"
        >
          Ver todos los CVEs →
        </a>
      {/if}
    </section>
  </div>

  <div class="grid gap-4 lg:grid-cols-2">
    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <ShieldCheck class="h-4 w-4" />Servicios con más riesgo
      </h2>
      {#if data.riskiestServices.length === 0}
        <p class="mt-4 text-sm text-slate-500">Ningún servicio tiene vulnerabilidades detectadas.</p>
      {:else}
        <ul class="mt-4 space-y-2">
          {#each data.riskiestServices as service (service.id)}
            <li>
              <a
                href={servicesHref(service.slug)}
                class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100"
              >
                <span class="font-semibold text-slate-800">{service.name}</span>
                <div class="flex items-center gap-2 text-xs">
                  {#if service.severity.critical > 0}
                    <span class="rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 font-bold text-red-700">
                      {service.severity.critical} critical
                    </span>
                  {/if}
                  {#if service.severity.high > 0}
                    <span class="rounded-md border border-orange-200 bg-orange-50 px-1.5 py-0.5 font-bold text-orange-700">
                      {service.severity.high} high
                    </span>
                  {/if}
                </div>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <Clock class="h-4 w-4" />Servicios sin análisis recientes
      </h2>
      <p class="mt-1 text-xs text-slate-500">Sin un escaneo completado en los últimos 30 días.</p>
      {#if data.staleServices.length === 0}
        <p class="mt-4 text-sm text-slate-500">Todos los servicios tienen análisis recientes.</p>
      {:else}
        <ul class="mt-4 space-y-2">
          {#each data.staleServices as service (service.id)}
            <li>
              <a
                href={servicesHref(service.slug)}
                class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100"
              >
                <span class="font-semibold text-slate-800">{service.name}</span>
                <span class="text-xs text-slate-500">
                  Último escaneo: {formatDate(service.lastScanAt)}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</div>
