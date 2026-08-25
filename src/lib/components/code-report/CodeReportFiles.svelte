<script lang="ts">
  import { Search } from 'lucide-svelte';
  import type { VulnerabilityFinding } from '$lib/code-report/analysis-summary';
  type FileGroup = { path: string; vulnerabilities: VulnerabilityFinding[] };
  export let fileGroups: FileGroup[] = [];
  export let filteredFileGroups: FileGroup[] = [];
  export let selectedFile: FileGroup | null = null;
  export let selectedFilePath = '';
  export let fileQuery = '';
  export let severityStyles: Record<string, string>;
  export let fileSeverityOrder: readonly string[] = [];
  export let getFileName: (path: string) => string;
  export let countSeverity: (findings: VulnerabilityFinding[], severity: string) => number;
  export let severityLabel: (severity: string) => string;
</script>

<section class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
  <label class="relative block"
    ><Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input
      bind:value={fileQuery}
      placeholder="Buscar archivo..."
      class="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
    /></label
  >{#if filteredFileGroups.length === 0}<p class="py-8 text-center text-sm text-slate-500">
      No se han detectado vulnerabilidades asociadas a archivos.
    </p>{:else}<div class="mt-4 grid gap-4 lg:grid-cols-[minmax(16rem,0.4fr)_minmax(0,1fr)]">
      <aside class="rounded-2xl border border-slate-200 bg-slate-50 p-2" aria-label="Archivos">
        <div class="px-3 py-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Archivos</p>
          <p class="mt-1 text-xs text-slate-500">{fileGroups.length} archivos con hallazgos</p>
        </div>
        <div class="max-h-[34rem] space-y-2 overflow-y-auto">
          {#each filteredFileGroups as file, index (file.path + index)}<button
              type="button"
              on:click={() => (selectedFilePath = file.path)}
              aria-pressed={selectedFilePath === file.path}
              title={file.path}
              class={`w-full rounded-xl border p-4 text-left shadow-sm transition ${selectedFilePath === file.path ? 'border-slate-900 bg-slate-900 text-white shadow-md' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:shadow-md'}`}
              ><p class="truncate font-mono text-sm font-semibold" title={file.path}>
                {getFileName(file.path)}
              </p>
              <div class="mt-3 flex flex-wrap gap-1.5">
                {#each fileSeverityOrder as severity}{@const count = countSeverity(
                    file.vulnerabilities,
                    severity,
                  )}{#if count > 0}<span
                      class={`rounded-md px-2 py-1 text-[11px] font-semibold ${selectedFilePath === file.path ? 'bg-white/15 text-white' : severityStyles[severity]}`}
                      >{severityLabel(severity)}{count}</span
                    >{/if}{/each}
              </div>
              <p
                class={`mt-3 text-xs ${selectedFilePath === file.path ? 'text-slate-300' : 'text-slate-500'}`}
              >
                {file.vulnerabilities.length} CVE{file.vulnerabilities.length === 1 ? '' : 's'}
              </p></button
            >{/each}
        </div>
      </aside>
      <div class="min-h-[20rem] rounded-2xl border border-slate-200 bg-white">
        {#if selectedFile}<div class="border-b border-slate-200 p-5">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Archivo seleccionado
            </p>
            <h4 class="mt-1 break-all font-mono text-sm font-semibold text-slate-900">
              {selectedFile.path}
            </h4>
            <p class="mt-2 text-sm text-slate-500">
              {selectedFile.vulnerabilities.length} vulnerabilidades detectadas en este archivo
            </p>
          </div>
          <div class="divide-y divide-slate-100 px-5">
            {#each selectedFile.vulnerabilities as finding, index (finding.id + finding.packageName + finding.installedVersion + index)}<article
                class="py-4"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <span
                      class={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${severityStyles[finding.severity]}`}
                      >{finding.severity}</span
                    ><span class="font-mono text-sm font-semibold text-slate-900">{finding.id}</span
                    >
                  </div>
                  <a
                    href={finding.cveUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    class="text-xs font-semibold text-blue-700 hover:text-blue-900">Ver CVE ↗</a
                  >
                </div>
                <p class="mt-2 text-sm font-medium text-slate-800">{finding.packageName}</p>
                <p class="mt-1 text-xs text-slate-500">
                  {finding.installedVersion} → {finding.fixedVersion || 'Sin versión corregida'}
                </p>
                <p class="mt-2 text-sm leading-6 text-slate-600">
                  {finding.description || finding.title}
                </p>
                <div
                  class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
                >
                  {#if finding.lineStart !== null}<p class="font-semibold text-slate-800">
                      Línea{finding.lineEnd !== null && finding.lineEnd !== finding.lineStart
                        ? `s ${finding.lineStart}-${finding.lineEnd}`
                        : ` ${finding.lineStart}`}
                    </p>{:else}<p>
                      Este informe no incluye línea ni fragmento de código.
                    </p>{/if}{#if finding.codeSnippet}<pre
                      class="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-3 leading-5 text-slate-100">{finding.codeSnippet}</pre>{/if}
                </div>
                <div class="mt-3 flex flex-wrap gap-4 text-xs">
                  <span class="text-slate-500"
                    >CWE: {finding.cweIds.length > 0
                      ? finding.cweIds.join(', ')
                      : 'No indicado'}</span
                  >{#if finding.primaryUrl}<a
                      href={finding.primaryUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      class="font-semibold text-blue-700 hover:text-blue-900">Ver advisory ↗</a
                    >{/if}
                </div>
              </article>{/each}
          </div>{:else}<div class="flex min-h-[20rem] items-center justify-center p-8 text-center">
            <div>
              <p class="text-base font-semibold text-slate-900">
                Selecciona un archivo para inspeccionar
              </p>
              <p class="mt-1 text-sm text-slate-500">
                Elige un archivo del listado para ver sus vulnerabilidades.
              </p>
            </div>
          </div>{/if}
      </div>
    </div>{/if}
</section>
