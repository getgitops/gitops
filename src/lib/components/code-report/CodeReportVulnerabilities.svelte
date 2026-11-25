<script lang="ts">
  import { ChevronRight, CircleAlert, CircleCheck, ExternalLink, Search, X } from '@lucide/svelte';
  import type { VulnerabilityFinding } from '#lib/code-report/analysis-summary';
  import {
    SEVERITY_LABEL,
    SEVERITY_ORDER,
    SEVERITY_RANK,
    severityBadge,
  } from '#lib/code-report/severity-ui';
  import { Tabs } from '#lib/components/ui';
  import CodeReportFiles from './CodeReportFiles.svelte';

  let {
    analysis,
    vulnerabilities,
    severity = $bindable('all'),
  }: {
    analysis: { status: string; error?: string | null } | null;
    vulnerabilities: VulnerabilityFinding[];
    severity?: string;
  } = $props();

  let view = $state<'cve' | 'files'>('cve');
  let query = $state('');
  let onlyFixable = $state(false);

  const counts = $derived(
    Object.fromEntries(
      SEVERITY_ORDER.map((key) => [key, vulnerabilities.filter((f) => f.severity === key).length]),
    ) as Record<string, number>,
  );

  const severityItems = $derived([
    // el control segmentado no pinta `count`: la cifra va en la etiqueta
    { value: 'all', label: `Todas ${vulnerabilities.length}` },
    ...SEVERITY_ORDER.filter((key) => key !== 'unknown' || counts.unknown > 0).map((key) => ({
      value: key,
      label: `${SEVERITY_LABEL[key]} ${counts[key]}`,
      disabled: counts[key] === 0,
    })),
  ]);

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return vulnerabilities
      .filter(
        (finding) =>
          (severity === 'all' || finding.severity === severity) &&
          (!onlyFixable || Boolean(finding.fixedVersion)) &&
          (!q ||
            [finding.id, finding.packageName, finding.packagePath, finding.title].some((value) =>
              value.toLowerCase().includes(q),
            )),
      )
      .sort(
        (left, right) =>
          (SEVERITY_RANK[right.severity] ?? 0) - (SEVERITY_RANK[left.severity] ?? 0) ||
          (right.cvssScore ?? 0) - (left.cvssScore ?? 0),
      );
  });

  const fixableCount = $derived(vulnerabilities.filter((finding) => finding.fixedVersion).length);

  function lines(finding: VulnerabilityFinding) {
    if (finding.lineStart === null) return null;
    return finding.lineEnd !== null && finding.lineEnd !== finding.lineStart
      ? `${finding.lineStart}-${finding.lineEnd}`
      : String(finding.lineStart);
  }

  function statusLabel(finding: VulnerabilityFinding) {
    if (finding.fixedVersion || finding.status === 'fixed') return 'Actualizar';
    if (finding.status === 'will_not_fix') return 'Sin parche previsto';
    if (finding.status === 'unknown') return 'Revisar';
    return 'Afectada';
  }
</script>

