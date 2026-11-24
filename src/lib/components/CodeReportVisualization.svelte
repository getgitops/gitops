<!--
  Informe de Code Report de un servicio.
  - mode="latest" (detalle del servicio): combina el último análisis de cada herramienta.
  - mode="analysis" (historial): muestra solo el análisis recibido, sin mezclarlo con otros.
  Las pestañas van arriba; `aside` permite añadir tarjetas en la columna lateral del resumen.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import {
    extractSbomComponents,
    extractSecrets,
    extractVulnerabilities,
    summarizeAnalysisResult,
    type AnalysisSummary,
  } from '#lib/code-report/analysis-summary';
  import type { PolicyComplianceReport } from '#lib/code-report/policy-evaluation';
  import { mergeComplianceReports } from '#lib/code-report/policy-evaluation';
  import { riskLevel, SEVERITY_RANK } from '#lib/code-report/severity-ui';
  import { Tabs, tabId, tabPanelId } from '#lib/components/ui';
  import CodeReportSbom from './code-report/CodeReportSbom.svelte';
  import CodeReportSecrets from './code-report/CodeReportSecrets.svelte';
  import CodeReportSummary from './code-report/CodeReportSummary.svelte';
  import CodeReportVulnerabilities from './code-report/CodeReportVulnerabilities.svelte';

  type GitInfo = {
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

  type AnalysisData = {
    id: string;
    tool: string;
    status: 'in_progress' | 'completed' | 'failed';
    result: unknown;
    visualizationSummary?: AnalysisSummary;
    securityPolicies?: PolicyComplianceReport | null;
    error?: string | null;
    gitInfo?: GitInfo;
    createdAt: string;
    updatedAt?: string;
  };

  type Kind = 'vulnerabilities' | 'secrets' | 'sbom';
  type TabKey = 'summary' | Kind;

  let {
    analysis,
    analysisHistory = [],
    latestByTool = {},
    service = null,
    securityPoliciesHref = null,
    riskWeights = { critical: 10, high: 6, medium: 3, low: 1 },
    mode = 'latest',
    aside,
  }: {
    analysis: AnalysisData | null;
    analysisHistory?: AnalysisData[];
    latestByTool?: Record<string, AnalysisData | null | undefined>;
    service?: { id?: string; name: string; slug: string } | null;
    securityPoliciesHref?: string | null;
    riskWeights?: { critical: number; high: number; medium: number; low: number };
    mode?: 'latest' | 'analysis';
    aside?: Snippet;
  } = $props();

  function kindOf(tool: string | null | undefined): Kind {
    const name = (tool ?? '').toLowerCase();
    if (name === 'gitleaks') return 'secrets';
    if (name === 'syft' || name === 'sbom') return 'sbom';
    // trivy, y también subidas manuales o por API con formato Trivy
    return 'vulnerabilities';
  }

  // último análisis de cada tipo (modo latest) o solo el recibido (modo analysis)
  const byKind = $derived.by(() => {
    const picked: Partial<Record<Kind, AnalysisData>> = {};
    if (mode === 'analysis') {
      if (analysis) picked[kindOf(analysis.tool)] = analysis;
      return picked;
    }
    const candidates = [
      ...Object.values(latestByTool),
      ...analysisHistory.filter((item) => item.result !== null && item.result !== undefined),
      analysis,
    ].filter((item): item is AnalysisData => Boolean(item?.tool));
    for (const item of candidates) {
      const kind = kindOf(item.tool);
      const current = picked[kind];
      // Trivy manda sobre subidas manuales para las vulnerabilidades
      const preferTrivy =
        kind === 'vulnerabilities' &&
        current &&
        (current.tool === 'trivy') !== (item.tool === 'trivy');
      if (
        !current ||
        (preferTrivy
          ? item.tool === 'trivy'
          : new Date(item.createdAt).getTime() > new Date(current.createdAt).getTime())
      ) {
        picked[kind] = item;
      }
    }
    return picked;
  });

  const vulnAnalysis = $derived(byKind.vulnerabilities ?? null);
  const secretsAnalysis = $derived(byKind.secrets ?? null);
  const sbomAnalysis = $derived(byKind.sbom ?? null);

  const completed = (item: AnalysisData | null) => (item?.status === 'completed' ? item : null);

  const summary = $derived(
    completed(vulnAnalysis) ? summarizeAnalysisResult(vulnAnalysis!.result) : null,
  );
  const vulnerabilities = $derived(
    completed(vulnAnalysis) ? extractVulnerabilities(vulnAnalysis!.result) : [],
  );
  const secrets = $derived(
    completed(secretsAnalysis) ? extractSecrets(secretsAnalysis!.result) : [],
  );
  const components = $derived(
    completed(sbomAnalysis) ? extractSbomComponents(sbomAnalysis!.result) : [],
  );

  const riskScore = $derived(
    summary
      ? summary.vulnerabilities.critical * riskWeights.critical +
          summary.vulnerabilities.high * riskWeights.high +
          summary.vulnerabilities.medium * riskWeights.medium +
          summary.vulnerabilities.low * riskWeights.low
      : 0,
  );
  const level = $derived(riskLevel(riskScore, summary?.vulnerabilities.critical ?? 0));

  const complianceReport = $derived(
    mergeComplianceReports([
      vulnAnalysis?.securityPolicies,
      secretsAnalysis?.securityPolicies,
      sbomAnalysis?.securityPolicies,
    ]),
  );

  const priorities = $derived(
    vulnerabilities
      .filter((finding) => finding.severity === 'critical' || finding.severity === 'high')
      .sort(
        (left, right) =>
          (SEVERITY_RANK[right.severity] ?? 0) - (SEVERITY_RANK[left.severity] ?? 0) ||
          Number(Boolean(right.fixedVersion)) - Number(Boolean(left.fixedVersion)) ||
          (right.cvssScore ?? 0) - (left.cvssScore ?? 0),
      )
      .slice(0, 6),
  );

  const weightOf = (severity: string) =>
    severity in riskWeights ? riskWeights[severity as keyof typeof riskWeights] : 0;
  const fixable = $derived(vulnerabilities.filter((finding) => finding.fixedVersion).length);
  const riskWithoutFixable = $derived(
    vulnerabilities
      .filter((finding) => !finding.fixedVersion)
      .reduce((sum, finding) => sum + weightOf(finding.severity), 0),
  );

  const fileCount = $derived(new Set(vulnerabilities.map((finding) => finding.packagePath)).size);

  const trendPoints = $derived(
    analysisHistory
      .filter((item) => item.status === 'completed' && kindOf(item.tool) === 'vulnerabilities')
      .map((item) => {
        const itemSummary = item.visualizationSummary ?? summarizeAnalysisResult(item.result);
        const v = itemSummary.vulnerabilities;
        return {
          id: item.id,
          createdAt: item.createdAt,
          critical: v.critical,
          high: v.high,
          medium: v.medium,
          low: v.low,
          score:
            v.critical * riskWeights.critical +
            v.high * riskWeights.high +
            v.medium * riskWeights.medium +
            v.low * riskWeights.low,
        };
      })
      .sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      ),
  );

  const toolRuns = $derived(
    mode === 'analysis'
      ? []
      : [
          { tool: 'trivy', run: vulnAnalysis },
          { tool: 'sbom', run: sbomAnalysis },
          { tool: 'gitleaks', run: secretsAnalysis },
        ].map(({ tool, run }) => ({
          tool: run?.tool && run.tool !== 'syft' ? run.tool : tool,
          status: run?.status ?? null,
          createdAt: run?.createdAt ?? null,
          error: run?.error ?? null,
        })),
  );

  const primary = $derived(mode === 'analysis' ? analysis : (vulnAnalysis ?? analysis));
  const gitInfo = $derived(primary ? deriveGitInfo(primary) : null);

  function deriveGitInfo(item: AnalysisData): GitInfo {
    if (item.gitInfo?.repositoryUrl || !item.result || typeof item.result !== 'object')
      return item.gitInfo ?? null;
    const result = item.result as Record<string, unknown>;
    const metadata = (result.Metadata ?? {}) as Record<string, unknown>;
    if (!metadata.RepoURL) return item.gitInfo ?? null;
    const text = (value: unknown, fallback?: string | null) =>
      value ? String(value) : (fallback ?? null);
    return {
      ...item.gitInfo,
      repositoryUrl: String(metadata.RepoURL),
      branch: text(metadata.Branch, item.gitInfo?.branch),
      commit: text(metadata.Commit, item.gitInfo?.commit),
      commitMessage: text(metadata.CommitMsg, item.gitInfo?.commitMessage),
      author: text(metadata.Author, item.gitInfo?.author),
      artifactName: text(result.ArtifactName, item.gitInfo?.artifactName),
      artifactType: text(result.ArtifactType, item.gitInfo?.artifactType),
    };
  }

  // ---------- pestañas ----------

  let active = $state<TabKey>('summary');
  let severity = $state('all');

  const visibleKinds = $derived<Kind[]>(
    mode === 'analysis' && analysis
      ? [kindOf(analysis.tool)]
      : ['vulnerabilities', 'sbom', 'secrets'],
  );

  const tabs = $derived([
    { value: 'summary', label: 'Resumen' },
    ...visibleKinds.map((kind) => ({
      value: kind,
      label:
        kind === 'vulnerabilities'
          ? 'Vulnerabilidades'
          : kind === 'sbom'
            ? 'Inventario'
            : 'Secretos expuestos',
      count:
        kind === 'vulnerabilities'
          ? vulnerabilities.length
          : kind === 'sbom'
            ? components.length
            : secrets.length,
    })),
  ]);

  function openTab(tab: Kind, withSeverity?: string) {
    if (!visibleKinds.includes(tab)) return;
    severity = withSeverity ?? 'all';
    active = tab;
    document.getElementById('report-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
</script>

{#if !analysis}
  <div class="k-card flex flex-col items-center gap-3 px-6 py-14 text-center">
    <span class="grid h-12 w-12 place-items-center rounded-full bg-white/4 text-2xl">🦊</span>
    <p class="text-sm font-medium text-white">Todavía no se ha ejecutado ningún análisis</p>
    <p class="max-w-md text-sm text-fg-muted">
      Envía el resultado de Trivy, Syft o Gitleaks desde tu pipeline a la API de scan y aparecerá
      aquí.
    </p>
  </div>
  {#if aside}
    <div class="mt-4 max-w-xl">{@render aside()}</div>
  {/if}
{:else}
  <div class="space-y-5">
    <div id="report-tabs" class="scroll-mt-4 overflow-x-auto">
      <Tabs label="Secciones del informe" idPrefix="report" items={tabs} bind:value={active} />
    </div>

    <div
      id={tabPanelId('report', active)}
      role="tabpanel"
      aria-labelledby={tabId('report', active)}
    >
      {#if active === 'summary'}
        <CodeReportSummary
          {summary}
          {riskScore}
          {level}
          {riskWeights}
          {gitInfo}
          analyzedAt={primary?.createdAt ?? null}
          {toolRuns}
          {complianceReport}
          policiesHref={securityPoliciesHref}
          {trendPoints}
          selectedId={mode === 'analysis' ? analysis.id : null}
          {priorities}
          {fixable}
          {riskWithoutFixable}
          {fileCount}
          dependencyCount={completed(sbomAnalysis)
            ? components.length
            : (summary?.dependencies ?? null)}
          secretCount={completed(secretsAnalysis) ? secrets.length : null}
          onOpenTab={openTab}
          available={visibleKinds}
          {aside}
        />
      {:else if active === 'vulnerabilities'}
        <CodeReportVulnerabilities analysis={vulnAnalysis} {vulnerabilities} bind:severity />
      {:else if active === 'sbom'}
        <CodeReportSbom analysis={sbomAnalysis} {components} />
      {:else}
        <CodeReportSecrets analysis={secretsAnalysis} {secrets} />
      {/if}
    </div>
  </div>
{/if}
