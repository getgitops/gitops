<script lang="ts">
  import type { Snippet } from 'svelte';
  import {
    ArrowRight,
    CircleCheck,
    Clock,
    FileCode2,
    GitBranch,
    GitCommitHorizontal,
    Info,
    KeyRound,
    Package,
    User,
  } from '@lucide/svelte';
  import type { AnalysisSummary, VulnerabilityFinding } from '#lib/code-report/analysis-summary';
  import type { PolicyComplianceReport } from '#lib/code-report/policy-evaluation';
  import {
    SEVERITY_FILL,
    SEVERITY_LABEL,
    severityBadge,
    type RiskLevel,
    type SeverityKey,
  } from '#lib/code-report/severity-ui';
  import { Modal } from '#lib/components/ui';
  import { locale } from '#lib/i18n';
  import CodeReportToolBadge from './CodeReportToolBadge.svelte';
  import RiskTrendChart from './RiskTrendChart.svelte';
  import SecurityPolicyComplianceCard from './SecurityPolicyComplianceCard.svelte';

  type GitInfo = {
    repositoryUrl?: string | null;
    branch?: string | null;
    commit?: string | null;
    commitMessage?: string | null;
    author?: string | null;
    artifactName?: string | null;
    artifactType?: string | null;
  } | null;

  type ToolRun = {
    tool: string;
    status: string | null;
    createdAt: string | null;
    error?: string | null;
  };

  let {
    summary,
    riskScore,
    level,
    riskWeights,
    gitInfo,
    analyzedAt,
    toolRuns,
    complianceReport,
    policiesHref,
    trendPoints,
    selectedId = null,
    priorities,
    fixable = 0,
    riskWithoutFixable = 0,
    fileCount,
    dependencyCount,
    secretCount,
    onOpenTab,
    available = ['vulnerabilities', 'sbom', 'secrets'],
    aside,
  }: {
    summary: AnalysisSummary | null;
    riskScore: number;
    level: RiskLevel;
    riskWeights: { critical: number; high: number; medium: number; low: number };
    gitInfo: GitInfo;
    analyzedAt: string | null;
    toolRuns: ToolRun[];
    complianceReport: PolicyComplianceReport | null;
    policiesHref: string | null;
    trendPoints: {
      id: string;
      createdAt: string;
      score: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
    }[];
    selectedId?: string | null;
    priorities: VulnerabilityFinding[];
    /** Vulnerabilidades con versión corregida y riesgo que quedaría tras aplicarlas. */
    fixable?: number;
    riskWithoutFixable?: number;
    fileCount: number;
    dependencyCount: number | null;
    secretCount: number | null;
    onOpenTab: (tab: 'vulnerabilities' | 'sbom' | 'secrets', severity?: string) => void;
    /** Pestañas que existen: las cifras solo enlazan a ellas. */
    available?: ('vulnerabilities' | 'sbom' | 'secrets')[];
    aside?: Snippet;
  } = $props();

  let riskInfoOpen = $state(false);

  const severities: Exclude<SeverityKey, 'unknown'>[] = ['critical', 'high', 'medium', 'low'];
  const total = $derived(
    summary ? severities.reduce((sum, key) => sum + summary.vulnerabilities[key], 0) : 0,
  );

  const repoBase = $derived(
    gitInfo?.repositoryUrl?.replace(/\.git$/, '').replace(/\/$/, '') ?? null,
  );
  const commitHref = $derived(
    repoBase && gitInfo?.commit && /^https?:/.test(repoBase)
      ? `${repoBase}/commit/${gitInfo.commit}`
      : null,
  );
  const authorName = $derived(gitInfo?.author?.replace(/\s*<[^>]+>\s*$/, '').trim() || null);
  const repoLabel = $derived(repoBase?.replace(/^https?:\/\/(www\.)?/, '') ?? null);

  const runStatus: Record<string, { label: string; badge: string; dot: string }> = {
    completed: { label: 'Completado', badge: 'k-badge-ok', dot: 'bg-ok' },
    in_progress: { label: 'En curso', badge: 'k-badge-info', dot: 'bg-info' },
    failed: { label: 'Fallido', badge: 'k-badge-danger', dot: 'bg-danger' },
  };

  function dateTime(iso: string) {
    return new Intl.DateTimeFormat($locale ?? 'es', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  }

  function relative(iso: string) {
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

<div class="space-y-4">
  <!-- Riesgo + último análisis -->
  <div class="grid gap-4 lg:grid-cols-5">
    <section class="k-card relative min-w-0 overflow-hidden p-5 lg:col-span-2" aria-label="Riesgo">
      <div
        class="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full blur-3xl {level.key ===
        'critical'
          ? 'bg-red-500/15'
          : level.key === 'high'
            ? 'bg-brand-500/15'
            : level.key === 'medium'
              ? 'bg-amber-500/10'
              : 'bg-ok/10'}"
      ></div>
      <div class="relative flex items-start justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
            Estado de seguridad
          </p>
          <p class="mt-1 text-lg font-semibold {level.tone}">{level.label}</p>
        </div>
        <div class="text-right">
          <p class="text-4xl font-semibold tabular-nums leading-none text-white">{riskScore}</p>
          <p class="mt-1 text-xs text-fg-subtle">puntos</p>
        </div>
      </div>

      {#if summary && total > 0}
        <div class="relative mt-5 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
          {#each severities as key (key)}
            {#if summary.vulnerabilities[key] > 0}
              <div
                class={SEVERITY_FILL[key]}
                style="width:{(summary.vulnerabilities[key] / total) * 100}%"
              ></div>
            {/if}
          {/each}
        </div>
        <ul class="relative mt-3 grid grid-cols-4 gap-2">
          {#each severities as key (key)}
            <li>
              <button
                type="button"
                class="w-full rounded-lg px-1 py-1 text-left transition-colors hover:bg-white/4 disabled:cursor-default disabled:hover:bg-transparent"
                disabled={summary.vulnerabilities[key] === 0}
                onclick={() => onOpenTab('vulnerabilities', key)}
              >
                <span class="flex items-center gap-1.5 text-[11px] text-fg-subtle">
                  <span class="h-1.5 w-1.5 rounded-full {SEVERITY_FILL[key]}"></span>
                  {SEVERITY_LABEL[key]}
                </span>
                <span
                  class="mt-0.5 block text-lg font-semibold tabular-nums {summary.vulnerabilities[
                    key
                  ] === 0
                    ? 'text-fg-subtle'
                    : 'text-white'}">{summary.vulnerabilities[key]}</span
                >
              </button>
            </li>
          {/each}
        </ul>
      {:else if summary}
        <p class="relative mt-5 flex items-center gap-2 text-sm text-fg-muted">
          <CircleCheck class="h-4 w-4 text-ok" />Sin vulnerabilidades en el último análisis.
        </p>
      {/if}

      {#if summary && total > 0}
        <div class="relative mt-5 rounded-lg border border-white/8 bg-white/2 px-3 py-2.5">
          <div class="flex items-center justify-between gap-2 text-xs">
            <span class="text-fg-muted">Con parche disponible</span>
            <span class="tabular-nums text-white">{fixable} de {total}</span>
          </div>
          <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/6">
            <div class="h-full rounded-full bg-ok" style="width:{(fixable / total) * 100}%"></div>
          </div>
          <p class="mt-1.5 text-[11px] text-fg-subtle">
            Actualizar esas dependencias bajaría el riesgo a
            <span class="tabular-nums text-fg">{riskWithoutFixable}</span> puntos.
          </p>
        </div>
      {/if}

      <button
        type="button"
        class="relative mt-4 inline-flex items-center gap-1.5 text-xs text-fg-subtle hover:text-white"
        onclick={() => (riskInfoOpen = true)}
      >
        <Info class="h-3.5 w-3.5" />¿Cómo se calcula?
      </button>
    </section>

    <section class="k-card min-w-0 p-5 lg:col-span-3" aria-labelledby="last-analysis-title">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="last-analysis-title" class="font-semibold text-white">Análisis</h2>
          {#if analyzedAt}
            <p
              class="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle"
              title={dateTime(analyzedAt)}
            >
              <Clock class="h-3.5 w-3.5" />{relative(analyzedAt)} · {dateTime(analyzedAt)}
            </p>
          {/if}
        </div>
      </div>

      {#if gitInfo && (repoLabel || gitInfo.commit || gitInfo.branch || authorName)}
        <dl class="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {#if repoLabel}
            <div class="min-w-0 sm:col-span-2">
              <dt class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">Repositorio</dt>
              <dd class="mt-0.5 truncate">
                {#if /^https?:/.test(repoBase ?? '')}
                  <a
                    href={repoBase}
                    target="_blank"
                    rel="noreferrer noopener"
                    class="text-fg hover:text-brand-300">{repoLabel} ↗</a
                  >
                {:else}<span class="text-fg">{repoLabel}</span>{/if}
              </dd>
            </div>
          {/if}
          {#if gitInfo.branch}
            <div class="min-w-0">
              <dt class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">Rama</dt>
              <dd class="mt-0.5">
                <span class="k-badge font-mono"><GitBranch class="h-3 w-3" />{gitInfo.branch}</span>
              </dd>
            </div>
          {/if}
          {#if gitInfo.commit}
            <div class="min-w-0">
              <dt class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">Commit</dt>
              <dd class="mt-0.5">
                {#if commitHref}
                  <a
                    href={commitHref}
                    target="_blank"
                    rel="noreferrer noopener"
                    class="k-badge font-mono hover:text-white"
                    title={gitInfo.commit}
                    ><GitCommitHorizontal class="h-3 w-3" />{gitInfo.commit.slice(0, 8)}</a
                  >
                {:else}
                  <span class="k-badge font-mono" title={gitInfo.commit}
                    ><GitCommitHorizontal class="h-3 w-3" />{gitInfo.commit.slice(0, 8)}</span
                  >
                {/if}
              </dd>
            </div>
          {/if}
          {#if gitInfo.commitMessage}
            <div class="min-w-0 sm:col-span-2">
              <dt class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">Mensaje</dt>
              <dd class="mt-0.5 truncate text-fg-muted" title={gitInfo.commitMessage}>
                {gitInfo.commitMessage}
              </dd>
            </div>
          {/if}
          {#if authorName}
            <div class="min-w-0">
              <dt class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">Autor</dt>
              <dd class="mt-0.5 flex items-center gap-1.5 truncate text-fg">
                <User class="h-3.5 w-3.5 text-fg-subtle" />{authorName}
              </dd>
            </div>
          {/if}
          {#if gitInfo.artifactName}
            <div class="min-w-0">
              <dt class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">Artefacto</dt>
              <dd class="mt-0.5 truncate font-mono text-xs text-fg" title={gitInfo.artifactName}>
                {gitInfo.artifactName}
                {#if gitInfo.artifactType}<span class="text-fg-subtle"
                    >· {gitInfo.artifactType}</span
                  >{/if}
              </dd>
            </div>
          {/if}
        </dl>
      {:else}
        <p class="mt-4 text-sm text-fg-subtle">
          Este análisis no incluye información del repositorio. Envía <span class="font-mono"
            >gitInfo</span
          > desde tu pipeline para ver rama, commit y autor.
        </p>
      {/if}

      {#if toolRuns.length > 0}
        <ul class="mt-4 grid gap-2 border-t border-white/8 pt-4 sm:grid-cols-3">
          {#each toolRuns as run (run.tool)}
            {@const status = run.status ? runStatus[run.status] : null}
            <li class="rounded-lg border border-white/8 bg-white/2 px-3 py-2">
              <div class="flex items-center justify-between gap-2">
                <CodeReportToolBadge tool={run.tool} size="sm" />
                {#if status}
                  <span class="h-1.5 w-1.5 rounded-full {status.dot}" title={status.label}></span>
                {/if}
              </div>
              <p
                class="mt-1.5 truncate text-xs {run.status === 'failed'
                  ? 'text-red-300'
                  : 'text-fg-subtle'}"
              >
                {#if !run.createdAt}
                  Nunca ejecutado
                {:else if run.status === 'failed'}
                  Fallido · {relative(run.createdAt)}
                {:else if run.status === 'in_progress'}
                  En curso · {relative(run.createdAt)}
                {:else}
                  {relative(run.createdAt)}
                {/if}
              </p>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>

  {#if complianceReport}
    <SecurityPolicyComplianceCard report={complianceReport} {policiesHref} />
  {/if}

  <!-- Prioridades + evolución | lateral -->
  <div class="grid gap-4 lg:grid-cols-3">
    <div class="min-w-0 space-y-4 lg:col-span-2">
      <section class="k-card overflow-hidden" aria-labelledby="priorities-title">
        <div class="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
          <div>
            <h2 id="priorities-title" class="font-semibold text-white">Qué corregir primero</h2>
            <p class="text-xs text-fg-subtle">
              Críticas y altas ordenadas por severidad y CVSS, con su versión corregida
            </p>
          </div>
          {#if summary && summary.totalVulnerabilities > 0}
            <button
              type="button"
              class="shrink-0 text-xs text-fg-subtle hover:text-white"
              onclick={() => onOpenTab('vulnerabilities')}>Ver todas</button
            >
          {/if}
        </div>
        {#if priorities.length === 0}
          <p class="flex items-center gap-2 px-5 py-8 text-sm text-fg-muted">
            <CircleCheck class="h-4 w-4 text-ok" />No hay vulnerabilidades críticas ni altas.
          </p>
        {:else}
          <ul class="divide-y divide-white/6">
            {#each priorities as finding, index (finding.id + finding.packageName + index)}
              <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                <span
                  class="k-badge {severityBadge(
                    finding.severity,
                  )} w-16 justify-center font-semibold">{SEVERITY_LABEL[finding.severity]}</span
                >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm text-white">
                    <span class="font-medium">{finding.packageName}</span>
                    <span class="font-mono text-xs text-fg-subtle">{finding.id}</span>
                  </p>
                  <p class="truncate text-xs text-fg-subtle" title={finding.title}>
                    {finding.title || finding.packagePath}
                  </p>
                </div>
                <span class="font-mono text-xs">
                  <span class="text-red-300">{finding.installedVersion}</span>
                  {#if finding.fixedVersion}
                    <span class="text-fg-subtle">→</span>
                    <span class="text-ok">{finding.fixedVersion}</span>
                  {:else}
                    <span class="text-fg-subtle">· sin parche</span>
                  {/if}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="k-card p-5" aria-labelledby="trend-title">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 id="trend-title" class="font-semibold text-white">Evolución del riesgo</h2>
            <p class="text-xs text-fg-subtle">
              Riesgo ponderado de cada análisis de vulnerabilidades
            </p>
          </div>
        </div>
        {#if trendPoints.length > 1}
          <RiskTrendChart points={trendPoints} {selectedId} />
        {:else}
          <p class="py-10 text-center text-sm text-fg-subtle">
            Hacen falta al menos dos análisis para ver la evolución.
          </p>
        {/if}
      </section>
    </div>

    <div class="min-w-0 space-y-4">
      {#if aside}{@render aside()}{/if}

      <section class="k-card divide-y divide-white/6" aria-label="Cifras del análisis">
        {#if available.includes('vulnerabilities')}
          <button
            type="button"
            class="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/2.5"
            onclick={() => onOpenTab('vulnerabilities')}
          >
            <FileCode2 class="h-4 w-4 text-fg-subtle" />
            <span class="flex-1 text-sm text-fg-muted">Archivos afectados</span>
            <span class="font-semibold tabular-nums text-white">{fileCount}</span>
            <ArrowRight class="h-3.5 w-3.5 text-fg-subtle" />
          </button>
        {/if}
        {#if available.includes('sbom')}
          <button
            type="button"
            class="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/2.5"
            onclick={() => onOpenTab('sbom')}
          >
            <Package class="h-4 w-4 text-fg-subtle" />
            <span class="flex-1 text-sm text-fg-muted">Dependencias</span>
            <span class="font-semibold tabular-nums text-white">{dependencyCount ?? '—'}</span>
            <ArrowRight class="h-3.5 w-3.5 text-fg-subtle" />
          </button>
        {/if}
        {#if available.includes('secrets')}
          <button
            type="button"
            class="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/2.5"
            onclick={() => onOpenTab('secrets')}
          >
            <KeyRound class="h-4 w-4 {secretCount ? 'text-red-400' : 'text-fg-subtle'}" />
            <span class="flex-1 text-sm text-fg-muted">Secretos expuestos</span>
            <span class="font-semibold tabular-nums {secretCount ? 'text-red-300' : 'text-white'}"
              >{secretCount ?? '—'}</span
            >
            <ArrowRight class="h-3.5 w-3.5 text-fg-subtle" />
          </button>
        {/if}
      </section>
    </div>
  </div>
</div>

<Modal
  bind:open={riskInfoOpen}
  title="¿Cómo se calcula el riesgo?"
  description="Suma el peso de cada vulnerabilidad del análisis. Cuanto mayor, antes hay que remediar."
>
  <div class="grid grid-cols-2 gap-2">
    {#each severities as key (key)}
      <div class="rounded-lg border border-white/8 bg-white/2 px-3 py-2.5">
        <p class="flex items-center gap-2 text-sm font-medium text-white">
          <span class="h-2 w-2 rounded-full {SEVERITY_FILL[key]}"></span>
          {SEVERITY_LABEL[key]} × {riskWeights[key]}
        </p>
        <p class="mt-0.5 text-xs text-fg-subtle">
          {summary?.vulnerabilities[key] ?? 0} detectadas
        </p>
      </div>
    {/each}
  </div>
  <p class="mt-4 rounded-lg bg-ink-950 px-3 py-2 font-mono text-xs text-fg">
    (C × {riskWeights.critical}) + (H × {riskWeights.high}) + (M × {riskWeights.medium}) + (L × {riskWeights.low})
    = {riskScore}
  </p>
  <p class="mt-3 text-xs text-fg-subtle">
    Bajo 1-7 · medio 8-19 · alto 20-39 · crítico 40+ o cualquier vulnerabilidad crítica. Los pesos
    se cambian en los ajustes de Code Report.
  </p>
</Modal>
