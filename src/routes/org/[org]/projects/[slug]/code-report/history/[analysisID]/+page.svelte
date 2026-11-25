<script lang="ts">
  import { createPageStore } from '#lib/page-store';
  import { ArrowLeft, Clock, FileSearch } from '@lucide/svelte';
  import CodeReportVisualization from '#lib/components/CodeReportVisualization.svelte';
  import CodeReportToolBadge from '#lib/components/code-report/CodeReportToolBadge.svelte';
  import { _, locale } from '#lib/i18n';

  let {
    data,
  }: {
    data: {
      service: { id: string; name: string; slug: string; tags?: string[] };
      analysis: any;
      analysisHistory: any[];
      riskWeights: { critical: number; high: number; medium: number; low: number };
      project?: { slug?: string; organization?: { slug?: string | null } | null };
    };
  } = $props();

  const page = createPageStore();
  const orgSlug = $derived(data.project?.organization?.slug ?? $page.params.org ?? '');
  const projectSlug = $derived(data.project?.slug ?? $page.params.slug ?? '');
  const codeReportBase = $derived(`/org/${orgSlug}/projects/${projectSlug}/code-report`);

  const statusBadge: Record<string, { className: string; dot: string; key: string }> = {
    completed: { className: 'k-badge-ok', dot: 'bg-ok', key: 'completed' },
    in_progress: { className: 'k-badge-info', dot: 'bg-info', key: 'inProgress' },
    failed: { className: 'k-badge-danger', dot: 'bg-danger', key: 'failed' },
  };
  const status = $derived(statusBadge[data.analysis.status]);

  const createdAt = $derived(
    new Intl.DateTimeFormat($locale ?? 'es', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(data.analysis.createdAt),
    ),
  );
</script>

<svelte:head><title>{data.service.name} - {$_('codeReport.history.title')}</title></svelte:head>

<div class="space-y-6">
  <a
    href={`${codeReportBase}/history`}
    class="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-white"
  >
    <ArrowLeft class="h-3.5 w-3.5" />{$_('codeReport.history.backToHistory')}
  </a>

  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="flex min-w-0 items-start gap-4">
      <span
        class="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-400"
        ><FileSearch class="h-6 w-6" /></span
      >
      <div class="min-w-0">
        <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-400">
          {$_('codeReport.history.reportViewed')}
        </p>
        <h1 class="mt-1 truncate text-2xl font-semibold tracking-tight text-white">
          <a href={`${codeReportBase}/services/${data.service.slug}`} class="hover:text-brand-300"
            >{data.service.name}</a
          >
        </h1>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
          <CodeReportToolBadge tool={data.analysis.tool} size="sm" />
          {#if status}
            <span class="k-badge {status.className}"
              ><span class="h-1.5 w-1.5 rounded-full {status.dot}"></span>{$_(
                `codeReport.history.${status.key}`,
              )}</span
            >
          {:else}
            <span class="k-badge">{data.analysis.status}</span>
          {/if}
          <span class="inline-flex items-center gap-1"
            ><Clock class="h-3.5 w-3.5" />{createdAt}</span
          >
          <span class="k-badge font-mono">{data.analysis.id}</span>
        </div>
      </div>
    </div>
  </header>

  <CodeReportVisualization
    service={data.service}
    analysis={data.analysis}
    analysisHistory={data.analysisHistory}
    riskWeights={data.riskWeights}
    securityPoliciesHref={`${codeReportBase}/security-policy`}
    mode="analysis"
  />
</div>
