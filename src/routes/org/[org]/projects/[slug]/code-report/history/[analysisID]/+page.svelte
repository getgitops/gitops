<script lang="ts">
  import { page } from '$app/stores';
  import { ArrowLeft } from '@lucide/svelte';
  import CodeReportVisualization from '$lib/components/CodeReportVisualization.svelte';
  import CodeReportToolBadge from '$lib/components/code-report/CodeReportToolBadge.svelte';
  import { _ } from '$lib/i18n';

  export let data: {
    service: { id: string; name: string; slug: string; tags?: string[] };
    analysis: any;
    analysisHistory: any[];
    riskWeights: { critical: number; high: number; medium: number; low: number };
    project?: { slug?: string; organization?: { slug?: string | null } | null };
  };
  $: orgSlug = data.project?.organization?.slug ?? $page?.params?.org ?? '';
  $: projectSlug = data.project?.slug ?? $page?.params?.slug ?? '';
  $: historyHref = `/org/${orgSlug}/projects/${projectSlug}/code-report/history`;
</script>

<svelte:head><title>{data.service.name} - {$_('codeReport.history.title')}</title></svelte:head>
<div class="space-y-6">
  <a href={historyHref} class="inline-flex items-center gap-1.5 text-sm text-slate-600"
    ><ArrowLeft class="h-3.5 w-3.5" />{$_('codeReport.history.backToHistory')}</a
  >
  <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">{$_('codeReport.history.reportViewed')}</p>
    <h1 class="mt-2 text-2xl font-bold text-slate-950">{data.service.name}</h1>
    <div class="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
      <span class="font-mono">{data.analysis.id}</span><CodeReportToolBadge
        tool={data.analysis.tool}
      /><span>{new Date(data.analysis.createdAt).toLocaleString()}</span
      ><span>{data.analysis.status}</span>
    </div>
  </section>
  <CodeReportVisualization
    service={data.service}
    analysis={data.analysis}
    analysisHistory={data.analysisHistory}
    riskWeights={data.riskWeights}
    securityPoliciesHref={`/org/${orgSlug}/projects/${projectSlug}/code-report/security-policy`}
  />
</div>
