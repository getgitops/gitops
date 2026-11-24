<script lang="ts">
  import {
    Activity,
    ArrowRight,
    BarChart3,
    Bell,
    Boxes,
    CircleCheck,
    Clock,
    FileSearch,
    GitBranch,
    KeyRound,
    LockKeyhole,
    Plus,
    Settings,
    ShieldAlert,
    TriangleAlert,
    UserPlus,
  } from '@lucide/svelte';
  import type { Component } from 'svelte';
  import UptimeBars from '#lib/components/monitoring/UptimeBars.svelte';
  import CodeReportToolBadge from '#lib/components/code-report/CodeReportToolBadge.svelte';
  import { formatUptime, statusStyle, uptimeTone } from '#lib/monitoring/format';
  import { _, locale } from '#lib/i18n';

  type Severity = { critical: number; high: number; medium: number; low: number; unknown: number };
  type LevelKey = 'none' | 'low' | 'medium' | 'high' | 'critical';
  type Bar = {
    start: string;
    end: string;
    status: 'up' | 'degraded' | 'down' | 'none';
    uptime: number | null;
    checks: number;
    downSeconds: number;
    degradedSeconds: number;
    latencyAvg: number | null;
  };

  type Dashboard = {
    modules: { vault: boolean; codereport: boolean; monitoring: boolean; stateiac: boolean };
    access: { vault: boolean; codereport: boolean; monitoring: boolean };
    codeReport: {
      totals: Severity;
      services: { total: number; scanned: number; stale: number };
      exposedSecrets: number;
      score: number | null;
      levels: Record<LevelKey, number>;
      criticalDelta: number | null;
      riskiest: {
        slug: string;
        name: string;
        severity: Severity | null;
        riskScore: number;
        level: LevelKey | null;
        exposedSecrets: number;
      }[];
      recent: {
        id: string;
        tool: string;
        status: string;
        createdAt: string;
        serviceName: string | null;
        critical: number | null;
      }[];
    } | null;
    vault: {
      secrets: number;
      folders: number;
      environments: { slug: string; name: string; filled: number; missing: number }[];
    } | null;
    monitoring: {
      total: number;
      up: number;
      down: number;
      degraded: number;
      paused: number;
      pending: number;
      uptime24h: number | null;
      uptime30d: number | null;
      latencyP95: number | null;
      monitors: {
        id: string;
        name: string;
        url: string;
        status: string;
        uptime24h: number | null;
        hourlyBars: Bar[];
      }[];
    } | null;
    alerts: { total: number; enabled: number } | null;
    can: {
      createSecret: boolean;
      createService: boolean;
      createMonitor: boolean;
      createAlert: boolean;
      manageMembers: boolean;
      manageKeys: boolean;
      updateProject: boolean;
    };
  };

  let {
    data,
  }: {
    data: {
      project: {
        id: string;
        name: string;
        slug: string;
        description?: string | null;
        status: 'active' | 'inactive';
        organization?: { slug?: string | null; name?: string | null } | null;
      };
      dashboard: Dashboard;
    };
  } = $props();

  const project = $derived(data.project);
  const d = $derived(data.dashboard);
  const base = $derived(`/org/${project.organization?.slug ?? ''}/projects/${project.slug}`);

  const showCodeReport = $derived(d.modules.codereport && d.access.codereport && !!d.codeReport);
  const showVault = $derived(d.modules.vault && d.access.vault && !!d.vault);
  const showMonitoring = $derived(d.modules.monitoring && d.access.monitoring && !!d.monitoring);

  const vaultMissing = $derived(
    d.vault?.environments.reduce((sum, environment) => sum + environment.missing, 0) ?? 0,
  );

  // ---------- salud ----------

  type Grade = { letter: string; label: string; text: string; stroke: string };
  function gradeOf(score: number): Grade {
    if (score >= 90) return { letter: 'A', label: 'Excelente', text: 'text-ok', stroke: '#22c55e' };
    if (score >= 75) return { letter: 'B', label: 'Bien', text: 'text-ok', stroke: '#22c55e' };
    if (score >= 60)
      return { letter: 'C', label: 'Mejorable', text: 'text-warn', stroke: '#f59e0b' };
    if (score >= 40)
      return { letter: 'D', label: 'En riesgo', text: 'text-brand-300', stroke: '#f95d11' };
    return { letter: 'F', label: 'Crítico', text: 'text-red-300', stroke: '#ef4444' };
  }

  // de menos a más riesgo, con el código de color de /brand
  const LEVELS: { key: LevelKey; label: string; fill: string; badge: string }[] = [
    { key: 'none', label: 'Sin riesgo', fill: 'bg-ok', badge: 'k-badge-ok' },
    { key: 'low', label: 'Bajo', fill: 'bg-white/35', badge: '' },
    { key: 'medium', label: 'Medio', fill: 'bg-amber-400', badge: 'k-badge-warn' },
    { key: 'high', label: 'Alto', fill: 'bg-brand-500', badge: 'k-badge-brand' },
    { key: 'critical', label: 'Crítico', fill: 'bg-red-500', badge: 'k-badge-danger' },
  ];
  const levelMeta = (key: LevelKey | null) => LEVELS.find((level) => level.key === key);

  const monitoringState = $derived.by(() => {
    const mon = d.monitoring;
    if (!mon || mon.total === 0) return null;
    if (mon.down > 0)
      return {
        tone: 'danger',
        title: `${mon.down} ${mon.down === 1 ? 'monitor caído' : 'monitores caídos'}`,
      };
    if (mon.degraded > 0)
      return {
        tone: 'warn',
        title: `${mon.degraded} ${mon.degraded === 1 ? 'monitor degradado' : 'monitores degradados'}`,
      };
    if (mon.up === 0) return { tone: 'neutral', title: 'Sin datos todavía' };
    return { tone: 'ok', title: 'Todo operativo' };
  });

  function formatMs(value: number | null) {
    if (value === null) return '—';
    return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
  }

  // ---------- qué requiere atención ----------

  type Issue = { tone: 'danger' | 'warn'; text: string; href: string; icon: Component<any> };

  const issues = $derived.by(() => {
    const list: Issue[] = [];
    const cr = showCodeReport ? d.codeReport : null;
    const mon = showMonitoring ? d.monitoring : null;
    if (mon && mon.down > 0)
      list.push({
        tone: 'danger',
        text: `${mon.down} ${mon.down === 1 ? 'monitor caído' : 'monitores caídos'}`,
        href: `${base}/monitoring/monitors`,
        icon: Activity,
      });
    if (cr && cr.totals.critical > 0)
      list.push({
        tone: 'danger',
        text: `${cr.totals.critical} ${cr.totals.critical === 1 ? 'vulnerabilidad crítica' : 'vulnerabilidades críticas'}`,
        href: `${base}/code-report/dashboard`,
        icon: ShieldAlert,
      });
    if (cr && cr.exposedSecrets > 0)
      list.push({
        tone: 'danger',
        text: `${cr.exposedSecrets} ${cr.exposedSecrets === 1 ? 'secreto expuesto' : 'secretos expuestos'} en el código`,
        href: `${base}/code-report/services`,
        icon: KeyRound,
      });
    if (mon && mon.degraded > 0)
      list.push({
        tone: 'warn',
        text: `${mon.degraded} ${mon.degraded === 1 ? 'monitor degradado' : 'monitores degradados'}`,
        href: `${base}/monitoring/monitors`,
        icon: Activity,
      });
    if (showVault && vaultMissing > 0) {
      const envs = d.vault!.environments.filter((environment) => environment.missing > 0);
      list.push({
        tone: 'warn',
        text: `${vaultMissing} ${vaultMissing === 1 ? 'valor sin rellenar' : 'valores sin rellenar'} en ${envs.map((environment) => environment.name).join(', ')}`,
        href: `${base}/vault/${envs[0].slug}`,
        icon: LockKeyhole,
      });
    }
    if (cr && cr.services.stale > 0)
      list.push({
        tone: 'warn',
        text: `${cr.services.stale} ${cr.services.stale === 1 ? 'servicio sin analizar' : 'servicios sin analizar'} en 30 días`,
        href: `${base}/code-report/services`,
        icon: Clock,
      });
    return list;
  });

  // ---------- accesos rápidos ----------

  const quickActions = $derived(
    [
      {
        visible: showVault && d.can.createSecret,
        label: 'Nuevo secreto',
        href: `${base}/vault`,
        icon: LockKeyhole,
      },
      {
        visible: showCodeReport && d.can.createService,
        label: 'Añadir servicio',
        href: `${base}/code-report/services`,
        icon: Boxes,
      },
      {
        visible: showMonitoring && d.can.createMonitor,
        label: 'Nuevo monitor',
        href: `${base}/monitoring/monitors/new`,
        icon: Activity,
      },
      {
        visible: d.can.createAlert,
        label: 'Nueva alerta',
        href: `${base}/settings/alerts/new`,
        icon: Bell,
      },
      {
        visible: d.can.manageMembers,
        label: $_('project.overview.inviteMembers'),
        href: `${base}/settings/access-control`,
        icon: UserPlus,
      },
      {
        visible: d.can.manageKeys,
        label: $_('project.overview.addSecretToken'),
        href: `${base}/settings/server-access-keys`,
        icon: KeyRound,
      },
    ].filter((action) => action.visible),
  );

  const inactiveModules = $derived(
    [
      { key: 'codereport', label: 'Code Report', icon: BarChart3 },
      { key: 'vault', label: 'Vault', icon: LockKeyhole },
      { key: 'monitoring', label: 'Monitoring', icon: Activity },
      { key: 'stateiac', label: 'State IaC', icon: GitBranch },
    ].filter((module) => !d.modules[module.key as keyof Dashboard['modules']]),
  );

  // ---------- formato ----------

  function relative(iso: string) {
    const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat($locale ?? 'es', { numeric: 'auto' });
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
      ['day', 86_400],
      ['hour', 3_600],
      ['minute', 60],
    ];
    for (const [unit, size] of units) {
      if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
    }
    return rtf.format(Math.round(seconds), 'second');
  }

  function percent(part: number, total: number) {
    return total > 0 ? Math.round((part / total) * 100) : 100;
  }

  const severityChips: { key: keyof Severity; letter: string; className: string }[] = [
    { key: 'critical', letter: 'C', className: 'k-badge-danger' },
    { key: 'high', letter: 'H', className: 'k-badge-brand' },
    { key: 'medium', letter: 'M', className: 'k-badge-warn' },
    { key: 'low', letter: 'L', className: '' },
  ];
