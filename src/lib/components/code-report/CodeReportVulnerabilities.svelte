<script lang="ts">
  import { AlertCircle, Search } from '@lucide/svelte';
  import type { VulnerabilityFinding } from '$lib/code-report/analysis-summary';
  export let analysis: { status: string; error?: string | null };
  export let vulnerabilities: VulnerabilityFinding[] = [];
  export let filteredVulnerabilities: VulnerabilityFinding[] = [];
  export let severityStyles: Record<string, string>;
  export let vulnerabilityQuery = '';
  export let severityFilter = 'all';
  export let findingStatus: (finding: VulnerabilityFinding) => string;
</script>

<section class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
  {#if analysis.status === 'failed' && analysis.error}<div
      class="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
    >
      <AlertCircle class="h-4 w-4" />{analysis.error}
    </div>{:else if vulnerabilities.length === 0}<p
      class="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800"
    >
      No se han detectado vulnerabilidades en este análisis.
    </p>{:else}<div class="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row">
      <label class="relative min-w-0 flex-1"
        ><Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input
          bind:value={vulnerabilityQuery}
          placeholder="Buscar CVE, paquete, título o archivo..."
          class="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
        /></label
      ><select
        bind:value={severityFilter}
        aria-label="Filtrar por severidad"
        class="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        ><option value="all">Todas las severidades</option><option value="critical">Critical</option
        ><option value="high">High</option><option value="medium">Medium</option><option value="low"
          >Low</option
        ></select
      >
    </div>
    <div class="divide-y divide-slate-200">
      {#each filteredVulnerabilities as finding, index (finding.id + finding.target + finding.packageName + index)}<details
          class="group py-4"
        >
          <summary class="flex cursor-pointer list-none flex-wrap items-center gap-3"
            ><span
              class={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${severityStyles[finding.severity]}`}
              >{finding.severity}</span
            ><span class="font-mono text-sm font-semibold text-slate-900">{finding.id}</span><span
              class="text-sm text-slate-600">{finding.title}</span
            ><span class="ml-auto text-xs text-slate-500">{findingStatus(finding)}</span><span
              class="text-xs font-semibold text-slate-500"
              >{finding.cvssScore !== null
                ? `CVSS ${finding.cvssScore.toFixed(1)}`
                : 'Sin CVSS'}</span
            ><a
              href={finding.cveUrl}
              target="_blank"
              rel="noreferrer noopener"
              on:click|stopPropagation
              class="text-xs font-semibold text-blue-700 hover:text-blue-900">CVE ↗</a
            ></summary
          >
          <div class="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <p>{finding.description || finding.title}</p>
            <div class="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
              <div class="rounded-xl border border-slate-200 bg-white p-3">
                <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Ubicación detectada
                </p>
                <p class="mt-1 break-all font-mono text-xs text-slate-800">{finding.packagePath}</p>
                {#if finding.packageIdentifier}<p class="mt-1 break-all text-xs text-slate-500">
                    Identificador: {finding.packageIdentifier}
                  </p>{/if}{#if finding.lineStart !== null}<p
                    class="mt-2 text-xs font-semibold text-slate-700"
                  >
                    Línea{finding.lineEnd !== null && finding.lineEnd !== finding.lineStart
                      ? `s ${finding.lineStart}-${finding.lineEnd}`
                      : ` ${finding.lineStart}`}
                  </p>{:else}<p class="mt-2 text-xs text-slate-500">
                    Este informe no incluye línea ni fragmento de código.
                  </p>{/if}{#if finding.codeSnippet}<pre
                    class="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{finding.codeSnippet}</pre>{/if}
              </div>
              <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-xs lg:min-w-64">
                <div>
                  <dt class="text-slate-500">Paquete</dt>
                  <dd class="mt-0.5 font-semibold text-slate-800">{finding.packageName}</dd>
                </div>
                <div>
                  <dt class="text-slate-500">Estado Trivy</dt>
                  <dd class="mt-0.5 font-semibold text-slate-800">{finding.status}</dd>
                </div>
                <div>
                  <dt class="text-slate-500">Versión instalada</dt>
                  <dd class="mt-0.5 font-mono font-semibold text-red-700">
                    {finding.installedVersion}
                  </dd>
                </div>
                <div>
                  <dt class="text-slate-500">Versión corregida</dt>
                  <dd class="mt-0.5 font-mono font-semibold text-emerald-700">
                    {finding.fixedVersion || 'No indicada'}
                  </dd>
                </div>
                <div>
                  <dt class="text-slate-500">CWE</dt>
                  <dd class="mt-0.5 font-semibold text-slate-800">
                    {finding.cweIds.length > 0 ? finding.cweIds.join(', ') : 'No indicado'}
                  </dd>
                </div>
              </dl>
            </div>
            <div class="mt-4 flex flex-wrap gap-4">
              <a
                href={finding.cveUrl}
                target="_blank"
                rel="noreferrer noopener"
                class="text-xs font-semibold text-blue-700 hover:text-blue-900"
                >Abrir {finding.id} en NVD ↗</a
              >{#if finding.primaryUrl}<a
                  href={finding.primaryUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  class="text-xs font-semibold text-blue-700 hover:text-blue-900">Ver advisory ↗</a
                >{/if}
            </div>
          </div>
        </details>{/each}
    </div>{/if}
</section>
