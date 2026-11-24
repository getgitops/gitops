<!--
  Panel de Code Report del proyecto: cuántos servicios, qué CVEs críticos y altos hay, secretos
  expuestos, qué servicios y paquetes concentran el riesgo y si se cumplen las políticas.
-->
<script lang="ts">
  import type { Component } from 'svelte';
  import { page } from '$app/state';
  import {
    ArrowRight,
    ArrowUpRight,
    Boxes,
    CircleCheck,
    Clock,
    FileSearch,
    KeyRound,
    Package,
    ShieldAlert,
    ShieldCheck,
    TriangleAlert,
    Wrench,
  } from '@lucide/svelte';
  import CodeReportToolBadge from '#lib/components/code-report/CodeReportToolBadge.svelte';
  import { SEVERITY_FILL, SEVERITY_LABEL, type SeverityKey } from '#lib/code-report/severity-ui';
  import { _, locale } from '#lib/i18n';

  type SeverityCounts = Record<SeverityKey, number>;
  type LevelKey = 'none' | 'low' | 'medium' | 'high' | 'critical';

  type Data = {
    project?: { slug?: string; organization?: { slug?: string | null } | null };
    kpis: {
      totalServices: number;
      scannedServices: number;
      totalCves: number;
      criticalCount: number;
      highCount: number;
      criticalCves: number;
      highCves: number;
      exposedSecrets: number;
      servicesWithSecrets: number;
      remediableCves: number;
      remediationCoveragePercent: number | null;
      staleServicesCount: number;
    };
    securityPolicies: {
      total: number;
      active: number;
      evaluatedServices: number;
      failingServices: number;
      compliantServices: number;
      totalViolations: number;
      violatedPolicies: { id: string; name: string; enforcement: string; services: string[] }[];
    };
    severityBreakdown: SeverityCounts;
    cvesBySeverity: SeverityCounts;
    topCves: {
      id: string;
      title: string;
      severity: SeverityKey;
      cvssScore: number | null;
      affectedServiceCount: number;
      packageName: string;
      installedVersion: string;
      fixedVersion: string;
      services: { slug: string; name: string }[];
    }[];
    topPackages: {
      name: string;
      cves: number;
      critical: number;
      high: number;
      fixable: number;
      services: number;
    }[];
    riskiestServices: {
      id: string;
      slug: string;
      name: string;
      severity: SeverityCounts;
      riskScore: number;
      level: LevelKey;
      exposedSecrets: number;
      violatesPolicy: boolean;
    }[];
    secretsByService: { slug: string; name: string; exposedSecrets: number }[];
    recentAnalyses: {
      id: string;
      tool: string;
      status: string;
      createdAt: string;
      serviceName: string | null;
      critical: number | null;
    }[];
    staleServices: {
      id: string;
      slug: string;
      name: string;
      scanned: boolean;
      lastScanAt: string | null;
    }[];
  };

  let { data }: { data: Data } = $props();

  const orgSlug = $derived(data.project?.organization?.slug ?? page.params.org ?? '');
  const projectSlug = $derived(data.project?.slug ?? page.params.slug ?? '');
  const base = $derived(`/org/${orgSlug}/projects/${projectSlug}/code-report`);
  const cvesHref = (id?: string) =>
    `/org/${orgSlug}/cves${id ? `/${encodeURIComponent(id)}` : `?project=${projectSlug}`}`;
  const serviceHref = (slug: string) => `${base}/services/${slug}`;

  const k = $derived(data.kpis);
  const policies = $derived(data.securityPolicies);

  const SEVERITIES: SeverityKey[] = ['critical', 'high', 'medium', 'low', 'unknown'];
  const SEVERITY_BADGE: Record<SeverityKey, string> = {
    critical: 'k-badge-danger',
    high: 'k-badge-brand',
    medium: 'k-badge-warn',
    low: '',
    unknown: '',
  };
  const LEVELS: Record<LevelKey, { label: string; badge: string; fill: string }> = {
    none: { label: 'Sin riesgo', badge: 'k-badge-ok', fill: 'bg-ok' },
    low: { label: 'Bajo', badge: '', fill: 'bg-white/35' },
    medium: { label: 'Medio', badge: 'k-badge-warn', fill: 'bg-amber-400' },
    high: { label: 'Alto', badge: 'k-badge-brand', fill: 'bg-brand-500' },
    critical: { label: 'Crítico', badge: 'k-badge-danger', fill: 'bg-red-500' },
  };
  const severityChips: { key: SeverityKey; letter: string }[] = [
    { key: 'critical', letter: 'C' },
    { key: 'high', letter: 'H' },
    { key: 'medium', letter: 'M' },
    { key: 'low', letter: 'L' },
  ];

  const totalFindings = $derived(
    SEVERITIES.reduce((sum, key) => sum + data.severityBreakdown[key], 0),
  );
  const policyState = $derived(
    policies.active === 0
      ? 'none'
      : policies.failingServices > 0
        ? 'violated'
        : policies.evaluatedServices === 0
          ? 'pending'
          : 'compliant',
  );
  const topRisk = $derived(
    Math.max(1, ...data.riskiestServices.map((service) => service.riskScore)),
  );

  function relative(iso: string | null) {
    if (!iso) return 'Nunca';
    const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat($locale ?? 'es', { numeric: 'auto' });
    for (const [unit, size] of [
      ['day', 86_400],
      ['hour', 3_600],
      ['minute', 60],
    ] as [Intl.RelativeTimeFormatUnit, number][]) {
      if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
    }
    return rtf.format(Math.round(seconds), 'second');
  }