</script>

<svelte:head>
  <title>{$_('project.layout.overview')} - {project.name}</title>
</svelte:head>

{#snippet kpi(
  href: string,
  icon: Component<any>,
  label: string,
  value: string | number,
  detail: string,
  tone = 'text-white',
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
  <!-- Cabecera -->
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="max-w-2xl">
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-2xl font-semibold tracking-tight text-white">{project.name}</h1>
        <span class="k-badge {project.status === 'active' ? 'k-badge-ok' : ''}">
          <span
            class="h-1.5 w-1.5 rounded-full {project.status === 'active'
              ? 'bg-ok'
              : 'bg-fg-subtle'}"
          ></span>
          {project.status === 'active' ? $_('common.active') : $_('common.inactive')}
        </span>
      </div>
      <p class="mt-1 text-sm text-fg-muted">
        {project.description || $_('project.overview.noDescription')}
      </p>
    </div>
    <a href={`${base}/settings/overview`} class="k-btn k-btn-secondary">
      <Settings class="h-4 w-4" />Ajustes del proyecto
    </a>
  </header>

  <!-- Salud: seguridad (Code Report) y disponibilidad (Monitoring) -->
  {#if showCodeReport || showMonitoring}
    <section
      class="grid gap-4 {showCodeReport && showMonitoring ? 'lg:grid-cols-2' : ''}"
      aria-label="Salud del proyecto"
    >
      {#if showCodeReport && d.codeReport}
        {@const cr = d.codeReport}
        {@const grade = cr.score !== null ? gradeOf(cr.score) : null}
        {@const scanned = LEVELS.reduce((sum, level) => sum + cr.levels[level.key], 0)}
        <article class="k-card relative overflow-hidden p-5" aria-labelledby="security-title">
          {#if grade}
            <div
              class="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-15 blur-3xl"
              style="background:{grade.stroke}"
            ></div>
          {/if}
          <div class="relative flex items-center justify-between">
            <h2
              id="security-title"
              class="flex items-center gap-2 text-sm font-semibold text-white"
            >
              <ShieldAlert class="h-4 w-4 text-brand-400" />Seguridad del código
            </h2>
            <a
              href={`${base}/code-report/dashboard`}
              class="text-xs text-fg-subtle hover:text-white">Code Report</a
            >
          </div>

          {#if grade && cr.score !== null}
            <div class="relative mt-4 flex items-center gap-5">
              <!-- indicador circular de la puntuación -->
              <div class="relative h-24 w-24 shrink-0">
                <svg viewBox="0 0 36 36" class="h-24 w-24 -rotate-90" aria-hidden="true">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    stroke-width="3"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke={grade.stroke}
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-dasharray="{cr.score} 100"
                  />
                </svg>
                <div class="absolute inset-0 grid place-items-center text-center">
                  <span>
                    <span class="block text-2xl font-semibold tabular-nums text-white"
                      >{cr.score}</span
                    >
                    <span class="block text-[10px] uppercase tracking-wide text-fg-subtle"
                      >de 100</span
                    >
                  </span>
                </div>
              </div>
              <div class="min-w-0">
                <p class="text-lg font-semibold {grade.text}">
                  {grade.letter} · {grade.label}
                </p>
                <p class="mt-0.5 text-sm text-fg-muted">
                  {cr.totals.critical > 0
                    ? `${cr.totals.critical} ${cr.totals.critical === 1 ? 'vulnerabilidad crítica abierta' : 'vulnerabilidades críticas abiertas'}`
                    : cr.exposedSecrets > 0
                      ? `${cr.exposedSecrets} ${cr.exposedSecrets === 1 ? 'secreto expuesto' : 'secretos expuestos'} en el código`
                      : 'Sin vulnerabilidades críticas ni secretos expuestos'}
                </p>
                <p class="mt-1 text-xs text-fg-subtle">
                  Media de {scanned}
                  {scanned === 1 ? 'servicio analizado' : 'servicios analizados'} según su nivel de riesgo.
                </p>
              </div>
            </div>

            <!-- servicios por nivel de riesgo -->
            <div class="relative mt-5">
              <div class="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                {#each LEVELS as level (level.key)}
                  {#if cr.levels[level.key] > 0}
                    <div class="{level.fill} h-full" style="flex:{cr.levels[level.key]}"></div>
                  {/if}
                {/each}
              </div>
              <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-subtle">
                {#each LEVELS as level (level.key)}
                  <li class="flex items-center gap-1.5">
                    <span class="h-2 w-2 rounded-full {level.fill}"></span>{level.label}
                    <span class="tabular-nums text-fg">{cr.levels[level.key]}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {:else}
            <div
              class="relative mt-4 flex items-center gap-3 rounded-xl border border-dashed border-white/12 px-4 py-5"
            >
              <FileSearch class="h-5 w-5 shrink-0 text-fg-subtle" />
              <p class="flex-1 text-sm text-fg-muted">
                Aún no hay análisis: la puntuación aparecerá con el primero.
              </p>
              <a href={`${base}/code-report/services`} class="k-btn k-btn-secondary k-btn-sm"
                >Servicios</a
              >
            </div>
          {/if}
        </article>
      {/if}

      {#if showMonitoring && d.monitoring}
        {@const mon = d.monitoring}
        <article class="k-card relative overflow-hidden p-5" aria-labelledby="uptime-title">
          {#if monitoringState}
            <div
              class="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl {monitoringState.tone ===
              'danger'
                ? 'bg-danger/20'
                : monitoringState.tone === 'warn'
                  ? 'bg-warn/15'
                  : monitoringState.tone === 'ok'
                    ? 'bg-ok/12'
                    : 'bg-white/4'}"
            ></div>
          {/if}
          <div class="relative flex items-center justify-between">
            <h2 id="uptime-title" class="flex items-center gap-2 text-sm font-semibold text-white">
              <Activity class="h-4 w-4 text-brand-400" />Disponibilidad
            </h2>
            <a href={`${base}/monitoring/dashboard`} class="text-xs text-fg-subtle hover:text-white"
              >Monitoring</a
            >
          </div>

          {#if monitoringState}
            <div class="relative mt-4 flex items-center gap-4">
              <span
                class="grid h-12 w-12 shrink-0 place-items-center rounded-full {monitoringState.tone ===
                'danger'
                  ? 'bg-danger/15 text-red-400'
                  : monitoringState.tone === 'warn'
                    ? 'bg-warn/15 text-warn'
                    : monitoringState.tone === 'ok'
                      ? 'bg-ok/12 text-ok'
                      : 'bg-white/6 text-fg-subtle'}"
              >
                {#if monitoringState.tone === 'ok'}<CircleCheck
                    class="h-6 w-6"
                  />{:else if monitoringState.tone === 'neutral'}<Clock
                    class="h-6 w-6"
                  />{:else}<TriangleAlert class="h-6 w-6" />{/if}
              </span>
              <div>
                <p class="text-lg font-semibold text-white">{monitoringState.title}</p>
                <p class="text-sm text-fg-muted">
                  {mon.up} de {mon.total} operativos{#if mon.paused > 0}
                    · {mon.paused} en pausa{/if}
                </p>
              </div>
            </div>

            <dl class="relative mt-5 grid grid-cols-3 gap-3">
              <div class="rounded-xl border border-white/8 bg-ink-900/60 p-3">
                <dt class="text-xs text-fg-subtle">Uptime 24 h</dt>
                <dd class="mt-1 text-lg font-semibold tabular-nums {uptimeTone(mon.uptime24h)}">
                  {formatUptime(mon.uptime24h)}
                </dd>
              </div>
              <div class="rounded-xl border border-white/8 bg-ink-900/60 p-3">
                <dt class="text-xs text-fg-subtle">Uptime 30 días</dt>
                <dd class="mt-1 text-lg font-semibold tabular-nums {uptimeTone(mon.uptime30d)}">
                  {formatUptime(mon.uptime30d)}
                </dd>
              </div>
              <div class="rounded-xl border border-white/8 bg-ink-900/60 p-3">
                <dt class="text-xs text-fg-subtle">Latencia p95</dt>
                <dd class="mt-1 text-lg font-semibold tabular-nums text-white">
                  {formatMs(mon.latencyP95)}
                </dd>
              </div>
            </dl>
          {:else}
            <div
              class="relative mt-4 flex items-center gap-3 rounded-xl border border-dashed border-white/12 px-4 py-5"
            >
              <Activity class="h-5 w-5 shrink-0 text-fg-subtle" />
              <p class="flex-1 text-sm text-fg-muted">
                Aún no vigilas ninguna URL de este proyecto.
              </p>
              {#if d.can.createMonitor}
                <a href={`${base}/monitoring/monitors/new`} class="k-btn k-btn-secondary k-btn-sm"
                  ><Plus class="h-3.5 w-3.5" />Nuevo monitor</a
                >
              {/if}
            </div>
          {/if}
        </article>
      {/if}
    </section>
  {/if}

  <!-- KPIs -->
  {#if showCodeReport || showVault || showMonitoring || d.alerts}
    <section class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Indicadores">
      {#if showCodeReport && d.codeReport}
        {@const cr = d.codeReport}
        {@render kpi(
          `${base}/code-report/dashboard`,
          ShieldAlert,
          'Críticas',
          cr.totals.critical,
          cr.criticalDelta === null || cr.criticalDelta === 0
            ? 'Sin cambios en 7 días'
            : `${cr.criticalDelta > 0 ? '+' : ''}${cr.criticalDelta} en 7 días`,
          cr.totals.critical > 0 ? 'text-red-300' : 'text-white',
        )}
        {@render kpi(
          `${base}/code-report/dashboard`,
          TriangleAlert,
          'Altas',
          cr.totals.high,
          `${cr.totals.medium} medias · ${cr.totals.low} bajas`,
          cr.totals.high > 0 ? 'text-brand-300' : 'text-white',
        )}
        {@render kpi(
          `${base}/code-report/services`,
          KeyRound,
          'Secretos expuestos',
          cr.exposedSecrets,
          'Detectados en el código',
          cr.exposedSecrets > 0 ? 'text-red-300' : 'text-white',
        )}
        {@render kpi(
          `${base}/code-report/services`,
          Boxes,
          'Servicios analizados',
          `${cr.services.scanned}/${cr.services.total}`,
          cr.services.stale > 0 ? `${cr.services.stale} sin analizar en 30 días` : 'Todos al día',
          cr.services.stale > 0 ? 'text-amber-300' : 'text-white',
        )}
      {/if}
      {#if showVault && d.vault}
        {@render kpi(
          `${base}/vault`,
          LockKeyhole,
          'Secretos en Vault',
          d.vault.secrets,
          vaultMissing > 0
            ? `${vaultMissing} valores sin rellenar`
            : `${d.vault.environments.length} entornos completos`,
          vaultMissing > 0 ? 'text-amber-300' : 'text-white',
        )}
      {/if}
      {#if d.alerts}
        {@render kpi(
          `${base}/settings/alerts`,
          Bell,
          'Alertas activas',
          `${d.alerts.enabled}/${d.alerts.total}`,
          d.alerts.total === 0 ? 'Ninguna configurada' : 'Avisan por email y más canales',
        )}
      {/if}
    </section>
  {/if}

  <!-- Detalle -->
  <div class="grid gap-4 lg:grid-cols-3">
    <div class="min-w-0 space-y-4 lg:col-span-2">
      {#if showCodeReport && d.codeReport}
        <section class="k-card min-w-0 overflow-hidden" aria-labelledby="risk-title">
          <div class="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <h2 id="risk-title" class="font-semibold text-white">Servicios con más riesgo</h2>
            <a href={`${base}/code-report/services`} class="text-xs text-fg-subtle hover:text-white"
              >Ver todos</a
            >
          </div>
          {#if d.codeReport.riskiest.length === 0}
            <div class="flex items-center gap-3 px-5 py-8 text-sm text-fg-muted">
              <CircleCheck class="h-4 w-4 text-ok" />Ningún servicio tiene vulnerabilidades
              abiertas.
            </div>
          {:else}
            {@const top = Math.max(...d.codeReport.riskiest.map((service) => service.riskScore), 1)}
            <ul class="divide-y divide-white/6">
              {#each d.codeReport.riskiest as service (service.slug)}
                {@const level = levelMeta(service.level)}
                <li>
                  <a
                    href={`${base}/code-report/services/${service.slug}`}
                    class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-white/2.5"
                  >
                    <div class="min-w-0 flex-1">
                      <p class="flex items-center gap-2 truncate text-sm font-medium text-white">
                        {service.name}
                        {#if level}<span class="k-badge h-5 px-1.5 text-[11px] {level.badge}"
                            >{level.label}</span
                          >{/if}
                      </p>
                      <div class="mt-1.5 flex items-center gap-2">
                        <div class="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-white/6">
                          <div
                            class="h-full rounded-full {level?.fill ?? 'bg-white/30'}"
                            style="width:{Math.max(4, (service.riskScore / top) * 100)}%"
                          ></div>
                        </div>
                        <span class="text-xs tabular-nums text-fg-subtle">{service.riskScore}</span>
                        {#if service.exposedSecrets > 0}
                          <span class="text-xs text-red-300"
                            >· {service.exposedSecrets}
                            {service.exposedSecrets === 1 ? 'secreto' : 'secretos'}</span
                          >
                        {/if}
                      </div>
                    </div>
                    {#if service.severity}
                      <div class="flex gap-1">
                        {#each severityChips as chip (chip.key)}
                          <span
                            class="k-badge {chip.className} font-semibold tabular-nums {service
                              .severity[chip.key] === 0
                              ? 'opacity-40'
                              : ''}"
                            title={chip.key}>{chip.letter} {service.severity[chip.key]}</span
                          >
                        {/each}
                      </div>
                    {/if}
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/if}

      {#if showMonitoring && d.monitoring && d.monitoring.monitors.length > 0}
        <section class="k-card min-w-0 overflow-hidden" aria-labelledby="monitors-title">
          <div class="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <h2 id="monitors-title" class="font-semibold text-white">Monitores</h2>
            <a href={`${base}/monitoring/monitors`} class="text-xs text-fg-subtle hover:text-white"
              >Ver todos</a
            >
          </div>
          <ul class="divide-y divide-white/6">
            {#each d.monitoring.monitors as monitor (monitor.id)}
              {@const style = statusStyle(monitor.status)}
              <li
                class="grid items-center gap-x-4 gap-y-2 px-5 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]"
              >
                <a
                  href={`${base}/monitoring/monitors/${monitor.id}`}
                  class="flex min-w-0 items-center gap-2.5"
                >
                  <span class="h-2 w-2 shrink-0 rounded-full {style.dot}"></span>
                  <span class="truncate text-sm font-medium text-white hover:text-brand-300"
                    >{monitor.name}</span
                  >
                </a>
                <div class="min-w-0">
                  {#if monitor.hourlyBars.length > 0}
                    <UptimeBars bars={monitor.hourlyBars} unit="hour" height="h-4" />
                  {/if}
                </div>
                <div class="flex items-center gap-2 sm:justify-end">
                  <span class="text-xs tabular-nums {uptimeTone(monitor.uptime24h)}"
                    >{formatUptime(monitor.uptime24h)}</span
                  >
                  <span class="k-badge {style.badge}"
                    >{$_(`monitoring.status.${monitor.status}`)}</span
                  >
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if showVault && d.vault && d.vault.secrets > 0}
        <section class="k-card min-w-0 p-5" aria-labelledby="vault-title">
          <div class="flex items-center justify-between">
            <h2 id="vault-title" class="font-semibold text-white">Secretos por entorno</h2>
            <a href={`${base}/vault`} class="text-xs text-fg-subtle hover:text-white">Abrir Vault</a
            >
          </div>
          <ul class="mt-4 grid gap-4 sm:grid-cols-2">
            {#each d.vault.environments as environment (environment.slug)}
              {@const value = percent(environment.filled, d.vault.secrets)}
              <li>
                <a href={`${base}/vault/${environment.slug}`} class="group block">
                  <div class="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span class="text-fg group-hover:text-white">{environment.name}</span>
                    <span class="tabular-nums text-fg-muted">
                      {environment.filled}/{d.vault.secrets}
                    </span>
                  </div>
                  <div class="h-1.5 overflow-hidden rounded-full bg-white/6">
                    <div
                      class="h-full rounded-full {value === 100 ? 'bg-ok' : 'bg-warn'}"
                      style="width:{value}%"
                    ></div>
                  </div>
                </a>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>

    <aside class="min-w-0 space-y-4" aria-label="Actividad y accesos">
      {#if issues.length > 0}
        <section class="k-card overflow-hidden" aria-labelledby="attention-title">
          <h2
            id="attention-title"
            class="flex items-center gap-2 border-b border-white/8 px-5 py-4 text-sm font-semibold text-white"
          >
            <TriangleAlert
              class="h-4 w-4 {issues.some((issue) => issue.tone === 'danger')
                ? 'text-red-400'
                : 'text-amber-400'}"
            />Requiere atención
          </h2>
          <ul class="divide-y divide-white/6">
            {#each issues as issue (issue.text)}
              <li>
                <a
                  href={issue.href}
                  class="group flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-white/2.5"
                >
                  <span
                    class="grid h-7 w-7 shrink-0 place-items-center rounded-lg {issue.tone ===
                    'danger'
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-amber-500/10 text-amber-400'}"><issue.icon class="h-3.5 w-3.5" /></span
                  >
                  <span class="min-w-0 flex-1 text-fg">{issue.text}</span>
                  <ArrowRight
                    class="h-3.5 w-3.5 shrink-0 text-fg-subtle transition group-hover:translate-x-0.5 group-hover:text-brand-400"
                  />
                </a>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if showCodeReport && d.codeReport}
        <section class="k-card min-w-0 overflow-hidden" aria-labelledby="activity-title">
          <div class="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <h2 id="activity-title" class="font-semibold text-white">Últimos análisis</h2>
            <a href={`${base}/code-report/history`} class="text-xs text-fg-subtle hover:text-white"
              >Historial</a
            >
          </div>
          {#if d.codeReport.recent.length === 0}
            <p class="px-5 py-8 text-sm text-fg-muted">
              Los análisis aparecerán aquí cuando tu pipeline envíe el primero.
            </p>
          {:else}
            <ul class="divide-y divide-white/6">
              {#each d.codeReport.recent as analysis (analysis.id)}
                <li>
                  <a
                    href={`${base}/code-report/history/${analysis.id}`}
                    class="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/2.5"
                  >
                    <CodeReportToolBadge tool={analysis.tool} size="sm" />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm text-white">
                        {analysis.serviceName ?? $_('codeReport.history.serviceDeleted')}
                      </span>
                      <span class="block text-xs text-fg-subtle"
                        >{relative(analysis.createdAt)}</span
                      >
                    </span>
                    {#if analysis.status === 'failed'}
                      <span class="k-badge k-badge-danger">{$_('codeReport.history.failed')}</span>
                    {:else if analysis.status === 'in_progress'}
                      <span class="k-badge k-badge-info">{$_('codeReport.history.inProgress')}</span
                      >
                    {:else if analysis.critical !== null && analysis.critical > 0}
                      <span class="k-badge k-badge-danger font-semibold tabular-nums"
                        >C {analysis.critical}</span
                      >
                    {/if}
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/if}

      <section class="k-card min-w-0 p-5" aria-labelledby="quick-title">
        <h2 id="quick-title" class="font-semibold text-white">
          {$_('project.overview.quickAccess')}
        </h2>
        {#if quickActions.length === 0}
          <p class="mt-3 text-sm text-fg-subtle">
            No tienes acciones disponibles en este proyecto.
          </p>
        {:else}
          <ul class="mt-3 grid gap-1">
            {#each quickActions as action (action.label)}
              <li>
                <a
                  href={action.href}
                  class="group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-fg transition-colors hover:bg-white/4"
                >
                  <span
                    class="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/3 text-fg-muted group-hover:border-brand-500/40 group-hover:text-brand-400"
                    ><action.icon class="h-4 w-4" /></span
                  >
                  <span class="min-w-0 flex-1 truncate">{action.label}</span>
                  <Plus class="h-3.5 w-3.5 text-fg-subtle group-hover:text-brand-400" />
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </aside>
  </div>

  <!-- Productos sin activar -->
  {#if inactiveModules.length > 0 && d.can.updateProject}
    <section
      class="flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-white/16 px-5 py-4"
      aria-label="Productos sin activar"
    >
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-white">Productos sin activar</p>
        <p class="text-xs text-fg-subtle">Actívalos desde los ajustes del proyecto.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        {#each inactiveModules as module (module.key)}
          <span class="k-badge"><module.icon class="h-3 w-3" />{module.label}</span>
        {/each}
      </div>
      <a href={`${base}/settings/overview`} class="k-btn k-btn-secondary k-btn-sm"
        >Activar<ArrowRight class="h-3.5 w-3.5" /></a
      >
    </section>
  {/if}
</div>
