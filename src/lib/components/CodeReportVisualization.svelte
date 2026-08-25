<script lang="ts">
  import { onDestroy } from 'svelte';
  import { X } from 'lucide-svelte';
  import {
    extractSbomComponents,
    extractSecrets,
    extractVulnerabilities,
    summarizeAnalysisResult,
    type VulnerabilityFinding,
  } from '$lib/code-report/analysis-summary';
  import type { PolicyComplianceReport } from '$lib/code-report/policy-evaluation';
  import { mergeComplianceReports } from '$lib/code-report/policy-evaluation';
  import CodeReportFiles from './code-report/CodeReportFiles.svelte';
  import CodeReportSbom from './code-report/CodeReportSbom.svelte';
  import CodeReportSecrets from './code-report/CodeReportSecrets.svelte';
  import CodeReportSummary from './code-report/CodeReportSummary.svelte';
  import CodeReportVulnerabilities from './code-report/CodeReportVulnerabilities.svelte';
  import SecurityPolicyComplianceCard from './code-report/SecurityPolicyComplianceCard.svelte';

  type AnalysisData = {
    id: string;
    tool: string;
    status: 'in_progress' | 'completed' | 'failed';
    result: unknown;
    summary?: unknown;
    securityPolicies?: PolicyComplianceReport | null;
    error?: string | null;
    gitInfo?: {
      repositoryUrl?: string | null;
      branch?: string | null;
      commit?: string | null;
    } | null;
    createdAt: string;
    updatedAt: string;
  };
  type Analysis = AnalysisData | null;
  type ServiceData = {
    id?: string;
    name: string;
    slug: string;
    description?: string | null;
    tags?: string[];
  } | null;
  export let analysis: Analysis;
  export let analysisHistory: AnalysisData[] = [];
  export let latestByTool: Record<string, AnalysisData> = {};
  export let service: ServiceData = null;
  export let securityPoliciesHref: string | null = null;
  let activeTab = 'summary';
  let activeVulnerabilityTab = 'cve';
  let riskInfoModalOpen = false;
  let fileQuery = '';
  let vulnerabilityQuery = '';
  let secretQuery = '';
  let sbomQuery = '';
  let sbomTypeFilter = 'all';
  let severityFilter = 'all';
  let selectedFilePath = '';
  let chart: { destroy: () => void } | null = null;
  export let riskWeights = { critical: 10, high: 6, medium: 3, low: 1 };

  const severityStyles: Record<string, string> = {
    critical: 'bg-red-50 text-red-700 border-red-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-slate-50 text-slate-600 border-slate-200',
    unknown: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const severityKeys = ['critical', 'high', 'medium', 'low', 'unknown'] as const;
  const fileSeverityOrder = ['critical', 'high', 'medium', 'low'] as const;
  const knownTools = ['trivy', 'sbom', 'gitleaks'];
  // manual uploads are stored under other tool names, so fall back to the latest analysis
  $: trivyAnalysis = latestByTool.trivy ?? analysis;
  $: gitleaksAnalysis = latestByTool.gitleaks ?? null;
  $: sbomAnalysis = latestByTool.sbom ?? null;
  $: summary = trivyAnalysis ? summarizeAnalysisResult(trivyAnalysis.result) : null;
  $: vulnerabilities = trivyAnalysis ? extractVulnerabilities(trivyAnalysis.result) : [];
  $: secrets = gitleaksAnalysis ? extractSecrets(gitleaksAnalysis.result) : [];
  $: sbomComponents = sbomAnalysis ? extractSbomComponents(sbomAnalysis.result) : [];
  $: complianceReport = mergeComplianceReports([
    trivyAnalysis?.securityPolicies,
    gitleaksAnalysis?.securityPolicies,
    sbomAnalysis?.securityPolicies,
    analysis?.securityPolicies,
  ]);
  $: fileGroups = groupByFile(vulnerabilities);
  $: selectedFile = fileGroups.find((file) => file.path === selectedFilePath) ?? null;
  $: historyPoints = analysisHistory
    .filter((item) => item.status === 'completed' && item.tool !== 'gitleaks' && item.tool !== 'sbom')
    .slice()
    .reverse()
    .map((item) => ({
      date: new Date(item.createdAt).toLocaleDateString(),
      summary: summarizeAnalysisResult(item.result),
    }));
  $: riskScore = summary ? calculateRiskScore(summary) : 0;
  $: riskLevel =
    !summary || riskScore === 0
      ? { label: 'Sin riesgo', className: 'safe' }
      : summary.vulnerabilities.critical > 0 || riskScore >= 40
        ? { label: 'Riesgo crítico', className: 'critical' }
        : riskScore >= 20
          ? { label: 'Riesgo alto', className: 'high' }
          : riskScore >= 8
            ? { label: 'Riesgo medio', className: 'medium' }
            : { label: 'Riesgo bajo', className: 'low' };
  $: filteredVulnerabilities = vulnerabilities
    .filter((finding) => {
      const query = vulnerabilityQuery.trim().toLowerCase();
      return (
        (!query ||
          [finding.id, finding.packageName, finding.target, finding.title].some((value) =>
            value.toLowerCase().includes(query),
          )) &&
        (severityFilter === 'all' || finding.severity === severityFilter)
      );
    })
    .sort(
      (left, right) => (severityRank[right.severity] ?? 0) - (severityRank[left.severity] ?? 0),
    );
  $: filteredFileGroups = fileGroups.filter((file) =>
    getFileName(file.path).toLowerCase().includes(fileQuery.trim().toLowerCase()),
  );
  $: tabs = [
    { id: 'summary', label: 'Resumen' },
    { id: 'vulnerabilities', label: 'Vulnerabilidades', count: vulnerabilities.length },
    { id: 'sbom', label: 'Inventario', count: sbomComponents.length },
    { id: 'secrets', label: 'Secretos Expuestos', count: secrets.length },
  ] as { id: string; label: string; count?: number }[];
  $: vulnerabilitySubTabs = [
    { id: 'cve', label: 'CVE', count: vulnerabilities.length },
    { id: 'files', label: 'Archivos', count: fileGroups.length },
  ];
  $: toolRuns = knownTools.map((tool) => ({
    tool,
    status: latestByTool[tool]?.status ?? null,
    createdAt: latestByTool[tool]?.createdAt ?? null,
  }));
  function calculateRiskScore(value: ReturnType<typeof summarizeAnalysisResult>) {
    return (
      value.vulnerabilities.critical * riskWeights.critical +
      value.vulnerabilities.high * riskWeights.high +
      value.vulnerabilities.medium * riskWeights.medium +
      value.vulnerabilities.low * riskWeights.low
    );
  }
  function setupChart(canvas: HTMLCanvasElement) {
    let disposed = false;
    import('chart.js').then(({ Chart, registerables }) => {
      if (disposed || historyPoints.length === 0) return;
      Chart.register(...registerables);
      chart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: historyPoints.map((point) => point.date),
          datasets: [
            {
              label: 'Riesgo ponderado',
              data: historyPoints.map((point) => calculateRiskScore(point.summary)),
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              fill: true,
              tension: 0.35,
            },
            {
              label: 'Vulnerabilidades',
              data: historyPoints.map((point) => point.summary.totalVulnerabilities),
              borderColor: '#2457ff',
              fill: false,
              tension: 0.35,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'bottom' } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        },
      });
    });
    return {
      destroy: () => {
        disposed = true;
        chart?.destroy();
        chart = null;
      },
    };
  }
  onDestroy(() => chart?.destroy());
  function groupByFile(findings: VulnerabilityFinding[]) {
    const groups = new Map<string, VulnerabilityFinding[]>();
    for (const finding of findings)
      groups.set(finding.packagePath, [...(groups.get(finding.packagePath) ?? []), finding]);
    return [...groups.entries()]
      .map(([path, groupedFindings]) => ({ path, vulnerabilities: groupedFindings }))
      .sort((a, b) => b.vulnerabilities.length - a.vulnerabilities.length);
  }
  function getFileName(path: string) {
    return path.split(/[\\/]/).pop() || path;
  }
  function countSeverity(findings: VulnerabilityFinding[], severity: string) {
    return findings.filter((finding) => finding.severity === severity).length;
  }
  function severityLabel(severity: string) {
    return severity.charAt(0).toUpperCase() + severity.slice(1);
  }
  function findingStatus(finding: VulnerabilityFinding) {
    return finding.status === 'fixed' || finding.fixedVersion
      ? 'Actualizar'
      : finding.status === 'will_not_fix'
        ? 'Excepción'
        : finding.status === 'unknown'
          ? 'Revisar'
          : 'Afectada';
  }
