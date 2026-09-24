<script lang="ts">
  import { GitBranch, Info } from '@lucide/svelte';
  import type { AnalysisSummary } from '$lib/code-report/analysis-summary';
  import CodeReportToolBadge from './CodeReportToolBadge.svelte';
  type Analysis = {
    tool: string;
    createdAt: string;
    gitInfo?: {
      repositoryUrl?: string | null;
      branch?: string | null;
      commit?: string | null;
      commitMessage?: string | null;
      author?: string | null;
      committer?: string | null;
      scannedAt?: string | null;
      artifactName?: string | null;
      artifactType?: string | null;
    } | null;
  } | null;
  type ServiceData = {
    name: string;
    slug: string;
    description?: string | null;
    tags?: string[];
  } | null;

  export let analysis: Analysis;
  export let analysisHistoryLength = 0;
  export let toolRuns: {
    tool: string;
    status: string | null;
    createdAt: string | null;
  }[] = [];
  export let service: ServiceData = null;
  export let summary: AnalysisSummary | null = null;
  export let fileCount = 0;
  export let historyPoints: { date: string; summary: AnalysisSummary }[] = [];
  export let riskScore = 0;
  export let riskLevel: { label: string; className: string };
  export let severityKeys: readonly (keyof AnalysisSummary['vulnerabilities'])[] = [];
  export let setupChart: (canvas: HTMLCanvasElement) => { destroy: () => void };
  export let onShowRiskInfo: () => void;
  function providerIcon() {
    return GitBranch;
  }
  const runStatusStyles: Record<string, string> = {
    completed: 'bg-emerald-50 text-emerald-700',
    in_progress: 'bg-amber-50 text-amber-700',
    failed: 'bg-red-50 text-red-700',
  };
  const runStatusLabels: Record<string, string> = {
    completed: 'OK',
    in_progress: 'En curso',
    failed: 'Fallido',
  };
  $: gitInfo = analysis?.gitInfo ?? null;
  $: shortCommit = gitInfo?.commit ? gitInfo.commit.slice(0, 12) : null;
  $: authorName = gitInfo?.author ? gitInfo.author.replace(/\s*<[^>]+>\s*$/, '').trim() : null;
  $: commitHref = gitInfo?.repositoryUrl && gitInfo?.commit
    ? `${gitInfo.repositoryUrl.replace(/\.git$/, '').replace(/\/$/, '')}/commit/${gitInfo.commit}`
    : null;
</script>