</script>

<svelte:head>
  <title>Code Report - Dashboard - GitOps</title>
</svelte:head>

{#snippet kpi(
  href: string,
  icon: Component<any>,
  label: string,
  value: string | number,
  detail: string,
  tone: string,
)}
  {@const Icon = icon}
  <a {href} class="k-card k-card-hover group p-4">
    <p class="flex items-center justify-between gap-2 text-xs text-fg-subtle">
      <span class="flex min-w-0 items-center gap-1.5"
        ><Icon class="h-3.5 w-3.5 shrink-0" /><span class="truncate">{label}</span></span
      >
      <ArrowRight
        class="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:text-brand-400 group-hover:opacity-100"
      />
    </p>
    <p class="mt-2 text-2xl font-semibold tabular-nums {tone}">{value}</p>
    <p class="mt-0.5 truncate text-xs text-fg-subtle">{detail}</p>
  </a>
{/snippet}

<div class="space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="max-w-2xl">
      <h1 class="text-2xl font-semibold tracking-tight text-white">Code Report</h1>
      <p class="mt-1 text-sm text-fg-muted">
        Vulnerabilidades, secretos y cumplimiento según el último análisis de cada servicio.
      </p>
    </div>
    <div class="flex gap-2">
      <a href={cvesHref()} class="k-btn k-btn-secondary"><ShieldAlert class="h-4 w-4" />CVEs</a>
      <a href={`${base}/services`} class="k-btn k-btn-secondary"
        ><Boxes class="h-4 w-4" />Servicios</a
      >
    </div>
  </header>

  <!-- KPIs -->
  <section class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Indicadores">
    {@render kpi(
      `${base}/services`,
      Boxes,
      'Servicios',
      `${k.scannedServices}/${k.totalServices}`,
      k.staleServicesCount > 0
        ? `${k.staleServicesCount} sin análisis en 30 días`
        : 'Analizados y al día',
      k.staleServicesCount > 0 ? 'text-amber-300' : 'text-white',
    )}
    {@render kpi(
      cvesHref(),
      ShieldAlert,
      'CVEs críticos',
      k.criticalCves,
      `${k.criticalCount} ${k.criticalCount === 1 ? 'hallazgo' : 'hallazgos'} en servicios`,
      k.criticalCves > 0 ? 'text-red-300' : 'text-white',
    )}
    {@render kpi(
      cvesHref(),
      TriangleAlert,
      'CVEs altos',
      k.highCves,
      `${k.highCount} ${k.highCount === 1 ? 'hallazgo' : 'hallazgos'} en servicios`,
      k.highCves > 0 ? 'text-brand-300' : 'text-white',
    )}
    {@render kpi(
      `${base}/services`,
      KeyRound,
      'Secretos expuestos',
      k.exposedSecrets,
      k.servicesWithSecrets > 0
        ? `en ${k.servicesWithSecrets} ${k.servicesWithSecrets === 1 ? 'servicio' : 'servicios'}`
        : 'Ninguno detectado',
      k.exposedSecrets > 0 ? 'text-red-300' : 'text-white',
    )}
    {@render kpi(
      cvesHref(),
      Wrench,
      'Con corrección',
      k.remediationCoveragePercent !== null ? `${k.remediationCoveragePercent}%` : '—',
      `${k.remediableCves} de ${k.totalCves} CVEs tienen versión corregida`,
      'text-white',
    )}
    {@render kpi(
      `${base}/security-policy`,
      policyState === 'violated' ? ShieldAlert : ShieldCheck,
      'Políticas',
      policyState === 'none'
        ? '—'
        : policyState === 'pending'
          ? '…'
          : `${policies.compliantServices}/${policies.evaluatedServices}`,
      policyState === 'none'
        ? 'Sin políticas activas'
        : policyState === 'violated'
          ? `${policies.failingServices} ${policies.failingServices === 1 ? 'servicio incumple' : 'servicios incumplen'}`
          : policyState === 'pending'
            ? 'Pendiente de análisis'
            : 'Todos los servicios cumplen',
      policyState === 'violated'
        ? 'text-red-300'
        : policyState === 'compliant'
          ? 'text-ok'
          : 'text-white',
    )}
  </section>

  <!-- CVEs importantes + severidad y políticas -->
  <div class="grid gap-4 lg:grid-cols-3">
    <section class="k-card min-w-0 overflow-hidden lg:col-span-2" aria-labelledby="cves-title">
      <div class="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div>
          <h2 id="cves-title" class="font-semibold text-white">CVEs importantes</h2>
          <p class="text-xs text-fg-subtle">Críticos y altos, del más grave al menos</p>
        </div>
        <a href={cvesHref()} class="text-xs text-fg-subtle hover:text-white">Ver todos</a>
      </div>
      {#if data.topCves.length === 0}
        <div class="flex items-center gap-3 px-5 py-10 text-sm text-fg-muted">
          <CircleCheck class="h-4 w-4 text-ok" />Ningún CVE crítico ni alto en el último análisis.
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full min-w-176 text-left text-sm">
            <thead class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
              <tr class="border-b border-white/8">
                <th class="px-5 py-2.5 font-semibold">CVE</th>
                <th class="px-3 py-2.5 font-semibold">Paquete</th>
                <th class="px-3 py-2.5 font-semibold">Corrección</th>
                <th class="px-3 py-2.5 font-semibold">Servicios</th>
                <th class="px-5 py-2.5 text-right font-semibold">CVSS</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              {#each data.topCves as cve (cve.id)}
                <tr class="align-top transition-colors hover:bg-white/2.5">
                  <td class="px-5 py-3">
                    <a href={cvesHref(cve.id)} class="group block">
                      <span class="flex items-center gap-2">
                        <span class="k-badge h-5 px-1.5 text-[11px] {SEVERITY_BADGE[cve.severity]}"
                          >{SEVERITY_LABEL[cve.severity]}</span
                        >
                        <span class="font-mono text-[13px] text-white group-hover:text-brand-300"
                          >{cve.id}</span
                        >
                      </span>
                      {#if cve.title}
                        <span
                          class="mt-1 block max-w-xs truncate text-xs text-fg-subtle"
                          title={cve.title}>{cve.title}</span
                        >
                      {/if}
                    </a>
                  </td>
                  <td class="px-3 py-3">
                    <p class="font-mono text-xs text-fg">{cve.packageName || '—'}</p>
                    {#if cve.installedVersion}
                      <p class="font-mono text-[11px] text-fg-subtle">{cve.installedVersion}</p>
                    {/if}
                  </td>
                  <td class="px-3 py-3">
                    {#if cve.fixedVersion}
                      <span
                        class="k-badge k-badge-ok h-5 max-w-40 px-1.5 font-mono text-[11px]"
                        title={cve.fixedVersion}
                        ><span class="truncate">→ {cve.fixedVersion}</span></span
                      >
                    {:else}
                      <span class="text-xs text-fg-subtle">Sin corrección</span>
                    {/if}
                  </td>
                  <td class="px-3 py-3">
                    <div class="flex max-w-56 flex-wrap gap-1">
                      {#each cve.services.slice(0, 3) as service (service.slug)}
                        <a
                          href={serviceHref(service.slug)}
                          class="k-badge h-5 px-1.5 text-[11px] hover:text-white">{service.name}</a
                        >
                      {/each}
                      {#if cve.services.length > 3}
                        <span class="k-badge h-5 px-1.5 text-[11px]"
                          >+{cve.services.length - 3}</span
                        >
                      {/if}
                    </div>
                  </td>
                  <td class="px-5 py-3 text-right font-mono text-sm tabular-nums text-fg">
                    {cve.cvssScore !== null ? cve.cvssScore.toFixed(1) : '—'}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>

    <div class="min-w-0 space-y-4">
      <section class="k-card p-5" aria-labelledby="severity-title">
        <h2 id="severity-title" class="font-semibold text-white">Severidad</h2>
        <p class="text-xs text-fg-subtle">
          {totalFindings}
          {totalFindings === 1 ? 'hallazgo' : 'hallazgos'} · {k.totalCves} CVEs distintos
        </p>
        {#if totalFindings === 0}
          <p class="mt-4 flex items-center gap-2 text-sm text-fg-muted">
            <CircleCheck class="h-4 w-4 text-ok" />Sin vulnerabilidades detectadas.
          </p>
        {:else}
          <div class="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
            {#each SEVERITIES as key (key)}
              {#if data.severityBreakdown[key] > 0}
                <div
                  class="{SEVERITY_FILL[key]} h-full"
                  style="flex:{data.severityBreakdown[key]}"
                ></div>
              {/if}
            {/each}
          </div>
          <dl class="mt-4 space-y-2 text-sm">
            {#each SEVERITIES as key (key)}
              <div class="flex items-center justify-between gap-3">
                <dt class="flex items-center gap-2 text-fg-muted">
                  <span class="h-2 w-2 rounded-full {SEVERITY_FILL[key]}"></span>{SEVERITY_LABEL[
                    key
                  ]}
                </dt>
                <dd class="tabular-nums text-fg">
                  {data.severityBreakdown[key]}
                  <span class="ml-1 text-xs text-fg-subtle">({data.cvesBySeverity[key]} CVEs)</span>
                </dd>
              </div>
            {/each}
          </dl>
        {/if}
      </section>

      <section
        class="k-card overflow-hidden {policyState === 'violated' ? 'border-danger/30' : ''}"
        aria-labelledby="policy-title"
      >
        <div class="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <h2 id="policy-title" class="flex items-center gap-2 font-semibold text-white">
            {#if policyState === 'violated'}<ShieldAlert
                class="h-4 w-4 text-red-400"
              />{:else}<ShieldCheck
                class="h-4 w-4 {policyState === 'compliant' ? 'text-ok' : 'text-fg-subtle'}"
              />{/if}
            Security Policy
          </h2>
          <a href={`${base}/security-policy`} class="text-xs text-fg-subtle hover:text-white"
            >Gestionar</a
          >
        </div>
        {#if policyState === 'violated'}
          <p class="px-5 pt-4 text-sm text-fg-muted">
            <span class="font-semibold text-red-300">{policies.failingServices}</span>
            {policies.failingServices === 1 ? 'servicio incumple' : 'servicios incumplen'} ·
            {policies.totalViolations} reglas superadas
          </p>
          <ul class="space-y-1.5 p-5 pt-3">
            {#each policies.violatedPolicies as policy (policy.id)}
              <li>
                <a
                  href={`${base}/security-policy/${policy.id}`}
                  class="flex items-center justify-between gap-2 rounded-lg border border-danger/20 bg-danger/6 px-3 py-2 text-sm hover:border-danger/40"
                >
                  <span class="truncate text-red-100">{policy.name}</span>
                  <span class="k-badge k-badge-danger h-5 shrink-0 px-1.5 text-[11px]"
                    >{policy.services.length}
                    {policy.services.length === 1 ? 'servicio' : 'servicios'}</span
                  >
                </a>
              </li>
            {/each}
          </ul>
        {:else if policyState === 'compliant'}
          <p class="flex items-center gap-2 px-5 py-5 text-sm text-fg-muted">
            <CircleCheck class="h-4 w-4 text-ok" />
            {policies.compliantServices}
            {policies.compliantServices === 1 ? 'servicio cumple' : 'servicios cumplen'} las {policies.active}
            políticas activas.
          </p>
        {:else}
          <p class="px-5 py-5 text-sm text-fg-muted">
            {#if policyState === 'none'}
              Sin políticas activas.
              <a href={`${base}/security-policy`} class="text-brand-400 hover:text-brand-300"
                >Crea la primera</a
              >
            {:else}
              Hay {policies.active} políticas activas, pendientes de un análisis para evaluarse.
            {/if}
          </p>
        {/if}
      </section>
    </div>
  </div>

  <!-- Servicios con más riesgo + paquetes -->
  <div class="grid gap-4 lg:grid-cols-3">
    <section class="k-card min-w-0 overflow-hidden lg:col-span-2" aria-labelledby="risk-title">
      <div class="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <h2 id="risk-title" class="font-semibold text-white">Servicios con más riesgo</h2>
        <a href={`${base}/services`} class="text-xs text-fg-subtle hover:text-white">Ver todos</a>
      </div>
      {#if data.riskiestServices.length === 0}
        <div class="flex items-center gap-3 px-5 py-10 text-sm text-fg-muted">
          <CircleCheck class="h-4 w-4 text-ok" />Ningún servicio tiene vulnerabilidades ni secretos
          expuestos.
        </div>
      {:else}
        <ul class="divide-y divide-white/6">
          {#each data.riskiestServices as service (service.id)}
            {@const level = LEVELS[service.level]}
            <li>
              <a
                href={serviceHref(service.slug)}
                class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-white/2.5"
              >
                <div class="min-w-0 flex-1">
                  <p class="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
                    <span class="truncate">{service.name}</span>
                    <span class="k-badge h-5 px-1.5 text-[11px] {level.badge}">{level.label}</span>
                    {#if service.violatesPolicy}
                      <span class="k-badge k-badge-danger h-5 px-1.5 text-[11px]"
                        >Incumple política</span
                      >
                    {/if}
                  </p>
                  <div class="mt-1.5 flex items-center gap-2">
                    <div class="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-white/6">
                      <div
                        class="h-full rounded-full {level.fill}"
                        style="width:{Math.max(4, (service.riskScore / topRisk) * 100)}%"
                      ></div>
                    </div>
                    <span class="text-xs tabular-nums text-fg-subtle">{service.riskScore}</span>
                    {#if service.exposedSecrets > 0}
                      <span class="flex items-center gap-1 text-xs text-red-300"
                        ><KeyRound class="h-3 w-3" />{service.exposedSecrets}</span
                      >
                    {/if}
                  </div>
                </div>
                <div class="flex gap-1">
                  {#each severityChips as chip (chip.key)}
                    <span
                      class="k-badge {SEVERITY_BADGE[chip.key]} font-semibold tabular-nums {service
                        .severity[chip.key] === 0
                        ? 'opacity-40'
                        : ''}"
                      title={SEVERITY_LABEL[chip.key]}
                      >{chip.letter} {service.severity[chip.key]}</span
                    >
                  {/each}
                </div>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="k-card min-w-0 overflow-hidden" aria-labelledby="packages-title">
      <div class="border-b border-white/8 px-5 py-4">
        <h2 id="packages-title" class="font-semibold text-white">Paquetes a actualizar</h2>
        <p class="text-xs text-fg-subtle">Los que más CVEs críticos y altos acumulan</p>
      </div>
      {#if data.topPackages.length === 0}
        <p class="flex items-center gap-2 px-5 py-8 text-sm text-fg-muted">
          <CircleCheck class="h-4 w-4 text-ok" />Ningún paquete con CVEs críticos o altos.
        </p>
      {:else}
        <ul class="divide-y divide-white/6">
          {#each data.topPackages as pkg (pkg.name)}
            <li class="flex items-center gap-3 px-5 py-3">
              <span
                class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 text-fg-subtle"
                ><Package class="h-4 w-4" /></span
              >
              <span class="min-w-0 flex-1">
                <span class="block truncate font-mono text-[13px] text-white" title={pkg.name}
                  >{pkg.name}</span
                >
                <span class="block text-xs text-fg-subtle">
                  {pkg.cves} CVEs · {pkg.services}
                  {pkg.services === 1 ? 'servicio' : 'servicios'}
                  {#if pkg.fixable > 0}· <span class="text-ok">{pkg.fixable} con corrección</span
                    >{/if}
                </span>
              </span>
              <span class="flex shrink-0 gap-1">
                {#if pkg.critical > 0}<span
                    class="k-badge k-badge-danger font-semibold tabular-nums">C {pkg.critical}</span
                  >{/if}
                {#if pkg.high > 0}<span class="k-badge k-badge-brand font-semibold tabular-nums"
                    >H {pkg.high}</span
                  >{/if}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>

  <!-- Secretos, servicios sin análisis y actividad -->
  <div class="grid gap-4 lg:grid-cols-3">
    <section class="k-card min-w-0 overflow-hidden" aria-labelledby="secrets-title">
      <div class="border-b border-white/8 px-5 py-4">
        <h2 id="secrets-title" class="flex items-center gap-2 font-semibold text-white">
          <KeyRound
            class="h-4 w-4 {data.secretsByService.length ? 'text-red-400' : 'text-fg-subtle'}"
          />Secretos expuestos
        </h2>
        <p class="text-xs text-fg-subtle">Detectados por Gitleaks en el último análisis</p>
      </div>
      {#if data.secretsByService.length === 0}
        <p class="flex items-center gap-2 px-5 py-8 text-sm text-fg-muted">
          <CircleCheck class="h-4 w-4 text-ok" />Ningún secreto expuesto.
        </p>
      {:else}
        <ul class="divide-y divide-white/6">
          {#each data.secretsByService as service (service.slug)}
            <li>
              <a
                href={serviceHref(service.slug)}
                class="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-white/2.5"
              >
                <span class="truncate text-white">{service.name}</span>
                <span class="k-badge k-badge-danger tabular-nums">{service.exposedSecrets}</span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="k-card min-w-0 overflow-hidden" aria-labelledby="stale-title">
      <div class="border-b border-white/8 px-5 py-4">
        <h2 id="stale-title" class="flex items-center gap-2 font-semibold text-white">
          <Clock class="h-4 w-4 {data.staleServices.length ? 'text-warn' : 'text-fg-subtle'}" />Sin
          análisis recientes
        </h2>
        <p class="text-xs text-fg-subtle">Sin escaneo completado en 30 días</p>
      </div>
      {#if data.staleServices.length === 0}
        <p class="flex items-center gap-2 px-5 py-8 text-sm text-fg-muted">
          <CircleCheck class="h-4 w-4 text-ok" />Todos los servicios están al día.
        </p>
      {:else}
        <ul class="divide-y divide-white/6">
          {#each data.staleServices as service (service.id)}
            <li>
              <a
                href={serviceHref(service.slug)}
                class="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-white/2.5"
              >
                <span class="truncate text-white">{service.name}</span>
                <span
                  class="shrink-0 text-xs {service.lastScanAt
                    ? 'text-fg-subtle'
                    : 'text-amber-300'}"
                  >{service.lastScanAt ? relative(service.lastScanAt) : 'Nunca analizado'}</span
                >
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="k-card min-w-0 overflow-hidden" aria-labelledby="activity-title">
      <div class="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <h2 id="activity-title" class="font-semibold text-white">Últimos análisis</h2>
        <a href={`${base}/history`} class="text-xs text-fg-subtle hover:text-white">Historial</a>
      </div>
      {#if data.recentAnalyses.length === 0}
        <p class="flex items-center gap-2 px-5 py-8 text-sm text-fg-muted">
          <FileSearch class="h-4 w-4" />Aparecerán cuando tu pipeline envíe el primero.
        </p>
      {:else}
        <ul class="divide-y divide-white/6">
          {#each data.recentAnalyses as analysis (analysis.id)}
            <li>
              <a
                href={`${base}/history/${analysis.id}`}
                class="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-white/2.5"
              >
                <CodeReportToolBadge tool={analysis.tool} size="sm" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm text-white"
                    >{analysis.serviceName ?? $_('codeReport.history.serviceDeleted')}</span
                  >
                  <span class="block text-xs text-fg-subtle">{relative(analysis.createdAt)}</span>
                </span>
                {#if analysis.status === 'failed'}
                  <span class="k-badge k-badge-danger">{$_('codeReport.history.failed')}</span>
                {:else if analysis.status === 'in_progress'}
                  <span class="k-badge k-badge-info">{$_('codeReport.history.inProgress')}</span>
                {:else if analysis.critical !== null && analysis.critical > 0}
                  <span class="k-badge k-badge-danger font-semibold tabular-nums"
                    >C {analysis.critical}</span
                  >
                {:else}
                  <ArrowUpRight class="h-3.5 w-3.5 text-fg-subtle" />
                {/if}
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</div>