</script>

<div class="space-y-6">
  {#if analysis && complianceReport}
    <SecurityPolicyComplianceCard
      report={complianceReport}
      policiesHref={securityPoliciesHref}
    />
  {/if}
  <div class="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Vista del reporte">
    {#each tabs as tab}<button
        type="button"
        role="tab"
        aria-selected={activeTab === tab.id}
        on:click={() => (activeTab = tab.id)}
        class={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold ${activeTab === tab.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
        >{tab.label}{#if tab.count !== undefined}<span
            class="ml-1 text-xs font-normal text-slate-400">{tab.count}</span
          >{/if}</button
      >{/each}
  </div>
  {#if !analysis}<div
      class="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600"
    >
      Todavía no se ha ejecutado ningún análisis.
    </div>{:else if activeTab === 'summary'}<CodeReportSummary
      analysis={trivyAnalysis}
      analysisHistoryLength={analysisHistory.length}
      {toolRuns}
      {service}
      {summary}
      fileCount={fileGroups.length}
      {historyPoints}
      {riskScore}
      {riskLevel}
      {severityKeys}
      {setupChart}
      onShowRiskInfo={() => (riskInfoModalOpen = true)}
    />{:else if activeTab === 'vulnerabilities'}<div class="space-y-4">
      <div
        class="flex gap-1 overflow-x-auto rounded-full bg-slate-100 p-1"
        role="tablist"
        aria-label="Vista de vulnerabilidades"
      >
        {#each vulnerabilitySubTabs as subTab}<button
            type="button"
            role="tab"
            aria-selected={activeVulnerabilityTab === subTab.id}
            on:click={() => (activeVulnerabilityTab = subTab.id)}
            class={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${activeVulnerabilityTab === subTab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >{subTab.label}<span class="ml-1 text-xs font-normal text-slate-400">{subTab.count}</span
            ></button
          >{/each}
      </div>
      {#if activeVulnerabilityTab === 'cve'}<CodeReportVulnerabilities
          analysis={trivyAnalysis}
          {vulnerabilities}
          {filteredVulnerabilities}
          {severityStyles}
          bind:vulnerabilityQuery
          bind:severityFilter
          {findingStatus}
        />{:else}<CodeReportFiles
          {fileGroups}
          {filteredFileGroups}
          {selectedFile}
          bind:selectedFilePath
          bind:fileQuery
          {severityStyles}
          {fileSeverityOrder}
          {getFileName}
          {countSeverity}
          {severityLabel}
        />{/if}
    </div>{:else if activeTab === 'secrets'}<CodeReportSecrets
      analysis={gitleaksAnalysis}
      {secrets}
      {severityStyles}
      bind:secretQuery
    />{:else}<CodeReportSbom
      analysis={sbomAnalysis}
      components={sbomComponents}
      bind:sbomQuery
      bind:sbomTypeFilter
    />{/if}
</div>

{#if riskInfoModalOpen}<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
    role="presentation"
    on:click={(event) => event.currentTarget === event.target && (riskInfoModalOpen = false)}
  >
    <section
      class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="risk-info-title"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Método de evaluación
          </p>
          <h2 id="risk-info-title" class="mt-1 text-xl font-bold text-slate-900">
            ¿Cómo se calcula este riesgo?
          </h2>
        </div>
        <button
          type="button"
          on:click={() => (riskInfoModalOpen = false)}
          aria-label="Cerrar información del riesgo"
          class="text-slate-400 hover:text-slate-700"><X class="h-5 w-5" /></button
        >
      </div>
      <p class="mt-4 text-sm leading-6 text-slate-600">
        La puntuación suma el peso de cada vulnerabilidad encontrada en el último análisis. Cuanto
        mayor sea el resultado, mayor es la prioridad de remediación.
      </p>
      <div class="mt-5 grid grid-cols-2 gap-2">
        {#each [{ name: 'Critical', weight: riskWeights.critical, count: summary?.vulnerabilities.critical ?? 0, style: 'border-red-200 bg-red-50 text-red-700' }, { name: 'High', weight: riskWeights.high, count: summary?.vulnerabilities.high ?? 0, style: 'border-orange-200 bg-orange-50 text-orange-700' }, { name: 'Medium', weight: riskWeights.medium, count: summary?.vulnerabilities.medium ?? 0, style: 'border-amber-200 bg-amber-50 text-amber-700' }, { name: 'Low', weight: riskWeights.low, count: summary?.vulnerabilities.low ?? 0, style: 'border-slate-200 bg-slate-50 text-slate-700' }] as item}<div
            class={`rounded-xl border p-3 ${item.style}`}
          >
            <p class="text-sm font-bold">{item.name} × {item.weight}</p>
            <p class="mt-1 text-xs">{item.count} detectadas</p>
          </div>{/each}
      </div>
      <div class="mt-5 border-t border-slate-100 pt-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Fórmula aplicada</p>
        <p class="mt-2 rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100">
          (Critical × {riskWeights.critical}) + (High × {riskWeights.high}) + (Medium × {riskWeights.medium}) + (Low × {riskWeights.low}) = {riskScore} puntos
        </p>
        <p class="mt-3 text-xs leading-5 text-slate-500">
          Riesgo bajo: 1-7 · medio: 8-19 · alto: 20-39 · crítico: 40+ o cualquier Critical.
        </p>
      </div>
    </section>
  </div>{/if}