{#if !analysis}
  <div class="k-card px-6 py-12 text-center text-sm text-fg-muted">
    Este servicio todavía no tiene un análisis de vulnerabilidades (Trivy).
  </div>
{:else if analysis.status === 'failed'}
  <div class="k-card flex items-start gap-3 border-red-500/30 px-5 py-4 text-sm text-red-200">
    <CircleAlert class="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
    {analysis.error || 'El análisis de vulnerabilidades falló.'}
  </div>
{:else if analysis.status === 'in_progress'}
  <div class="k-card px-6 py-12 text-center text-sm text-fg-muted">
    El análisis de vulnerabilidades está en curso.
  </div>
{:else if vulnerabilities.length === 0}
  <div class="k-card flex flex-col items-center gap-3 px-6 py-12 text-center">
    <span class="grid h-12 w-12 place-items-center rounded-full bg-ok/10 text-ok"
      ><CircleCheck class="h-6 w-6" /></span
    >
    <p class="text-sm font-medium text-white">Sin vulnerabilidades</p>
    <p class="text-sm text-fg-muted">Este análisis no ha detectado ninguna vulnerabilidad.</p>
  </div>
{:else}
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <div class="max-w-full overflow-x-auto">
        <Tabs
          variant="segmented"
          size="sm"
          label="Severidad"
          items={severityItems}
          bind:value={severity}
        />
      </div>
      <div class="ml-auto">
        <Tabs
          variant="segmented"
          size="sm"
          label="Agrupar por"
          items={[
            { value: 'cve', label: 'Por CVE' },
            { value: 'files', label: 'Por archivo' },
          ]}
          bind:value={view}
        />
      </div>
    </div>

    {#if view === 'files'}
      <CodeReportFiles findings={filtered} />
    {:else}
      <div class="k-card overflow-hidden">
        <div class="flex flex-wrap items-center gap-3 border-b border-white/8 p-4">
          <label class="relative w-full sm:w-80">
            <Search
              class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
            />
            <input
              type="search"
              class="k-input h-9 pl-9"
              placeholder="Buscar CVE, paquete o archivo…"
              aria-label="Buscar vulnerabilidades"
              bind:value={query}
            />
          </label>
          <label class="inline-flex items-center gap-2 text-sm text-fg-muted">
            <input type="checkbox" class="k-checkbox" bind:checked={onlyFixable} />
            Solo con parche ({fixableCount})
          </label>
          {#if query || onlyFixable || severity !== 'all'}
            <button
              type="button"
              class="k-btn k-btn-ghost k-btn-sm"
              onclick={() => {
                query = '';
                onlyFixable = false;
                severity = 'all';
              }}><X class="h-3.5 w-3.5" />Limpiar</button
            >
          {/if}
          <span class="ml-auto text-xs tabular-nums text-fg-subtle">
            {filtered.length} de {vulnerabilities.length}
          </span>
        </div>

        {#if filtered.length === 0}
          <p class="px-5 py-10 text-center text-sm text-fg-subtle">
            Ninguna vulnerabilidad coincide con los filtros.
          </p>
        {:else}
          <ul class="divide-y divide-white/6">
            {#each filtered as finding, index (finding.id + finding.target + finding.packageName + index)}
              <li>
                <details class="group">
                  <summary
                    class="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 transition-colors hover:bg-white/2.5 [&::-webkit-details-marker]:hidden"
                  >
                    <ChevronRight
                      class="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-90"
                    />
                    <span
                      class="k-badge {severityBadge(
                        finding.severity,
                      )} w-20 justify-center font-semibold">{SEVERITY_LABEL[finding.severity]}</span
                    >
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm text-white">
                        <span class="font-mono text-[13px] font-medium">{finding.id}</span>
                        <span class="ml-1 text-fg-muted">{finding.packageName}</span>
                      </p>
                      <p class="truncate text-xs text-fg-subtle" title={finding.title}>
                        {finding.title || finding.packagePath}
                      </p>
                    </div>
                    <span class="hidden font-mono text-xs sm:inline">
                      <span class="text-red-300">{finding.installedVersion}</span>
                      {#if finding.fixedVersion}
                        <span class="text-fg-subtle">→</span>
                        <span class="text-ok">{finding.fixedVersion}</span>
                      {/if}
                    </span>
                    <span class="w-16 text-right text-xs tabular-nums text-fg-subtle">
                      {finding.cvssScore !== null ? `CVSS ${finding.cvssScore.toFixed(1)}` : '—'}
                    </span>
                  </summary>

                  <div class="space-y-4 border-t border-white/6 bg-ink-950/40 px-5 py-4 pl-12">
                    {#if finding.description}
                      <p class="max-w-3xl text-sm leading-6 text-fg-muted">{finding.description}</p>
                    {/if}

                    <dl class="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt class="text-fg-subtle">Paquete</dt>
                        <dd class="mt-0.5 font-medium text-white">{finding.packageName}</dd>
                      </div>
                      <div>
                        <dt class="text-fg-subtle">Versión instalada</dt>
                        <dd class="mt-0.5 font-mono text-red-300">{finding.installedVersion}</dd>
                      </div>
                      <div>
                        <dt class="text-fg-subtle">Versión corregida</dt>
                        <dd
                          class="mt-0.5 font-mono {finding.fixedVersion
                            ? 'text-ok'
                            : 'text-fg-subtle'}"
                        >
                          {finding.fixedVersion || 'No indicada'}
                        </dd>
                      </div>
                      <div>
                        <dt class="text-fg-subtle">Acción</dt>
                        <dd class="mt-0.5 text-white">{statusLabel(finding)}</dd>
                      </div>
                      <div class="sm:col-span-2">
                        <dt class="text-fg-subtle">Ubicación</dt>
                        <dd class="mt-0.5 break-all font-mono text-fg">
                          {finding.packagePath}{#if lines(finding)}<span class="text-fg-subtle"
                              >:{lines(finding)}</span
                            >{/if}
                        </dd>
                      </div>
                      <div>
                        <dt class="text-fg-subtle">CWE</dt>
                        <dd class="mt-0.5 text-fg">
                          {finding.cweIds.length > 0 ? finding.cweIds.join(', ') : '—'}
                        </dd>
                      </div>
                      {#if finding.epssScore !== null}
                        <div>
                          <dt class="text-fg-subtle">EPSS</dt>
                          <dd class="mt-0.5 tabular-nums text-fg">
                            {(finding.epssScore * 100).toFixed(2)} %
                          </dd>
                        </div>
                      {/if}
                    </dl>

                    {#if finding.codeSnippet}
                      <pre
                        class="overflow-x-auto rounded-lg border border-white/8 bg-ink-950 p-3 font-mono text-xs leading-5 text-fg">{finding.codeSnippet}</pre>
                    {/if}

                    <div class="flex flex-wrap gap-2">
                      <a
                        href={finding.cveUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        class="k-btn k-btn-secondary k-btn-sm"
                        ><ExternalLink class="h-3.5 w-3.5" />{finding.id} en NVD</a
                      >
                      {#if finding.primaryUrl && finding.primaryUrl !== finding.cveUrl}
                        <a
                          href={finding.primaryUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          class="k-btn k-btn-ghost k-btn-sm"
                          ><ExternalLink class="h-3.5 w-3.5" />Advisory</a
                        >
                      {/if}
                    </div>
                  </div>
                </details>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
{/if}
