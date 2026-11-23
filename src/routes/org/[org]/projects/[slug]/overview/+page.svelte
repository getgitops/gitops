<script lang="ts">
  import {
    Activity,
    ArrowRight,
    BarChart3,
    BookOpen,
    CircleAlert,
    CircleCheck,
    CircleDashed,
    GitBranch,
    GitCommitHorizontal,
    KeyRound,
    Lock,
    Plus,
    ScanSearch,
    Settings,
    Shield,
    TriangleAlert,
    UserPlus,
    Users,
  } from '@lucide/svelte';
  import { _, locale } from '#lib/i18n';
  import { relativeTime } from '#lib/format/relative-time';
  import { avatarColor, initials } from '#lib/projects/avatar';
  import type { EventView } from '#lib/server/events/event-view';
  import type { ServiceHealth, SeverityCounts } from '#lib/projects/overview';
  import type { OverviewScan, OverviewService } from './+page.server';

  type Props = {
    data: {
      project: {
        id: string;
        name: string;
        slug: string;
        description?: string | null;
        status?: string;
        createdAt?: string;
        organization?: { slug?: string | null; name?: string | null } | null;
      };
      modules: { vault?: boolean; codereport?: boolean; stateiac?: boolean };
      codeReport: {
        services: OverviewService[];
        totals: SeverityCounts;
        exposedSecrets: number;
        score: { value: number | null; passing: number; scanned: number };
        staleCount: number;
        recentScans: OverviewScan[];
      } | null;
      vault: {
        secrets: number | null;
        environments: { name: string; slug: string }[];
        lastModifiedAt: string | null;
      } | null;
      members: { count: number; sample: string[] } | null;
      activity: EventView[];
      canCreateService: boolean;
      canReadSettings: boolean;
      canReadCodeReport: boolean;
    };
  };

  let { data }: Props = $props();

  const project = $derived(data.project);
  const orgSlug = $derived(project.organization?.slug ?? '');
  const base = $derived(`/org/${orgSlug}/projects/${project.slug}`);
  const cr = $derived(data.codeReport);
  const ago = (value: string | null | undefined) => relativeTime(value, $locale);

  // Score ring: green from 80, amber from 50, red below
  const score = $derived(cr?.score.value ?? null);
  const scoreTone = $derived(
    score === null ? 'none' : score >= 80 ? 'good' : score >= 50 ? 'fair' : 'poor',
  );
  const RING = 2 * Math.PI * 22;

  const totalFindings = $derived(
    cr ? cr.totals.critical + cr.totals.high + cr.totals.medium + cr.totals.low : 0,
  );

  const SEVERITIES: { key: keyof SeverityCounts; short: string }[] = [
    { key: 'critical', short: 'C' },
    { key: 'high', short: 'H' },
    { key: 'medium', short: 'M' },
    { key: 'low', short: 'L' },
  ];

  const HEALTH_ICON: Record<ServiceHealth, typeof CircleCheck> = {
    critical: CircleAlert,
    warning: TriangleAlert,
    healthy: CircleCheck,
    unscanned: CircleDashed,
  };

  /** Why the Code Report blocks are empty: module off, no permission, or simply no data */
  const codeReportReason = $derived(
    !data.modules.codereport
      ? $_('project.overview.codeReportOff')
      : !data.canReadCodeReport
        ? $_('project.overview.codeReportLocked')
        : '',
  );

  function sparkline(values: number[]) {
    if (values.length < 2) return '';
    const max = Math.max(...values, 1);
    const width = 96;
    const height = 26;
    return values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * width;
        const y = height - 2 - (value / max) * (height - 4);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  function trendDirection(values: number[]): 'up' | 'down' | 'flat' {
    if (values.length < 2) return 'flat';
    const delta = values[values.length - 1] - values[0];
    return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  }

  /** First meaningful field of the event (which service, secret, user…), shown next to it */
  function activityDetail(event: EventView) {
    const field = event.fields.find((candidate) => !candidate.translate && candidate.value !== '—');
    return field?.value ?? '';
  }

  function actorName(event: EventView) {
    if (event.actor.kind === 'system') return $_('org.events.actorSystem');
    if (event.actor.kind === 'api_key') {
      return event.actor.name
        ? $_('org.events.actorApiKey', { values: { name: event.actor.name } })
        : $_('org.events.actorApiKeyUnknown');
    }
    return event.actor.name ?? '—';
  }

  const MODULE_ICON = {
    vault: Shield,
    code_report: ScanSearch,
    projects: Settings,
    organization: Settings,
    access: Users,
  } as const;

  const modules = $derived([
    {
      key: 'vault',
      label: 'Vault',
      icon: Lock,
      enabled: data.modules.vault !== false,
      href: `${base}/vault`,
      guide: 'https://getgitops.com/docs/vault',
      description: $_('project.vault.description'),
    },
    {
      key: 'codereport',
      label: 'Code Report',
      icon: BarChart3,
      enabled: data.modules.codereport !== false,
      href: `${base}/code-report/dashboard`,
      guide: 'https://getgitops.com/docs/code-report',
      description: $_('project.layout.codeReportSubtitle'),
    },
    {
      key: 'stateiac',
      label: 'State IaC',
      icon: GitBranch,
      enabled: data.modules.stateiac !== false,
      href: `${base}/state-iac`,
      guide: 'https://getgitops.com/docs/state-iac',
      description: $_('project.layout.stateIacSubtitle'),
    },
  ]);
</script>

<svelte:head>
  <title>{$_('project.layout.overview')} - {project.name}</title>
</svelte:head>

<div class="overview">
  <!-- Header -->
  <header class="hero">
    <span class="hero-avatar" style="--color: {avatarColor(project.id)}"
      >{initials(project.name)}</span
    >
    <div class="hero-text">
      <div class="hero-title">
        <h1>{project.name}</h1>
        <span class="pill" class:pill-on={project.status !== 'inactive'}>
          <span class="dot"></span>
          {project.status === 'inactive' ? $_('common.inactive') : $_('common.active')}
        </span>
      </div>
      <p class="hero-description" class:muted={!project.description}>
        {project.description || $_('project.overview.noDescription')}
      </p>
      <p class="hero-meta">
        <code>{project.slug}</code>
        {#if project.organization?.name}<span>·</span><span>{project.organization.name}</span>{/if}
        {#if project.createdAt}
          <span>·</span>
          <span
            >{$_('project.overview.createdAgo', { values: { time: ago(project.createdAt) } })}</span
          >
        {/if}
      </p>
    </div>
    <div class="hero-actions">
      {#if data.canReadSettings}
        <a href={`${base}/settings/global`} class="button-secondary">
          <Settings class="h-4 w-4" />
          {$_('project.overview.settings')}
        </a>
      {/if}
      {#if data.modules.codereport && data.canReadCodeReport}
        <a href={`${base}/code-report/dashboard`} class="button-primary">
          <BarChart3 class="h-4 w-4" />
          Code Report
        </a>
      {/if}
    </div>
  </header>

  <!-- Key metrics -->
  <section class="metrics" aria-label={$_('project.overview.metrics')}>
    <article class="metric">
      <div class="metric-text">
        <span class="metric-label">{$_('project.overview.scoreTitle')}</span>
        {#if score !== null}
          <strong class="score-{scoreTone}">{score}%</strong>
          <span class="metric-hint">
            {$_('project.overview.scoreHint', {
              values: { passing: cr?.score.passing ?? 0, scanned: cr?.score.scanned ?? 0 },
            })}
          </span>
        {:else}
          <strong class="muted-value">—</strong>
          <span class="metric-hint">{codeReportReason || $_('project.overview.scoreEmpty')}</span>
        {/if}
      </div>
      <svg class="score-ring score-ring-{scoreTone}" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="22" class="score-ring-track" />
        <circle
          cx="26"
          cy="26"
          r="22"
          class="score-ring-value"
          stroke-dasharray={RING}
          stroke-dashoffset={RING * (1 - (score ?? 0) / 100)}
        />
      </svg>
    </article>

    <article class="metric">
      <div class="metric-text">
        <span class="metric-label">{$_('project.overview.servicesTitle')}</span>
        {#if cr}
          <strong>{cr.services.length}</strong>
          <span class="metric-hint">
            {$_('project.overview.servicesHint', {
              values: { scanned: cr.score.scanned, stale: cr.staleCount },
            })}
          </span>
        {:else}
          <strong class="muted-value">—</strong>
          <span class="metric-hint">{codeReportReason}</span>
        {/if}
      </div>
      <span class="metric-icon"><ScanSearch class="h-5 w-5" /></span>
    </article>

    <article class="metric">
      <div class="metric-text">
        <span class="metric-label">{$_('project.overview.vulnerabilitiesTitle')}</span>
        {#if cr}
          <strong>{totalFindings}</strong>
          <span class="metric-hint severity-line">
            {#each SEVERITIES as severity (severity.key)}
              <span
                class="sev sev-{severity.key}"
                title={$_(`project.overview.severity.${severity.key}`)}
              >
                {severity.short}
                {cr.totals[severity.key]}
              </span>
            {/each}
          </span>
        {:else}
          <strong class="muted-value">—</strong>
          <span class="metric-hint">{codeReportReason}</span>
        {/if}
      </div>
      {#if cr && totalFindings > 0}
        <div class="stack" aria-hidden="true">
          {#each SEVERITIES as severity (severity.key)}
            <i class="sev-bg-{severity.key}" style="flex: {cr.totals[severity.key]}"></i>
          {/each}
        </div>
      {:else}
        <span class="metric-icon"><Shield class="h-5 w-5" /></span>
      {/if}
    </article>

    <article class="metric">
      <div class="metric-text">
        <span class="metric-label">{$_('project.overview.vaultTitle')}</span>
        {#if data.vault && data.vault.secrets !== null}
          <strong>{data.vault.secrets}</strong>
          <span class="metric-hint">
            {data.vault.lastModifiedAt
              ? $_('project.overview.vaultHint', {
                  values: {
                    environments: data.vault.environments.length,
                    time: ago(data.vault.lastModifiedAt),
                  },
                })
              : $_('project.overview.vaultHintNever', {
                  values: { environments: data.vault.environments.length },
                })}
          </span>
        {:else}
          <strong class="muted-value">—</strong>
          <span class="metric-hint">
            {data.modules.vault === false
              ? $_('project.overview.moduleOff')
              : $_('project.overview.noAccess')}
          </span>
        {/if}
      </div>
      <span class="metric-icon"><KeyRound class="h-5 w-5" /></span>
    </article>
  </section>

  <div class="grid">
    <div class="main">
      <!-- Services -->
      <section class="panel services-panel" aria-labelledby="services-title">
        <header class="panel-head">
          <div>
            <h2 id="services-title">{$_('project.overview.servicesPanel')}</h2>
            {#if cr && cr.exposedSecrets > 0}
              <p class="panel-alert">
                <CircleAlert class="h-3.5 w-3.5" />
                {cr.exposedSecrets === 1
                  ? $_('project.overview.exposedSecretsAlertOne')
                  : $_('project.overview.exposedSecretsAlert', {
                      values: { count: cr.exposedSecrets },
                    })}
              </p>
            {/if}
          </div>
          {#if cr}
            <div class="panel-actions">
              {#if data.canCreateService}
                <a href={`${base}/code-report/services`} class="link-button">
                  <Plus class="h-3.5 w-3.5" />
                  {$_('project.overview.newService')}
                </a>
              {/if}
              <a href={`${base}/code-report/services`} class="link">
                {$_('project.overview.viewAll')}
                <ArrowRight class="h-3.5 w-3.5" />
              </a>
            </div>
          {/if}
        </header>

        {#if !cr}
          <div class="empty">
            <Lock class="h-5 w-5" />
            <p>{codeReportReason}</p>
          </div>
        {:else if cr.services.length === 0}
          <div class="empty">
            <ScanSearch class="h-5 w-5" />
            <p class="empty-title">{$_('project.overview.servicesEmpty')}</p>
            <p>{$_('project.overview.servicesEmptyHint')}</p>
            {#if data.canCreateService}
              <a href={`${base}/code-report/services`} class="button-primary small">
                <Plus class="h-4 w-4" />
                {$_('project.overview.newService')}
              </a>
            {/if}
          </div>
        {:else}
          <ul class="service-list">
            {#each cr.services as service (service.id)}
              {@const Icon = HEALTH_ICON[service.health]}
              {@const direction = trendDirection(service.trend)}
              <li>
                <a
                  href={`${base}/code-report/services/${service.slug}`}
                  class="service-row health-{service.health}"
                >
                  <span class="health-icon" title={$_(`project.overview.health.${service.health}`)}>
                    <Icon class="h-4 w-4" />
                  </span>

                  <span class="service-main">
                    <span class="service-name">
                      <strong>{service.name}</strong>
                      <span class="health-label"
                        >{$_(`project.overview.health.${service.health}`)}</span
                      >
                    </span>
                    <span class="service-meta">
                      {#if service.lastScanAt}
                        <span class:stale={service.stale}>
                          {$_('project.overview.lastScan', {
                            values: { time: ago(service.lastScanAt) },
                          })}
                        </span>
                      {:else}
                        <span>{$_('project.overview.neverScanned')}</span>
                      {/if}
                      {#if service.branch}
                        <span class="branch"><GitBranch class="h-3 w-3" />{service.branch}</span>
                      {/if}
                      {#each service.tags.slice(0, 2) as tag (tag)}
                        <span class="tag">{tag}</span>
                      {/each}
                    </span>
                  </span>

                  <span class="service-findings">
                    {#if service.health === 'unscanned'}
                      <span class="no-data">—</span>
                    {:else if service.severity.critical + service.severity.high + service.severity.medium + service.severity.low === 0}
                      <span class="clean">{$_('project.overview.noFindings')}</span>
                    {:else}
                      {#each SEVERITIES as severity (severity.key)}
                        {#if service.severity[severity.key] > 0}
                          <span
                            class="sev sev-{severity.key}"
                            title={$_(`project.overview.severity.${severity.key}`)}
                          >
                            {severity.short}
                            {service.severity[severity.key]}
                          </span>
                        {/if}
                      {/each}
                    {/if}
                    {#if service.exposedSecrets > 0}
                      <span class="badge-danger">
                        <KeyRound class="h-3 w-3" />
                        {service.exposedSecrets === 1
                          ? $_('project.overview.secretsExposedOne')
                          : $_('project.overview.secretsExposed', {
                              values: { count: service.exposedSecrets },
                            })}
                      </span>
                    {/if}
                    {#if service.policy === 'violated'}
                      <span class="badge-danger">{$_('project.overview.policyViolated')}</span>
                    {/if}
                  </span>

                  <span class="service-trend" title={$_('project.overview.trend')}>
                    {#if service.trend.length > 1}
                      <svg viewBox="0 0 96 26" class="trend-{direction}" aria-hidden="true">
                        <polyline points={sparkline(service.trend)} />
                      </svg>
                    {/if}
                  </span>

                  <ArrowRight class="row-arrow h-4 w-4" />
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <!-- Modules -->
      <section class="panel" aria-labelledby="modules-title">
        <header class="panel-head">
          <h2 id="modules-title">{$_('project.overview.modulesPanel')}</h2>
        </header>
        <div class="modules">
          {#each modules as module (module.key)}
            {@const Icon = module.icon}
            <div class="module" class:off={!module.enabled}>
              <span class="module-icon"><Icon class="h-4 w-4" /></span>
              <span class="module-body">
                <span class="module-name">
                  <strong>{module.label}</strong>
                  <span class="pill" class:pill-on={module.enabled}>
                    <span class="dot"></span>
                    {module.enabled
                      ? $_('project.overview.enabled')
                      : $_('project.overview.disabled')}
                  </span>
                </span>
                <span class="module-description">{module.description}</span>
                <span class="module-links">
                  {#if module.enabled}
                    <a href={module.href}
                      >{$_('project.overview.open')} <ArrowRight class="h-3 w-3" /></a
                    >
                  {/if}
                  <a href={module.guide} target="_blank" rel="noopener noreferrer">
                    <BookOpen class="h-3 w-3" />
                    {$_('project.overview.guide')}
                  </a>
                </span>
              </span>
            </div>
          {/each}
        </div>
      </section>
    </div>

    <div class="side">
      <!-- Recent scans -->
      <section class="panel" aria-labelledby="scans-title">
        <header class="panel-head">
          <h2 id="scans-title">{$_('project.overview.scansPanel')}</h2>
          {#if cr && cr.recentScans.length}
            <a href={`${base}/code-report/history`} class="link">
              {$_('project.overview.viewAll')}
              <ArrowRight class="h-3.5 w-3.5" />
            </a>
          {/if}
        </header>
        {#if !cr}
          <p class="side-empty">{codeReportReason}</p>
        {:else if cr.recentScans.length === 0}
          <p class="side-empty">{$_('project.overview.scansEmpty')}</p>
        {:else}
          <ol class="timeline">
            {#each cr.recentScans as scan (scan.id)}
              <li>
                <span class="timeline-dot status-{scan.status}"></span>
                <a href={`${base}/code-report/history/${scan.id}`} class="timeline-body">
                  <span class="timeline-top">
                    <strong>{scan.service.name}</strong>
                    <span class="time">{ago(scan.createdAt)}</span>
                  </span>
                  <span class="timeline-bottom">
                    <span class="tool">{scan.tool}</span>
                    {#if scan.branch}<span>{scan.branch}</span>{/if}
                    {#if scan.commit}
                      <span class="commit"
                        ><GitCommitHorizontal class="h-3 w-3" />{scan.commit}</span
                      >
                    {/if}
                    <span
                      class="scan-result result-{scan.status === 'completed'
                        ? scan.findings
                          ? 'findings'
                          : 'clean'
                        : scan.status}"
                    >
                      {#if scan.status === 'failed'}
                        {$_('project.overview.scanFailed')}
                      {:else if scan.status === 'in_progress'}
                        {$_('project.overview.scanRunning')}
                      {:else if scan.findings}
                        {scan.findings === 1
                          ? $_('project.overview.scanFindingsOne')
                          : $_('project.overview.scanFindings', {
                              values: { count: scan.findings },
                            })}
                      {:else}
                        {$_('project.overview.noFindings')}
                      {/if}
                    </span>
                  </span>
                </a>
              </li>
            {/each}
          </ol>
        {/if}
      </section>

      <!-- Activity -->
      <section class="panel" aria-labelledby="activity-title">
        <header class="panel-head">
          <h2 id="activity-title">{$_('project.overview.activityPanel')}</h2>
        </header>
        {#if data.activity.length === 0}
          <div class="side-empty">
            <Activity class="h-4 w-4" />
            <span>{$_('project.overview.activityEmpty')}</span>
          </div>
        {:else}
          <ul class="activity">
            {#each data.activity as event (event.id)}
              {@const Icon = MODULE_ICON[event.module] ?? Activity}
              <li>
                <span class="activity-icon"><Icon class="h-3.5 w-3.5" /></span>
                <span class="activity-body">
                  <span class="activity-label">
                    {$_(event.label)}
                    {#if activityDetail(event)}<span class="activity-detail"
                        >{activityDetail(event)}</span
                      >{/if}
                  </span>
                  <span class="activity-meta">{actorName(event)} · {ago(event.occurredAt)}</span>
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <!-- Team and quick access -->
      <section class="panel" aria-labelledby="team-title">
        <header class="panel-head">
          <h2 id="team-title">{$_('project.overview.teamPanel')}</h2>
        </header>
        <div class="team">
          {#if data.members}
            <div class="members">
              <span class="avatars">
                {#each data.members.sample as name (name)}
                  <span title={name} style="--color: {avatarColor(name)}">{initials(name)}</span>
                {/each}
              </span>
              <span class="members-count">
                {$_('project.overview.membersCount', { values: { count: data.members.count } })}
              </span>
            </div>
          {/if}
          <a href={`${base}/settings/access-control`} class="quick">
            <UserPlus class="h-4 w-4" />
            <span>
              <strong>{$_('project.overview.inviteMembers')}</strong>
              <small>{$_('project.overview.inviteMembersDescription')}</small>
            </span>
            <ArrowRight class="h-3.5 w-3.5" />
          </a>
          <a href={`${base}/settings/server-access-keys`} class="quick">
            <KeyRound class="h-4 w-4" />
            <span>
              <strong>{$_('project.overview.addSecretToken')}</strong>
              <small>{$_('project.overview.addSecretTokenDescription')}</small>
            </span>
            <ArrowRight class="h-3.5 w-3.5" />
          </a>
        </div>
      </section>
    </div>
  </div>
</div>

<style>
  .overview {
    display: flex;
    flex-direction: column;
    gap: 16px;
    color: #c9c4cc;
  }

  /* Header */
  .hero {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 20px;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 14px;
    background:
      radial-gradient(
        80% 140% at 0% 0%,
        color-mix(in srgb, var(--hero, #f95d11) 8%, transparent),
        transparent 60%
      ),
      rgb(255 255 255 / 0.02);
  }

  .hero-avatar {
    display: grid;
    width: 52px;
    height: 52px;
    flex-shrink: 0;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--color) 45%, transparent);
    border-radius: 14px;
    background: color-mix(in srgb, var(--color) 18%, transparent);
    color: color-mix(in srgb, var(--color) 70%, white);
    font-size: 17px;
    font-weight: 700;
  }

  .hero-text {
    min-width: 0;
    flex: 1;
  }

  .hero-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  h1 {
    color: #ece8ee;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.3px;
  }

  .hero-description {
    margin-top: 4px;
    color: #a9a4ac;
    font-size: 14px;
    line-height: 1.5;
  }

  .hero-description.muted {
    color: #6d6870;
    font-style: italic;
  }

  .hero-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    color: #77737a;
    font-size: 12.5px;
  }

  .hero-meta code {
    padding: 1px 6px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 5px;
    background: rgb(255 255 255 / 0.03);
    color: #a9a4ac;
    font-family: var(--font-mono);
    font-size: 11.5px;
  }

  .hero-actions {
    display: flex;
    flex-shrink: 0;
    gap: 8px;
  }

  .button-primary,
  .button-secondary {
    display: inline-flex;
    height: 34px;
    align-items: center;
    gap: 7px;
    padding: 0 12px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 540;
    white-space: nowrap;
    transition: all 120ms ease;
  }

  .button-primary {
    border: 1px solid #f95d11;
    background: linear-gradient(180deg, #ff7430, #e74d08);
    box-shadow: 0 6px 18px rgb(249 93 17 / 0.18);
    color: #fff;
  }

  .button-primary:hover {
    filter: brightness(1.08);
  }

  .button-primary.small {
    height: 32px;
    margin-top: 10px;
  }

  .button-secondary {
    border: 1px solid rgb(255 255 255 / 0.1);
    background: rgb(255 255 255 / 0.04);
    color: #ded9df;
  }

  .button-secondary:hover {
    background: rgb(255 255 255 / 0.07);
  }

  @media (max-width: 1000px) {
    .hero {
      flex-wrap: wrap;
    }

    .hero-actions {
      width: 100%;
    }
  }

  /* Pills */
  .pill {
    display: inline-flex;
    height: 22px;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.04);
    color: #9d98a0;
    font-size: 11.5px;
    font-weight: 520;
  }

  .pill .dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
  }

  .pill-on {
    border-color: rgb(74 222 128 / 0.2);
    background: rgb(74 222 128 / 0.08);
    color: #6ee7a0;
  }

  /* Metrics */
  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  @media (max-width: 1100px) {
    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 560px) {
    .metrics {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .metric {
    display: flex;
    min-height: 104px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 12px;
    background: linear-gradient(180deg, rgb(255 255 255 / 0.035), rgb(255 255 255 / 0.015));
  }

  .metric-text {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .metric-label {
    color: #8a858d;
    font-size: 12.5px;
  }

  .metric strong {
    margin-top: 4px;
    color: #ece8ee;
    font-size: 28px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.6px;
    line-height: 1.1;
  }

  .metric strong.muted-value {
    color: #57535b;
  }

  .metric-hint {
    margin-top: 6px;
    color: #77737a;
    font-size: 12px;
    line-height: 1.4;
  }

  .metric-icon {
    display: grid;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    place-items: center;
    border: 1px solid rgb(249 93 17 / 0.22);
    border-radius: 11px;
    background: rgb(249 93 17 / 0.08);
    color: #ff8a4c;
  }

  .score-good {
    color: #6ee7a0 !important;
  }

  .score-fair {
    color: #f6c860 !important;
  }

  .score-poor {
    color: #f87171 !important;
  }

  .score-ring {
    width: 56px;
    height: 56px;
    flex-shrink: 0;
    transform: rotate(-90deg);
  }

  .score-ring circle {
    fill: none;
    stroke-width: 5;
  }

  .score-ring-track {
    stroke: rgb(255 255 255 / 0.07);
  }

  .score-ring-value {
    stroke-linecap: round;
    transition: stroke-dashoffset 400ms ease;
  }

  .score-ring-good .score-ring-value {
    stroke: #4ade80;
  }

  .score-ring-fair .score-ring-value {
    stroke: #fbbf24;
  }

  .score-ring-poor .score-ring-value {
    stroke: #f87171;
  }

  .score-ring-none .score-ring-value {
    stroke: transparent;
  }

  .severity-line {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .stack {
    display: flex;
    width: 64px;
    height: 8px;
    flex-shrink: 0;
    overflow: hidden;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.06);
    gap: 1px;
  }

  /* Severity chips and colors */
  .sev {
    display: inline-flex;
    height: 20px;
    align-items: center;
    gap: 3px;
    padding: 0 6px;
    border: 1px solid;
    border-radius: 5px;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    font-weight: 560;
  }

  .sev-critical {
    border-color: rgb(239 68 68 / 0.3);
    background: rgb(239 68 68 / 0.1);
    color: #fca5a5;
  }

  .sev-high {
    border-color: rgb(249 115 22 / 0.3);
    background: rgb(249 115 22 / 0.1);
    color: #fdba74;
  }

  .sev-medium {
    border-color: rgb(245 158 11 / 0.28);
    background: rgb(245 158 11 / 0.08);
    color: #fcd34d;
  }

  .sev-low {
    border-color: rgb(148 163 184 / 0.25);
    background: rgb(148 163 184 / 0.07);
    color: #cbd5e1;
  }

  .sev-bg-critical {
    background: #ef4444;
  }

  .sev-bg-high {
    background: #f97316;
  }

  .sev-bg-medium {
    background: #f59e0b;
  }

  .sev-bg-low {
    background: #94a3b8;
  }

  /* Panels */
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1.75fr) minmax(300px, 1fr);
    align-items: start;
    gap: 16px;
  }

  @media (max-width: 1100px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .main,
  .side {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 16px;
  }

  .panel {
    min-width: 0;
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 12px;
    background: rgb(255 255 255 / 0.02);
  }

  .panel-head {
    display: flex;
    min-height: 52px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid rgb(255 255 255 / 0.06);
  }

  .panel-head h2 {
    color: #ece8ee;
    font-size: 14px;
    font-weight: 560;
  }

  .panel-alert {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 3px;
    color: #fca5a5;
    font-size: 12px;
  }

  .panel-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .link,
  .link-button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #9d98a0;
    font-size: 12.5px;
    white-space: nowrap;
    transition: color 120ms ease;
  }

  .link:hover,
  .link-button:hover {
    color: #ff9a66;
  }

  .link-button {
    height: 28px;
    padding: 0 9px;
    border: 1px solid rgb(255 255 255 / 0.09);
    border-radius: 7px;
    background: rgb(255 255 255 / 0.03);
    color: #ded9df;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 40px 24px;
    color: #77737a;
    font-size: 13px;
    line-height: 1.5;
    text-align: center;
  }

  .empty-title {
    color: #ded9df;
    font-size: 14px;
    font-weight: 540;
  }

  /* Service rows */
  .service-list {
    display: flex;
    flex-direction: column;
    padding: 6px;
  }

  .service-row {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto 104px 16px;
    align-items: center;
    gap: 12px;
    padding: 11px 10px;
    border-radius: 9px;
    color: inherit;
    transition: background 120ms ease;
  }

  .service-row:hover {
    background: rgb(255 255 255 / 0.035);
  }

  @media (max-width: 760px) {
    .service-row {
      grid-template-columns: 28px minmax(0, 1fr) 16px;
    }

    .service-findings,
    .service-trend {
      grid-column: 2 / 3;
    }
  }

  .health-icon {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border-radius: 8px;
  }

  .health-critical .health-icon {
    background: rgb(239 68 68 / 0.12);
    color: #f87171;
  }

  .health-warning .health-icon {
    background: rgb(249 115 22 / 0.12);
    color: #fb923c;
  }

  .health-healthy .health-icon {
    background: rgb(74 222 128 / 0.1);
    color: #4ade80;
  }

  .health-unscanned .health-icon {
    background: rgb(255 255 255 / 0.05);
    color: #77737a;
  }

  .service-main {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  }

  .service-name {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  .service-name strong {
    overflow: hidden;
    color: #ece8ee;
    font-size: 13.5px;
    font-weight: 560;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .health-label {
    flex-shrink: 0;
    color: #6d6870;
    font-size: 11.5px;
  }

  .health-critical .health-label {
    color: #f87171;
  }

  .health-warning .health-label {
    color: #fb923c;
  }

  .service-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    color: #77737a;
    font-size: 12px;
  }

  .service-meta .stale {
    color: #f6c860;
  }

  .branch {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .tag {
    padding: 0 6px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.05);
    color: #9d98a0;
    font-size: 11px;
  }

  .service-findings {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
  }

  .clean {
    color: #6ee7a0;
    font-size: 12px;
  }

  .no-data {
    color: #57535b;
  }

  .badge-danger {
    display: inline-flex;
    height: 20px;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    border-radius: 5px;
    background: rgb(239 68 68 / 0.14);
    color: #fca5a5;
    font-size: 11px;
    font-weight: 540;
  }

  .service-trend svg {
    width: 100%;
    height: 26px;
    overflow: visible;
  }

  .service-trend polyline {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  /* more findings is worse: rising lines are red, falling ones green */
  .trend-up polyline {
    stroke: #f87171;
  }

  .trend-down polyline {
    stroke: #4ade80;
  }

  .trend-flat polyline {
    stroke: #8a858d;
  }

  .service-row :global(.row-arrow) {
    color: transparent;
    transition: color 120ms ease;
  }

  .service-row:hover :global(.row-arrow) {
    color: #8a858d;
  }

  /* Side panels */
  .side-empty {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 18px 16px;
    color: #77737a;
    font-size: 12.5px;
    line-height: 1.5;
  }

  .timeline {
    display: flex;
    flex-direction: column;
    padding: 8px 16px 12px;
  }

  .timeline li {
    position: relative;
    padding-left: 18px;
  }

  .timeline li:not(:last-child)::before {
    position: absolute;
    top: 16px;
    bottom: -6px;
    left: 3px;
    width: 1px;
    background: rgb(255 255 255 / 0.07);
    content: '';
  }

  .timeline-dot {
    position: absolute;
    top: 11px;
    left: 0;
    width: 7px;
    height: 7px;
    border-radius: 999px;
  }

  .status-completed {
    background: #4ade80;
  }

  .status-failed {
    background: #f87171;
  }

  .status-in_progress {
    background: #fbbf24;
    box-shadow: 0 0 0 3px rgb(251 191 36 / 0.18);
  }

  .timeline-body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 6px 8px;
    margin-left: -8px;
    border-radius: 8px;
    color: inherit;
  }

  .timeline-body:hover {
    background: rgb(255 255 255 / 0.035);
  }

  .timeline-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .timeline-top strong {
    overflow: hidden;
    color: #ded9df;
    font-size: 13px;
    font-weight: 540;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .time {
    flex-shrink: 0;
    color: #6d6870;
    font-size: 11.5px;
  }

  .timeline-bottom {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px;
    color: #77737a;
    font-size: 11.5px;
  }

  .tool {
    color: #a9a4ac;
    text-transform: capitalize;
  }

  .commit {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-mono);
  }

  .scan-result {
    margin-left: auto;
    padding: 0 6px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 540;
  }

  .result-clean {
    background: rgb(74 222 128 / 0.1);
    color: #6ee7a0;
  }

  .result-findings {
    background: rgb(249 115 22 / 0.12);
    color: #fdba74;
  }

  .result-failed {
    background: rgb(239 68 68 / 0.12);
    color: #fca5a5;
  }

  .result-in_progress {
    background: rgb(251 191 36 / 0.1);
    color: #fcd34d;
  }

  .activity {
    display: flex;
    flex-direction: column;
    padding: 8px 10px 12px;
  }

  .activity li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 7px 6px;
  }

  .activity-icon {
    display: grid;
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    place-items: center;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 7px;
    background: rgb(255 255 255 / 0.03);
    color: #a9a4ac;
  }

  .activity-body {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .activity-label {
    color: #ded9df;
    font-size: 13px;
  }

  .activity-detail {
    margin-left: 6px;
    color: #8a858d;
    font-family: var(--font-mono);
    font-size: 11.5px;
  }

  .activity-meta {
    color: #6d6870;
    font-size: 11.5px;
  }

  /* Modules */
  .modules {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    padding: 12px;
  }

  @media (max-width: 760px) {
    .modules {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .module {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px;
    border: 1px solid rgb(255 255 255 / 0.06);
    border-radius: 10px;
    background: rgb(255 255 255 / 0.015);
  }

  .module.off {
    opacity: 0.6;
  }

  .module-icon {
    display: grid;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    place-items: center;
    border: 1px solid rgb(249 93 17 / 0.22);
    border-radius: 8px;
    background: rgb(249 93 17 / 0.08);
    color: #ff8a4c;
  }

  .module-body {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 5px;
  }

  .module-name {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .module-name strong {
    color: #ece8ee;
    font-size: 13px;
    font-weight: 560;
  }

  .module-description {
    color: #77737a;
    font-size: 12px;
    line-height: 1.45;
  }

  .module-links {
    display: flex;
    gap: 12px;
    margin-top: 2px;
  }

  .module-links a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #a9a4ac;
    font-size: 12px;
  }

  .module-links a:hover {
    color: #ff9a66;
  }

  /* Team and quick access */
  .team {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
  }

  .members {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 4px 8px;
  }

  .avatars {
    display: flex;
  }

  .avatars span {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    margin-left: -6px;
    border: 2px solid #121216;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color) 35%, #1b1b1f);
    color: #f4f0f5;
    font-size: 10.5px;
    font-weight: 650;
  }

  .avatars span:first-child {
    margin-left: 0;
  }

  .members-count {
    color: #a9a4ac;
    font-size: 12.5px;
  }

  .quick {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid rgb(255 255 255 / 0.06);
    border-radius: 10px;
    color: #a9a4ac;
    transition: all 120ms ease;
  }

  .quick:hover {
    border-color: rgb(255 255 255 / 0.12);
    background: rgb(255 255 255 / 0.03);
    color: #ff9a66;
  }

  .quick span {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
  }

  .quick strong {
    color: #ded9df;
    font-size: 13px;
    font-weight: 540;
  }

  .quick small {
    color: #77737a;
    font-size: 12px;
  }
</style>