<section
  class={`rounded-[28px] border p-6 shadow-sm sm:p-8 ${riskLevel.className === 'critical' ? 'border-red-200 bg-red-50' : riskLevel.className === 'high' ? 'border-orange-200 bg-orange-50' : riskLevel.className === 'medium' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}
>
  <div class="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
    <div>
      <p class="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
        Estado de seguridad
      </p>
      <h2 class="mt-2 text-2xl font-bold text-slate-950">{riskLevel.label}</h2>
      <p class="mt-1 text-sm text-slate-600">
        Puntuación calculada según la severidad de las vulnerabilidades detectadas.
      </p>
    </div>
    <div class="rounded-2xl bg-white/80 px-5 py-4 text-center shadow-sm">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Riesgo</p>
      <p class="mt-1 text-4xl font-black text-slate-950">{riskScore}</p>
      <p class="text-xs text-slate-500">puntos ponderados</p>
    </div>
  </div>
  <button
    type="button"
    on:click={onShowRiskInfo}
    class="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 underline"
    ><Info class="h-4 w-4" />¿Cómo se calcula este riesgo?</button
  >
</section>
<div class="grid gap-4 lg:grid-cols-3">
  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
      Información del servicio
    </p>
    {#if service}<h3 class="mt-2 text-lg font-semibold text-slate-900">{service.name}</h3>
      <p class="mt-1 font-mono text-xs text-slate-500">{service.slug}</p>
      {#if service.description}<p class="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
          {service.description}
        </p>{/if}{#if service.tags?.length}<div class="mt-3 flex flex-wrap gap-1.5">
          {#each service.tags as tag}<span
              class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
              >{tag}</span
            >{/each}
        </div>{/if}{:else}<p class="mt-3 text-sm text-slate-500">Información no disponible.</p>{/if}
  </section>
  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Información del repositorio
        </p>
        <h3 class="mt-2 text-base font-semibold text-slate-900">
          {gitInfo?.repositoryUrl ? 'Repositorio conectado' : 'Sin repositorio conectado'}
        </h3>
      </div>
      {#if gitInfo?.repositoryUrl}{@const ProviderIcon = providerIcon()}<svelte:component
          this={ProviderIcon} class="h-5 w-5 text-slate-500"
        />{/if}
    </div>
    {#if gitInfo?.repositoryUrl}<a
        href={gitInfo.repositoryUrl}
        target="_blank"
        rel="noreferrer noopener"
        class="mt-3 block break-all text-sm font-medium text-blue-700 hover:text-blue-900"
        >{gitInfo.repositoryUrl}</a
      >{:else}<p class="mt-3 text-sm text-slate-500">
        Este análisis no incluye un repositorio configurado.
      </p>{/if}
    {#if gitInfo}
      <dl class="mt-4 space-y-2 text-xs">
        {#if shortCommit}<div class="flex gap-2">
            <dt class="w-20 shrink-0 text-slate-500">Commit</dt>
            <dd class="min-w-0 break-all font-mono font-semibold text-slate-700" title={gitInfo.commit ?? ''}>
              {#if commitHref}<a
                  href={commitHref}
                  target="_blank"
                  rel="noreferrer noopener"
                  class="text-blue-700 hover:text-blue-900"
                >{shortCommit}</a>{:else}{shortCommit}{/if}
            </dd>
          </div>{/if}
        {#if authorName}<div class="flex gap-2">
            <dt class="w-20 shrink-0 text-slate-500">Autor</dt>
            <dd class="min-w-0 break-all text-slate-700">{authorName}</dd>
          </div>{/if}
      </dl>
    {/if}
  </section>
  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
      Histórico de ejecuciones
    </p>
    <h3 class="mt-2 text-lg font-semibold text-slate-900">
      {analysisHistoryLength} análisis completado{analysisHistoryLength === 1 ? '' : 's'}
    </h3>
    {#if toolRuns.length > 0}<ul class="mt-3 divide-y divide-slate-100">
        {#each toolRuns as run (run.tool)}<li class="flex items-center justify-between gap-3 py-2">
            <div class="min-w-0">
              <CodeReportToolBadge tool={run.tool} size="sm" />
              <p class="mt-1 truncate text-xs text-slate-500">
                {run.createdAt ? new Date(run.createdAt).toLocaleString() : 'Nunca ejecutado'}
              </p>
            </div>
            <span
              class={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${run.status ? (runStatusStyles[run.status] ?? 'bg-slate-100 text-slate-600') : 'bg-slate-100 text-slate-500'}`}
              >{run.status ? (runStatusLabels[run.status] ?? run.status) : 'Sin datos'}</span
            >
          </li>{/each}
      </ul>{:else if analysis}<p class="mt-3 text-xs text-slate-500">
        Último: <span class="font-semibold text-slate-700">{analysis.tool}</span><span class="mx-1"
          >·</span
        >{new Date(analysis.createdAt).toLocaleString()}
      </p>{/if}
  </section>
</div>
<div class="grid gap-4 lg:grid-cols-2">
  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h3 class="font-semibold text-slate-900">Evolución del riesgo</h3>
    <div class="relative mt-4 h-72">
      {#if historyPoints.length > 0}<canvas use:setupChart aria-label="Evolución del riesgo"
        ></canvas>{:else}<div
          class="flex h-full items-center justify-center text-sm text-slate-500"
        >
          Todavía no hay historial suficiente.
        </div>{/if}
    </div>
  </section>
  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h3 class="font-semibold text-slate-900">Indicadores clave</h3>
    <div class="mt-4 grid grid-cols-2 gap-3">
      {#each severityKeys as severity}<div
          class="rounded-xl border border-slate-200 bg-slate-50 p-3"
        >
          <p class="text-2xl font-bold text-slate-900">{summary?.vulnerabilities[severity]}</p>
          <p class="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {severity}
          </p>
        </div>{/each}
    </div>
    <dl class="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
      <div>
        <dt class="text-xs text-slate-500">Dependencias</dt>
        <dd class="mt-1 text-xl font-bold text-slate-900">{summary?.dependencies}</dd>
      </div>
      <div>
        <dt class="text-xs text-slate-500">Archivos afectados</dt>
        <dd class="mt-1 text-xl font-bold text-slate-900">{fileCount}</dd>
      </div>
    </dl>
  </section>
</div>
