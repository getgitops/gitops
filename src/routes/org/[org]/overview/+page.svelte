<script lang="ts">
  import {
    Activity,
    ArrowRight,
    ArrowUpRight,
    BarChart3,
    BellRing,
    CircleAlert,
    CircleCheck,
    CircleDashed,
    FolderKanban,
    Info,
    KeyRound,
    Search,
    Shield,
    ShieldAlert,
    TriangleAlert,
    UserPlus,
    Users,
  } from '@lucide/svelte';
  import { Tabs } from '#lib/components/ui';
  import { formatUptime, uptimeTone } from '#lib/monitoring/format';
  import { _, locale } from '#lib/i18n';

  type Severity = 'critical' | 'warning' | 'info';
  type HealthStatus = 'critical' | 'warning' | 'ok' | 'unknown';

  type AttentionItem = {
    severity: Severity;
    kind: string;
    count: number;
    project: { slug: string; name: string } | null;
    href: string;
    names?: string[];
  };

  type ProjectHealth = {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    modules: { codereport: boolean; vault: boolean; monitoring: boolean };
    status: HealthStatus;
    issues: { critical: number; warning: number };
    codeReport: {
      score: number | null;
      critical: number;
      high: number;
      services: number;
      scanned: number;
      exposedSecrets: number;
      lastScanAt: string | null;
    } | null;
    monitoring: {
      total: number;
      up: number;
      down: number;
      degraded: number;
      uptime24h: number | null;
    } | null;
    vault: { secrets: number; missingValues: number } | null;
    keys: { active: number; atRisk: number } | null;
  };

  type Dashboard = {
    generatedAt: string;
    thresholds: {
      staleScanDays: number;
      keyRotationDays: number;
      keyExpiringDays: number;
      keyUnusedDays: number;
      secretRotationDays: number;
    };
    projects: ProjectHealth[];
    archivedProjects: number;
    attention: AttentionItem[];
    users: { total: number; active: number; invited: number; disabled: number } | null;
    alerts: { total: number; enabled: number } | null;
    pendingEvents: number | null;
    totals: {
      securityScore: number | null;
      critical: number;
      high: number;
      exposedSecrets: number;
      services: number;
      monitors: number;
      monitorsUp: number;
      monitorsFailing: number;
      uptime24h: number | null;
      secrets: number;
      keys: number;
      keysAtRisk: number;
    };
    can: { createProject: boolean; manageUsers: boolean };
  };

  let {
    data,
  }: { data: { dashboard: Dashboard; organization: { slug: string; name?: string | null } } } =
    $props();

  const dashboard = $derived(data.dashboard);
  const totals = $derived(dashboard.totals);
  const orgBase = $derived(`/org/${data.organization.slug}`);

  // ---- lo que hay que revisar
  const ATTENTION_PREVIEW = 6;
  let showAllAttention = $state(false);
  const attentionCounts = $derived({
    critical: dashboard.attention.filter((item) => item.severity === 'critical').length,
    warning: dashboard.attention.filter((item) => item.severity === 'warning').length,
    info: dashboard.attention.filter((item) => item.severity === 'info').length,
  });
  const visibleAttention = $derived(
    showAllAttention ? dashboard.attention : dashboard.attention.slice(0, ATTENTION_PREVIEW),
  );

  const severityStyle: Record<Severity, { icon: typeof Info; tile: string; badge: string }> = {
    critical: { icon: CircleAlert, tile: 'bg-red-500/10 text-red-400', badge: 'k-badge-danger' },
    warning: { icon: TriangleAlert, tile: 'bg-warn/10 text-warn', badge: 'k-badge-warn' },
    info: { icon: Info, tile: 'bg-info/10 text-info', badge: 'k-badge-info' },
  };

  function attentionDays(kind: string) {
    const t = dashboard.thresholds;
    const days: Record<string, number> = {
      keysExpiring: t.keyExpiringDays,
      keysNotRotated: t.keyRotationDays,
      keysUnused: t.keyUnusedDays,
      staleScans: t.staleScanDays,
      vaultStale: t.secretRotationDays,
    };
    return days[kind] ?? 0;
  }

  // ---- riesgo de claves (suma de todos los proyectos)
  const keyRiskKinds = [
    'keysExpired',
    'keysExpiring',
    'keysNotRotated',
    'keysNoExpiry',
    'keysUnused',
  ] as const;
  const keyRisks = $derived(
    keyRiskKinds.map((kind) => ({
      kind,
      count: dashboard.attention
        .filter((item) => item.kind === kind)
        .reduce((sum, item) => sum + item.count, 0),
    })),
  );
  const keyRiskMax = $derived(Math.max(1, ...keyRisks.map((risk) => risk.count)));
  const keyRiskTone: Record<(typeof keyRiskKinds)[number], string> = {
    keysExpired: 'bg-danger',
    keysExpiring: 'bg-warn',
    keysNotRotated: 'bg-warn',
    keysNoExpiry: 'bg-info',
    keysUnused: 'bg-info',
  };

  // ---- proyectos
  const statusCounts = $derived({
    critical: dashboard.projects.filter((project) => project.status === 'critical').length,
    warning: dashboard.projects.filter((project) => project.status === 'warning').length,
    ok: dashboard.projects.filter((project) => project.status === 'ok').length,
    unknown: dashboard.projects.filter((project) => project.status === 'unknown').length,
  });

  let projectQuery = $state('');
  let projectFilter = $state<'all' | 'critical' | 'warning' | 'ok'>('all');
  const statusRank: Record<HealthStatus, number> = { critical: 0, warning: 1, ok: 2, unknown: 3 };
  const filteredProjects = $derived.by(() => {
    const query = projectQuery.trim().toLowerCase();
    return dashboard.projects
      .filter(
        (project) =>
          (projectFilter === 'all' || project.status === projectFilter) &&
          (!query ||
            project.name.toLowerCase().includes(query) ||
            project.slug.toLowerCase().includes(query)),
      )
      .sort(
        (left, right) =>
          statusRank[left.status] - statusRank[right.status] ||
          right.issues.critical - left.issues.critical ||
          left.name.localeCompare(right.name),
      );
  });

  const projectStatusStyle: Record<HealthStatus, { dot: string; badge: string; label: string }> =
    $derived({
      critical: {
        dot: 'bg-danger',
        badge: 'k-badge-danger',
        label: $_('org.dashboard.status.critical'),
      },
      warning: { dot: 'bg-warn', badge: 'k-badge-warn', label: $_('org.dashboard.status.warning') },
      ok: { dot: 'bg-ok', badge: 'k-badge-ok', label: $_('org.dashboard.status.ok') },
      unknown: { dot: 'bg-white/30', badge: '', label: $_('org.dashboard.status.unknown') },
    });

  function scoreTone(score: number | null | undefined) {
    if (score === null || score === undefined) return 'text-fg-subtle';
    if (score >= 80) return 'text-ok';
    if (score >= 50) return 'text-warn';
    return 'text-red-400';
  }

  function formatTime(value: string) {
    return new Date(value).toLocaleTimeString($locale, { hour: '2-digit', minute: '2-digit' });
  }

  function formatNumber(value: number) {
    return value.toLocaleString($locale);
  }
