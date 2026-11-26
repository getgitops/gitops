<!--
  Resumen de un stack: salud, recursos, último despliegue, éxito a 30 días, despliegues por semana,
  recursos por tipo, últimos updates, últimos cambios y avisos entre los stacks del proyecto.
  Cada sección sale solo si el usuario tiene su permiso (el servidor deja a `null` el resto).
-->
<script lang="ts">
  import {
    AlertTriangle,
    CircleAlert,
    CircleCheck,
    CircleX,
    Clock,
    GitBranch,
    GitCommitHorizontal,
    ShieldAlert,
  } from '@lucide/svelte';
  import { _, locale } from '#lib/i18n';
  import { duration, relativeTime } from '#lib/state-iac/format';
  import type {
    EnvironmentWarningView,
    IacUpdateView,
    StackDashboardView,
  } from '#lib/state-iac/types';

  type Props = {
    dashboard: StackDashboardView;
    warnings: EnvironmentWarningView[];
    canReadStates: boolean;
    canReadHistory: boolean;
    onopentab: (tab: 'history' | 'changes') => void;
  };
  let { dashboard, warnings, canReadStates, canReadHistory, onopentab }: Props = $props();

  const rel = (value: string | null | undefined) => relativeTime(value, $locale) ?? '—';
  const stackName = (ref: { project: string | null; stack: string }) =>
    `${ref.project ?? '?'} / ${ref.stack}`;
  const last = $derived(dashboard.lastUpdate);
  const resources = $derived(dashboard.resources);
  const deployments = $derived(dashboard.deployments);
  const healthTone = {
    ok: { icon: CircleCheck, cls: 'text-ok' },
    warn: { icon: AlertTriangle, cls: 'text-warn' },
    critical: { icon: CircleX, cls: 'text-danger' },
  } as const;
  const health = $derived(healthTone[dashboard.health.level]);
  const HealthIcon = $derived(health.icon);

  // delta of the last update
  const DELTA = ['create', 'update', 'replace', 'delete'] as const;
  const delta = $derived(
    DELTA.flatMap((key) => {
      const count = dashboard.updateChanges?.[key] ?? 0;
      return count > 0 ? [{ key, count }] : [];
    }),
  );

  // ---- weekly deployments chart ----
  const PLOT = 160;
  const weeks = $derived(deployments?.weeks ?? []);
  const maxWeek = $derived(Math.max(1, ...weeks.map((w) => w.succeeded + w.failed)));
  // 2px between the stacked segments are part of the column height
  const scale = $derived((PLOT - 2) / maxWeek);
  const anyDeploy = $derived(weeks.some((w) => w.succeeded + w.failed > 0));
  const dateOf = (value: string) =>
    new Date(value).toLocaleDateString($locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  const providerLine = $derived(
    resources
      ? [
          ...resources.byProvider.map((p) => `${p.provider} ${p.count}`),
          `${$_('stateIac.dashboard.byType.components')} ${resources.components}`,
        ].join(' · ')
      : '',
  );
  const typeMax = $derived(Math.max(1, ...(resources?.topTypes.map((t) => t.count) ?? [1])));

  const resultIcon = (result: IacUpdateView['result']) =>
    result === 'succeeded' ? CircleCheck : result === 'failed' ? CircleX : Clock;
  const resultClass = (result: IacUpdateView['result']) =>
    result === 'succeeded' ? 'text-ok' : result === 'failed' ? 'text-danger' : 'text-fg-subtle';
  const CHANGE_TONE: Record<string, string> = {
    create: 'k-badge-ok',
    replace: 'k-badge-warn',
    delete: 'k-badge-danger',
    update: 'k-badge-info',
  };
  const CHANGE_ORDER = ['create', 'update', 'replace', 'delete', 'import', 'same'];

  const warningLines = $derived([
    ...warnings.map((warning) => {
      if (warning.kind === 'version_drift') {
        return $_('stateIac.dashboard.warnings.versionDrift', {
          values: {
            stacks: warning.stacks.map((s) => `${stackName(s)} (${s.version})`).join(', '),
          },
        });
      }
      if (warning.kind === 'stack_failed') {
        return $_('stateIac.dashboard.warnings.stackFailed', {
          values: { stack: stackName(warning.stack), when: rel(warning.at) },
        });
      }
      return $_('stateIac.dashboard.warnings.staleLock', {
        values: { stack: stackName(warning.stack), when: rel(warning.since) },
      });
    }),
    ...(resources && resources.pendingChange > 0
      ? [
          $_('stateIac.dashboard.warnings.pending', {
            values: { count: resources.pendingChange },
          }),
        ]
      : []),
  ]);
</script>

<div class="space-y-6" data-testid="stack-dashboard">
  <dl class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <div class="k-card p-4" data-testid="kpi-health">
      <dt class="text-xs text-fg-subtle">{$_('stateIac.dashboard.health.title')}</dt>
      <dd class="mt-1">
        <span class="flex items-center gap-2 text-lg font-semibold text-fg">
          <HealthIcon class="h-5 w-5 {health.cls}" />
          {$_(`stateIac.dashboard.health.${dashboard.health.level}`)}
        </span>
        <ul class="mt-1 space-y-0.5 text-xs text-fg-muted">
          {#each dashboard.health.reasons as reason (reason)}
            <li>{$_(`stateIac.dashboard.health.reasons.${reason}`)}</li>
          {:else}
            <li>{$_('stateIac.dashboard.health.noReasons')}</li>
          {/each}
        </ul>
      </dd>
    </div>

    <div class="k-card p-4" data-testid="kpi-resources">
      <dt class="text-xs text-fg-subtle">{$_('stateIac.dashboard.kpi.resources')}</dt>
      <dd class="mt-1">
        {#if resources}
          <span class="text-xl font-semibold text-fg">{resources.total}</span>
          <span class="block text-xs text-fg-muted">
            {$_('stateIac.dashboard.kpi.managed', { values: { count: resources.managed } })}
            · {$_('stateIac.dashboard.kpi.components', { values: { count: resources.components } })}
            · {$_('stateIac.dashboard.kpi.protected', { values: { count: resources.protected } })}
          </span>
        {:else}
          <span class="text-xl font-semibold text-fg">—</span>
        {/if}
        {#if delta.length > 0}
          <span class="mt-2 block text-xs text-fg-subtle"
            >{$_('stateIac.dashboard.kpi.lastUpdate')}</span
          >
          <span class="mt-1 flex flex-wrap gap-1">
            {#each delta as { key, count } (key)}
              <span class="k-badge h-5 px-1.5 text-[10px] {CHANGE_TONE[key]}"
                >{$_(`stateIac.changes.${key}`)} {count}</span
              >
            {/each}
          </span>
        {/if}
      </dd>
    </div>

    <div class="k-card p-4" data-testid="kpi-last-deploy">
      <dt class="text-xs text-fg-subtle">{$_('stateIac.dashboard.kpi.lastDeploy')}</dt>
      <dd class="mt-1 text-sm text-fg">
        {#if last}
          {@const ResultIcon = resultIcon(last.result)}
          <span class="flex items-center gap-1.5 text-lg font-semibold">
            {rel(last.endedAt ?? last.startedAt)}
          </span>
          <span class="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
            <ResultIcon class="h-3.5 w-3.5 {resultClass(last.result)}" />
            {$_(`stateIac.kinds.${last.kind}`)} · {$_(`stateIac.results.${last.result}`)}
            {#if duration(last.startedAt, last.endedAt)}
              · {$_('stateIac.dashboard.kpi.took', {
                values: { duration: duration(last.startedAt, last.endedAt) },
              })}{/if}
          </span>
          {#if last.vcs.commit || last.vcs.branch || last.vcs.author}
            <span class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
              {#if last.vcs.commit}<span class="inline-flex items-center gap-1 font-mono"
                  ><GitCommitHorizontal class="h-3 w-3" />{last.vcs.commit.slice(0, 7)}</span
                >{/if}
              {#if last.vcs.branch}<span class="inline-flex items-center gap-1 font-mono"
                  ><GitBranch class="h-3 w-3" />{last.vcs.branch}</span
                >{/if}
              {#if last.vcs.author}<span>{last.vcs.author}</span>{/if}
            </span>
          {/if}
        {:else}
          <span class="text-fg-muted">{$_('stateIac.dashboard.kpi.noDeploy')}</span>
        {/if}
      </dd>
    </div>

    <div class="k-card p-4" data-testid="kpi-success">
      <dt class="text-xs text-fg-subtle">{$_('stateIac.dashboard.kpi.success')}</dt>
      <dd class="mt-1">
        {#if deployments && deployments.window.rate !== null}
          <span class="text-xl font-semibold text-fg"
            >{Math.round(deployments.window.rate * 100)} %</span
          >
          <span class="block text-xs text-fg-muted">
            {$_('stateIac.dashboard.kpi.successDetail', {
              values: {
                succeeded: deployments.window.succeeded,
                total: deployments.window.total,
              },
            })}
            · {$_('stateIac.dashboard.kpi.perWeek', { values: { count: deployments.perWeek } })}
          </span>
        {:else}
          <span class="text-xl font-semibold text-fg">—</span>
          {#if deployments}<span class="block text-xs text-fg-muted"
              >{$_('stateIac.dashboard.kpi.noUpdates')}</span
            >{/if}
        {/if}
      </dd>
    </div>
  </dl>

  {#if warningLines.length > 0}
    <section class="k-card border-warn/30 p-4" aria-labelledby="dash-warnings">
      <h3 id="dash-warnings" class="text-sm font-semibold text-fg">
        {$_('stateIac.dashboard.warnings.title')}
      </h3>
      <ul class="mt-2 space-y-1.5 text-sm text-fg-muted" data-testid="dashboard-warnings">
        {#each warningLines as line (line)}
          <li class="flex items-start gap-2">
            <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-warn" />{line}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if !canReadHistory && !canReadStates}
    <p class="k-card border-dashed px-4 py-4 text-center text-sm text-fg-muted">
      <ShieldAlert class="mr-1 inline h-4 w-4" />{$_('stateIac.dashboard.missingPermissions')}
    </p>
  {/if}

  {#if deployments}
    <section class="k-card p-4" aria-labelledby="dash-deploys" data-testid="dashboard-deploys">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 id="dash-deploys" class="text-sm font-semibold text-fg">
          {$_('stateIac.dashboard.deploys.title')}
        </h3>
        <ul class="flex items-center gap-4 text-xs text-fg-muted">
          <li class="flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-sm" style="background: var(--color-series-1)"></span>
            {$_('stateIac.dashboard.deploys.succeeded')}
          </li>
          <li class="flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-sm" style="background: var(--color-series-2)"></span>
            {$_('stateIac.dashboard.deploys.failed')}
          </li>
        </ul>
      </div>
      {#if anyDeploy}
        <div
          class="mt-3 flex h-40 items-end gap-1.5 border-b border-white/15"
          role="img"
          aria-label={$_('stateIac.dashboard.deploys.chart')}
        >
          {#each weeks as week (week.start)}
            {@const hs = week.succeeded * scale}
            {@const hf = week.failed * scale}
            <div
              class="flex h-full min-w-0 flex-1 flex-col-reverse items-center gap-0.5"
              title="{$_('stateIac.dashboard.deploys.week', {
                values: { date: dateOf(week.start) },
              })}: {week.succeeded} {$_('stateIac.dashboard.deploys.succeeded')}, {week.failed} {$_(
                'stateIac.dashboard.deploys.failed',
              )}"
            >
              {#if hs > 0}
                <div
                  class="w-full max-w-7 {hf > 0 ? '' : 'rounded-t-[4px]'}"
                  style="height: {hs}px; background: var(--color-series-1)"
                ></div>
              {/if}
              {#if hf > 0}
                <div
                  class="w-full max-w-7 rounded-t-[4px]"
                  style="height: {hf}px; background: var(--color-series-2)"
                ></div>
              {/if}
            </div>
          {/each}
        </div>
        <div class="mt-1 flex gap-1.5 text-xs text-fg-subtle" aria-hidden="true">
          {#each weeks as week, index (week.start)}
            <span class="min-w-0 flex-1 text-center">
              {#if index % 3 === 0 || index === weeks.length - 1}{dateOf(week.start)}{/if}
            </span>
          {/each}
        </div>
      {:else}
        <p class="mt-3 text-sm text-fg-muted">{$_('stateIac.dashboard.deploys.empty')}</p>
      {/if}
      <details class="mt-2 text-xs text-fg-muted">
        <summary class="cursor-pointer hover:text-fg"
          >{$_('stateIac.dashboard.deploys.viewTable')}</summary
        >
        <table class="mt-2 w-full text-left">
          <caption class="sr-only">{$_('stateIac.dashboard.deploys.tableTitle')}</caption>
          <thead class="text-fg-subtle">
            <tr>
              <th scope="col" class="py-1 font-medium"
                >{$_('stateIac.dashboard.deploys.weekColumn')}</th
              >
              <th scope="col" class="py-1 font-medium"
                >{$_('stateIac.dashboard.deploys.succeeded')}</th
              >
              <th scope="col" class="py-1 font-medium">{$_('stateIac.dashboard.deploys.failed')}</th
              >
            </tr>
          </thead>
          <tbody>
            {#each weeks as week (week.start)}
              <tr class="border-t border-white/5">
                <th scope="row" class="py-1 font-normal">{dateOf(week.start)}</th>
                <td>{week.succeeded}</td>
                <td>{week.failed}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </details>
    </section>
  {/if}

  <div class="grid gap-6 lg:grid-cols-2">
    {#if resources}
      <section class="k-card p-4" aria-labelledby="dash-types" data-testid="dashboard-types">
        <h3 id="dash-types" class="text-sm font-semibold text-fg">
          {$_('stateIac.dashboard.byType.title')}
        </h3>
        <ul class="mt-3 space-y-2">
          {#each resources.topTypes as entry (entry.type)}
            <li class="grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-x-3 text-xs">
              <span class="truncate font-mono text-fg-muted">{entry.type}</span>
              <span class="text-right text-fg">{entry.count}</span>
              <span class="col-span-2 block h-1 overflow-hidden rounded-full bg-white/5">
                <span
                  class="block h-full rounded-full"
                  style="width: {(entry.count / typeMax) * 100}%; background: var(--color-series-1)"
                ></span>
              </span>
            </li>
          {/each}
          {#if resources.otherCount > 0}
            <li class="flex justify-between text-xs text-fg-muted">
              <span>{$_('stateIac.dashboard.byType.others')}</span>
              <span class="text-fg">{resources.otherCount}</span>
            </li>
          {/if}
        </ul>
        <p class="mt-3 text-xs text-fg-subtle">
          {providerLine}
        </p>
      </section>
    {/if}

    {#if deployments}
      <section class="k-card p-4" aria-labelledby="dash-recent" data-testid="dashboard-recent">
        <div class="flex items-center justify-between gap-2">
          <h3 id="dash-recent" class="text-sm font-semibold text-fg">
            {$_('stateIac.dashboard.recent.title')}
          </h3>
          <button
            type="button"
            class="k-btn k-btn-ghost k-btn-sm"
            onclick={() => onopentab('history')}
          >
            {$_('stateIac.dashboard.recent.viewHistory')}
          </button>
        </div>
        <ul class="mt-2 divide-y divide-white/5">
          {#each deployments.recent as update (update.id)}
            {@const Icon = resultIcon(update.result)}
            <li class="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-xs">
              <Icon class="h-4 w-4 shrink-0 {resultClass(update.result)}" />
              <span class="text-fg">{$_(`stateIac.results.${update.result}`)}</span>
              <span class="text-fg-muted">{$_(`stateIac.kinds.${update.kind}`)}</span>
              {#if update.message}
                <span class="max-w-40 truncate text-fg-subtle" title={update.message}
                  >{update.message}</span
                >
              {/if}
              {#each CHANGE_ORDER.filter((k) => update.changes[k] && k !== 'same') as key (key)}
                <span class="k-badge h-5 px-1.5 text-[10px]"
                  >{$_(`stateIac.changes.${key}`)} {update.changes[key]}</span
                >
              {/each}
              <span class="ml-auto text-fg-subtle">{rel(update.endedAt ?? update.startedAt)}</span>
            </li>
          {:else}
            <li class="py-3 text-sm text-fg-muted">{$_('stateIac.dashboard.recent.empty')}</li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>

  {#if canReadStates}
    <section class="k-card p-4" aria-labelledby="dash-changes" data-testid="dashboard-changes">
      <div class="flex items-center justify-between gap-2">
        <h3 id="dash-changes" class="text-sm font-semibold text-fg">
          {$_('stateIac.dashboard.lastChanges.title')}
        </h3>
        <button
          type="button"
          class="k-btn k-btn-ghost k-btn-sm"
          onclick={() => onopentab('changes')}
        >
          {$_('stateIac.dashboard.lastChanges.viewDiff')}
        </button>
      </div>
      {#if dashboard.lastChanges}
        {@const changes = dashboard.lastChanges}
        <p class="mt-2 flex flex-wrap gap-1.5">
          {#each ['create', 'update', 'replace', 'delete'] as const as key (key)}
            <span class="k-badge h-6 px-2 text-xs {changes.summary[key] ? CHANGE_TONE[key] : ''}"
              >{$_(`stateIac.changes.${key}`)} {changes.summary[key]}</span
            >
          {/each}
        </p>
        {#if changes.resources.length === 0}
          <p class="mt-2 text-sm text-fg-muted">{$_('stateIac.dashboard.lastChanges.noChanges')}</p>
        {:else}
          <ul class="mt-2 divide-y divide-white/5">
            {#each changes.resources as resource (resource.address)}
              <li class="flex flex-wrap items-center gap-2 py-2 text-xs">
                <span class="k-badge h-5 px-1.5 text-[10px] {CHANGE_TONE[resource.change]}"
                  >{$_(`stateIac.changes.${resource.change}`)}</span
                >
                <span class="font-medium text-fg">{resource.name}</span>
                <span class="truncate font-mono text-fg-subtle">{resource.paths.join(', ')}</span>
              </li>
            {/each}
          </ul>
          {#if changes.moreCount > 0}
            <p class="mt-1 text-xs text-fg-subtle">
              {$_('stateIac.dashboard.lastChanges.more', { values: { count: changes.moreCount } })}
            </p>
          {/if}
        {/if}
        {#if changes.providerOnlyCount > 0}
          <p class="mt-2 text-xs text-fg-subtle">
            {$_('stateIac.dashboard.lastChanges.providerOnly', {
              values: { count: changes.providerOnlyCount },
            })}
          </p>
        {/if}
      {:else if dashboard.updateChanges && Object.keys(dashboard.updateChanges).length > 0}
        <p class="mt-2 flex flex-wrap items-center gap-1">
          <span class="text-xs text-fg-subtle"
            >{$_('stateIac.dashboard.lastChanges.fromUpdate')}</span
          >
          {#each Object.entries(dashboard.updateChanges) as [key, count] (key)}
            <span class="k-badge h-5 px-1.5 text-[10px]"
              >{$_(`stateIac.changes.${key}`)} {count}</span
            >
          {/each}
        </p>
      {:else}
        <p class="mt-2 flex items-center gap-2 text-sm text-fg-muted">
          <CircleAlert class="h-4 w-4" />{$_('stateIac.diff.noSources')}
        </p>
      {/if}
    </section>
  {/if}
</div>