</script>

<svelte:head>
  <title>{$_('org.dashboard.title')} - GitOps</title>
</svelte:head>

<div class="mx-auto w-full max-w-7xl space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-white">
        {data.organization.name ?? $_('org.dashboard.title')}
      </h1>
      <p class="mt-1 text-sm text-fg-muted">{$_('org.dashboard.subtitle')}</p>
    </div>
    <p class="flex items-center gap-1.5 text-xs text-fg-subtle">
      <span class="h-1.5 w-1.5 rounded-full bg-ok"></span>
      {$_('org.dashboard.updatedAt', { values: { time: formatTime(dashboard.generatedAt) } })}
    </p>
  </header>

  <!-- KPIs -->
  <section
    class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
    aria-label={$_('org.dashboard.kpisLabel')}
  >
    <!-- Proyectos -->
    <a href="#projects" class="k-card k-card-hover flex flex-col p-5">
      <p class="flex items-center gap-2 text-xs font-medium text-fg-subtle">
        <FolderKanban class="h-3.5 w-3.5" />{$_('org.dashboard.kpi.projects')}
      </p>
      <p class="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-white">
        {dashboard.projects.length}
      </p>
      <div class="mt-auto pt-3">
        {#if dashboard.projects.length > 0}
          <div class="flex h-1.5 overflow-hidden rounded-full bg-white/6" aria-hidden="true">
            <span class="bg-danger" style:flex-grow={statusCounts.critical}></span>
            <span class="bg-warn" style:flex-grow={statusCounts.warning}></span>
            <span class="bg-ok" style:flex-grow={statusCounts.ok}></span>
            <span class="bg-white/15" style:flex-grow={statusCounts.unknown}></span>
          </div>
        {/if}
        <p class="mt-2 text-xs text-fg-subtle">
          {$_('org.dashboard.kpi.projectsDetail', {
            values: {
              critical: statusCounts.critical,
              warning: statusCounts.warning,
              ok: statusCounts.ok,
            },
          })}
        </p>
      </div>
    </a>

    <!-- Seguridad -->
    <div class="k-card flex flex-col p-5">
      <p class="flex items-center gap-2 text-xs font-medium text-fg-subtle">
        <ShieldAlert class="h-3.5 w-3.5" />{$_('org.dashboard.kpi.security')}
      </p>
      <p class="mt-3 flex items-baseline gap-1">
        <span
          class="text-3xl font-semibold tabular-nums tracking-tight {scoreTone(
            totals.securityScore,
          )}">{totals.securityScore ?? '—'}</span
        >
        {#if totals.securityScore !== null}<span class="text-sm text-fg-subtle">/100</span>{/if}
      </p>
      <p class="mt-auto pt-3 text-xs text-fg-subtle">
        <span class={totals.critical > 0 ? 'font-medium text-red-400' : ''}
          >{$_('org.dashboard.kpi.criticalCount', { values: { count: totals.critical } })}</span
        >
        · {$_('org.dashboard.kpi.highCount', { values: { count: totals.high } })}
      </p>
    </div>

    <!-- Disponibilidad -->
    <div class="k-card flex flex-col p-5">
      <p class="flex items-center gap-2 text-xs font-medium text-fg-subtle">
        <Activity class="h-3.5 w-3.5" />{$_('org.dashboard.kpi.uptime')}
      </p>
      <p
        class="mt-3 text-3xl font-semibold tabular-nums tracking-tight {uptimeTone(
          totals.uptime24h,
        )}"
      >
        {formatUptime(totals.uptime24h)}
      </p>
      <p class="mt-auto pt-3 text-xs text-fg-subtle">
        {#if totals.monitors === 0}
          {$_('org.dashboard.kpi.noMonitors')}
        {:else}
          <span class={totals.monitorsFailing > 0 ? 'font-medium text-red-400' : ''}
            >{$_('org.dashboard.kpi.monitorsFailing', {
              values: { count: totals.monitorsFailing },
            })}</span
          >
          · {$_('org.dashboard.kpi.monitorsTotal', { values: { count: totals.monitors } })}
        {/if}
      </p>
    </div>

    <!-- Usuarios -->
    <svelte:element
      this={dashboard.can.manageUsers ? 'a' : 'div'}
      href={dashboard.can.manageUsers ? `${orgBase}/settings/access-control` : undefined}
      class="k-card flex flex-col p-5 {dashboard.can.manageUsers ? 'k-card-hover' : ''}"
    >
      <p class="flex items-center gap-2 text-xs font-medium text-fg-subtle">
        <Users class="h-3.5 w-3.5" />{$_('org.dashboard.kpi.users')}
      </p>
      {#if dashboard.users}
        <p class="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-white">
          {dashboard.users.total}
        </p>
        <p class="mt-auto pt-3 text-xs text-fg-subtle">
          {$_('org.dashboard.kpi.usersDetail', {
            values: { active: dashboard.users.active, invited: dashboard.users.invited },
          })}
          {#if dashboard.users.disabled > 0}
            · {$_('org.dashboard.kpi.usersDisabled', {
              values: { count: dashboard.users.disabled },
            })}
          {/if}
        </p>
      {:else}
        <p class="mt-3 text-3xl font-semibold tracking-tight text-fg-subtle">—</p>
        <p class="mt-auto pt-3 text-xs text-fg-subtle">{$_('org.dashboard.noAccess')}</p>
      {/if}
    </svelte:element>

    <!-- Claves -->
    <div class="k-card flex flex-col p-5">
      <p class="flex items-center gap-2 text-xs font-medium text-fg-subtle">
        <KeyRound class="h-3.5 w-3.5" />{$_('org.dashboard.kpi.keys')}
      </p>
      <p class="mt-3 flex items-baseline gap-2">
        <span
          class="text-3xl font-semibold tabular-nums tracking-tight {totals.keysAtRisk > 0
            ? 'text-warn'
            : 'text-white'}">{totals.keysAtRisk}</span
        >
        <span class="text-sm text-fg-subtle"
          >{$_('org.dashboard.kpi.keysAtRiskOf', { values: { count: totals.keys } })}</span
        >
      </p>
      <p class="mt-auto pt-3 text-xs text-fg-subtle">
        {$_('org.dashboard.kpi.secrets', { values: { count: formatNumber(totals.secrets) } })}
      </p>
    </div>
  </section>

  <div class="grid gap-6 lg:grid-cols-3">
    <!-- Qué revisar -->
    <section class="k-card overflow-hidden lg:col-span-2" aria-labelledby="attention-title">
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4"
      >
        <div>
          <h2 id="attention-title" class="text-sm font-semibold text-white">
            {$_('org.dashboard.attention.title')}
          </h2>
          <p class="mt-0.5 text-xs text-fg-subtle">{$_('org.dashboard.attention.description')}</p>
        </div>
        {#if dashboard.attention.length > 0}
          <div class="flex flex-wrap gap-1.5">
            {#each ['critical', 'warning', 'info'] as const as severity (severity)}
              {#if attentionCounts[severity] > 0}
                {@const style = severityStyle[severity]}
                <span class="k-badge h-6 gap-1 px-2 text-[11px] {style.badge}">
                  <style.icon class="h-3 w-3" />{attentionCounts[severity]}
                  {$_(`org.dashboard.severity.${severity}`)}
                </span>
              {/if}
            {/each}
          </div>
        {/if}
      </div>

      {#if dashboard.attention.length === 0}
        <div class="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span class="grid h-12 w-12 place-items-center rounded-xl bg-ok/10 text-ok">
            <CircleCheck class="h-6 w-6" />
          </span>
          <p class="text-sm font-medium text-white">{$_('org.dashboard.attention.emptyTitle')}</p>
          <p class="max-w-sm text-sm text-fg-muted">
            {$_('org.dashboard.attention.emptyDescription')}
          </p>
        </div>
      {:else}
        <ul class="divide-y divide-white/5">
          {#each visibleAttention as item, index (`${item.kind}-${item.project?.slug ?? 'org'}-${index}`)}
            {@const style = severityStyle[item.severity]}
            <li class="group relative flex items-center gap-4 px-5 py-3.5 hover:bg-white/2.5">
              <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg {style.tile}">
                <style.icon class="h-4 w-4" />
              </span>
              <div class="min-w-0 flex-1">
                <a
                  href={item.href}
                  class="block truncate text-sm font-medium text-white outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                >
                  {$_(`org.dashboard.attention.kinds.${item.kind}.title`)}
                </a>
                <p class="mt-0.5 truncate text-xs text-fg-subtle">
                  {#if item.project}
                    <span class="text-fg-muted">{item.project.name}</span> ·
                  {/if}
                  {#if item.names?.length}
                    <span class="font-mono">{item.names.slice(0, 3).join(', ')}</span
                    >{#if item.names.length > 3}&nbsp;+{item.names.length - 3}{/if}
                  {:else}
                    {$_(`org.dashboard.attention.kinds.${item.kind}.description`, {
                      values: { days: attentionDays(item.kind) },
                    })}
                  {/if}
                </p>
              </div>
              <span
                class="shrink-0 text-lg font-semibold tabular-nums {item.severity === 'critical'
                  ? 'text-red-400'
                  : item.severity === 'warning'
                    ? 'text-warn'
                    : 'text-fg-muted'}">{formatNumber(item.count)}</span
              >
              <ArrowRight
                class="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-white"
              />
            </li>
          {/each}
        </ul>
        {#if dashboard.attention.length > ATTENTION_PREVIEW}
          <div class="border-t border-white/8 px-5 py-2.5">
            <button
              type="button"
              class="k-btn k-btn-ghost k-btn-sm w-full"
              aria-expanded={showAllAttention}
              onclick={() => (showAllAttention = !showAllAttention)}
            >
              {showAllAttention
                ? $_('org.dashboard.attention.showLess')
                : $_('org.dashboard.attention.showAll', {
                    values: { count: dashboard.attention.length },
                  })}
            </button>
          </div>
        {/if}
      {/if}
    </section>

    <div class="space-y-6">
      <!-- Riesgo de claves -->
      <section class="k-card p-5" aria-labelledby="key-risk-title">
        <h2 id="key-risk-title" class="flex items-center gap-2 text-sm font-semibold text-white">
          <KeyRound class="h-4 w-4 text-fg-subtle" />{$_('org.dashboard.keys.title')}
        </h2>
        <p class="mt-0.5 text-xs text-fg-subtle">
          {$_('org.dashboard.keys.description', {
            values: { days: dashboard.thresholds.keyRotationDays },
          })}
        </p>
        {#if totals.keys === 0}
          <p class="mt-4 text-sm text-fg-subtle">{$_('org.dashboard.keys.empty')}</p>
        {:else}
          <ul class="mt-4 space-y-3">
            {#each keyRisks as risk (risk.kind)}
              <li>
                <div class="flex items-center justify-between text-xs">
                  <span class={risk.count > 0 ? 'text-fg' : 'text-fg-subtle'}
                    >{$_(`org.dashboard.attention.kinds.${risk.kind}.title`)}</span
                  >
                  <span
                    class="font-medium tabular-nums {risk.count > 0
                      ? 'text-white'
                      : 'text-fg-subtle'}">{risk.count}</span
                  >
                </div>
                <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/6">
                  <div
                    class="h-full rounded-full {keyRiskTone[risk.kind]}"
                    style:width="{(risk.count / keyRiskMax) * 100}%"
                  ></div>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <!-- Actividad -->
      <section class="k-card divide-y divide-white/5" aria-label={$_('org.dashboard.activity')}>
        {#if dashboard.pendingEvents !== null}
          <a
            href={`${orgBase}/settings/events?status=pending`}
            class="group flex items-center gap-3 px-5 py-4 hover:bg-white/2.5"
          >
            <span class="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-fg">
              <Activity class="h-4 w-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-white"
                >{$_('org.dashboard.pendingEvents')}</span
              >
              <span class="block text-xs text-fg-subtle"
                >{$_('org.dashboard.pendingEventsDescription')}</span
              >
            </span>
            <span class="text-lg font-semibold tabular-nums text-white"
              >{dashboard.pendingEvents}</span
            >
          </a>
        {/if}
        {#if dashboard.alerts}
          <a
            href={`${orgBase}/settings/alerts`}
            class="group flex items-center gap-3 px-5 py-4 hover:bg-white/2.5"
          >
            <span class="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-fg">
              <BellRing class="h-4 w-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-white">{$_('org.dashboard.alerts')}</span>
              <span class="block text-xs text-fg-subtle"
                >{$_('org.dashboard.alertsDescription', {
                  values: { total: dashboard.alerts.total },
                })}</span
              >
            </span>
            <span class="text-lg font-semibold tabular-nums text-white"
              >{dashboard.alerts.enabled}</span
            >
          </a>
        {/if}
        {#if dashboard.users && dashboard.users.invited > 0}
          <a
            href={`${orgBase}/settings/access-control`}
            class="group flex items-center gap-3 px-5 py-4 hover:bg-white/2.5"
          >
            <span class="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-fg">
              <UserPlus class="h-4 w-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-white"
                >{$_('org.dashboard.attention.kinds.invitedUsers.title')}</span
              >
              <span class="block text-xs text-fg-subtle"
                >{$_('org.dashboard.attention.kinds.invitedUsers.description')}</span
              >
            </span>
            <span class="text-lg font-semibold tabular-nums text-white"
              >{dashboard.users.invited}</span
            >
          </a>
        {/if}
        <a
          href={`${orgBase}/cves`}
          class="group flex items-center gap-3 px-5 py-4 hover:bg-white/2.5"
        >
          <span class="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-fg">
            <Shield class="h-4 w-4" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium text-white">{$_('org.dashboard.cves')}</span>
            <span class="block text-xs text-fg-subtle">{$_('org.dashboard.cvesDescription')}</span>
          </span>
          <ArrowUpRight class="h-4 w-4 text-fg-subtle group-hover:text-white" />
        </a>
      </section>
    </div>
  </div>

  <!-- Proyectos -->
  <section id="projects" class="scroll-mt-6 space-y-4" aria-labelledby="projects-title">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="projects-title" class="text-base font-semibold text-white">
          {$_('org.dashboard.projects.title')}
        </h2>
        <p class="mt-0.5 text-xs text-fg-subtle">
          {$_('org.dashboard.projects.description')}
          {#if dashboard.archivedProjects > 0}
            · {$_('org.dashboard.projects.archived', {
              values: { count: dashboard.archivedProjects },
            })}
          {/if}
        </p>
      </div>
      {#if dashboard.projects.length > 0}
        <div class="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <div class="relative flex-1 sm:w-64 sm:flex-none">
            <Search
              class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
            />
            <input
              type="search"
              bind:value={projectQuery}
              aria-label={$_('org.overview.searchProjects')}
              placeholder={$_('org.overview.searchProjects')}
              class="k-input h-9 pl-9"
            />
          </div>
          <Tabs
            variant="segmented"
            size="sm"
            label={$_('org.dashboard.projects.filterLabel')}
            value={projectFilter}
            onchange={(value) => (projectFilter = value as typeof projectFilter)}
            items={[
              {
                value: 'all',
                label: $_('org.dashboard.projects.all'),
                count: dashboard.projects.length,
              },
              {
                value: 'critical',
                label: $_('org.dashboard.status.critical'),
                count: statusCounts.critical,
              },
              {
                value: 'warning',
                label: $_('org.dashboard.status.warning'),
                count: statusCounts.warning,
              },
              { value: 'ok', label: $_('org.dashboard.status.ok'), count: statusCounts.ok },
            ]}
          />
        </div>
      {/if}
    </div>

    {#if dashboard.projects.length === 0}
      <div class="k-card flex flex-col items-center gap-3 border-dashed px-6 py-16 text-center">
        <span class="grid h-12 w-12 place-items-center rounded-xl bg-brand-500/10 text-brand-400">
          <FolderKanban class="h-6 w-6" />
        </span>
        <p class="text-sm font-medium text-white">{$_('org.overview.noActiveProjects')}</p>
        {#if dashboard.can.createProject}
          <a href={`${orgBase}/settings/projects`} class="k-btn k-btn-primary k-btn-sm mt-1"
            >{$_('orgSettings.projects.new')}</a
          >
        {/if}
      </div>
    {:else if filteredProjects.length === 0}
      <div class="k-card border-dashed px-6 py-12 text-center text-sm text-fg-muted">
        {$_('org.overview.noProjectMatches')}
      </div>
    {:else}
      <ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {#each filteredProjects as project (project.id)}
          {@const style = projectStatusStyle[project.status]}
          <li
            class="k-card k-card-hover relative flex flex-col p-5 {project.status === 'critical'
              ? 'border-danger/30'
              : ''}"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <a
                  href={`${orgBase}/projects/${project.slug}/overview`}
                  class="block truncate text-sm font-semibold text-white outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:underline"
                  >{project.name}</a
                >
                <p class="truncate font-mono text-xs text-fg-subtle">{project.slug}</p>
              </div>
              <span class="k-badge h-6 shrink-0 gap-1.5 px-2 text-[11px] {style.badge}">
                {#if project.status === 'unknown'}
                  <CircleDashed class="h-3 w-3" />
                {:else}
                  <span class="h-1.5 w-1.5 rounded-full {style.dot}"></span>
                {/if}
                {style.label}
              </span>
            </div>

            <dl class="mt-4 grid grid-cols-3 gap-2 text-center">
              <div class="rounded-lg bg-white/3 px-2 py-2">
                <dt
                  class="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-fg-subtle"
                >
                  <BarChart3 class="h-3 w-3" />{$_('org.dashboard.projects.score')}
                </dt>
                <dd
                  class="mt-1 text-base font-semibold tabular-nums {scoreTone(
                    project.codeReport?.score,
                  )}"
                >
                  {project.codeReport?.score ?? '—'}
                </dd>
              </div>
              <div class="rounded-lg bg-white/3 px-2 py-2">
                <dt
                  class="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-fg-subtle"
                >
                  <ShieldAlert class="h-3 w-3" />{$_('org.dashboard.projects.critical')}
                </dt>
                <dd
                  class="mt-1 text-base font-semibold tabular-nums {project.codeReport?.critical
                    ? 'text-red-400'
                    : project.codeReport
                      ? 'text-white'
                      : 'text-fg-subtle'}"
                >
                  {project.codeReport ? project.codeReport.critical : '—'}
                </dd>
              </div>
              <div class="rounded-lg bg-white/3 px-2 py-2">
                <dt
                  class="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-fg-subtle"
                >
                  <Activity class="h-3 w-3" />{$_('org.dashboard.projects.uptime')}
                </dt>
                <dd
                  class="mt-1 text-base font-semibold tabular-nums {uptimeTone(
                    project.monitoring?.uptime24h,
                  )}"
                >
                  {project.monitoring?.total ? formatUptime(project.monitoring.uptime24h) : '—'}
                </dd>
              </div>
            </dl>

            <div class="mt-4 flex flex-wrap gap-1.5 text-[11px]">
              {#if project.monitoring && project.monitoring.down + project.monitoring.degraded > 0}
                <span class="k-badge k-badge-danger h-6 gap-1 px-2 text-[11px]">
                  <Activity class="h-3 w-3" />{$_('org.dashboard.projects.monitorsFailing', {
                    values: { count: project.monitoring.down + project.monitoring.degraded },
                  })}
                </span>
              {/if}
              {#if project.codeReport && project.codeReport.exposedSecrets > 0}
                <span class="k-badge k-badge-danger h-6 gap-1 px-2 text-[11px]">
                  <ShieldAlert class="h-3 w-3" />{$_('org.dashboard.projects.exposedSecrets', {
                    values: { count: project.codeReport.exposedSecrets },
                  })}
                </span>
              {/if}
              {#if project.keys && project.keys.atRisk > 0}
                <span class="k-badge k-badge-warn h-6 gap-1 px-2 text-[11px]">
                  <KeyRound class="h-3 w-3" />{$_('org.dashboard.projects.keysAtRisk', {
                    values: { count: project.keys.atRisk },
                  })}
                </span>
              {/if}
              {#if project.vault && project.vault.missingValues > 0}
                <span class="k-badge k-badge-warn h-6 gap-1 px-2 text-[11px]">
                  <Shield class="h-3 w-3" />{$_('org.dashboard.projects.vaultMissing', {
                    values: { count: project.vault.missingValues },
                  })}
                </span>
              {/if}
              {#if project.status === 'ok'}
                <span class="flex items-center gap-1 text-xs text-fg-subtle">
                  <CircleCheck class="h-3.5 w-3.5 text-ok" />{$_('org.dashboard.projects.allGood')}
                </span>
              {:else if project.status === 'unknown'}
                <span class="text-xs text-fg-subtle">{$_('org.dashboard.projects.noData')}</span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
