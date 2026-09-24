<script lang="ts">
  import { AlertCircle, KeyRound, Search } from '@lucide/svelte';
  import type { SecretFinding } from '$lib/code-report/analysis-summary';

  type Analysis = { tool: string; status: string; createdAt: string; error?: string | null } | null;

  export let analysis: Analysis = null;
  export let secrets: SecretFinding[] = [];
  export let severityStyles: Record<string, string>;
  export let secretQuery = '';

  $: filteredSecrets = secrets.filter((secret) => {
    const query = secretQuery.trim().toLowerCase();
    return (
      !query ||
      [secret.ruleId, secret.title, secret.file, secret.author].some((value) =>
        value.toLowerCase().includes(query),
      )
    );
  });
</script>

<section class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
  {#if !analysis}
    <p class="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
      Todavía no se ha ejecutado ningún análisis de secretos con gitleaks en este servicio.
    </p>
  {:else if analysis.status === 'failed'}
    <div
      class="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
    >
      <AlertCircle class="h-4 w-4" />{analysis.error || 'El análisis de secretos falló.'}
    </div>
  {:else if analysis.status === 'in_progress'}
    <p class="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
      El análisis de secretos está en curso.
    </p>
  {:else if secrets.length === 0}
    <p class="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
      No se han detectado secretos expuestos en este análisis.
    </p>
  {:else}
    <div class="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center">
      <div class="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <KeyRound class="h-4 w-4 text-red-600" />{secrets.length} secreto{secrets.length === 1
          ? ''
          : 's'} expuesto{secrets.length === 1 ? '' : 's'}
      </div>
      <label class="relative min-w-0 flex-1">
        <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          bind:value={secretQuery}
          placeholder="Buscar regla, archivo o autor..."
          class="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
        />
      </label>
    </div>
    <div class="divide-y divide-slate-200">
      {#each filteredSecrets as secret, index (secret.id + index)}
        <details class="group py-4">
          <summary class="flex cursor-pointer list-none flex-wrap items-center gap-3">
            <span
              class={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${severityStyles[secret.severity]}`}
              >{secret.severity}</span
            >
            <span class="font-mono text-sm font-semibold text-slate-900">{secret.ruleId}</span>
            <span class="text-sm text-slate-600">{secret.title}</span>
            <span class="ml-auto break-all font-mono text-xs text-slate-500"
              >{secret.file}{secret.lineStart !== null ? `:${secret.lineStart}` : ''}</span
            >
          </summary>
          <div class="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <dl class="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-3">
              <div>
                <dt class="text-slate-500">Archivo</dt>
                <dd class="mt-0.5 break-all font-mono font-semibold text-slate-800">
                  {secret.file}
                </dd>
              </div>
              <div>
                <dt class="text-slate-500">Líneas</dt>
                <dd class="mt-0.5 font-semibold text-slate-800">
                  {secret.lineStart !== null
                    ? secret.lineEnd !== null && secret.lineEnd !== secret.lineStart
                      ? `${secret.lineStart}-${secret.lineEnd}`
                      : secret.lineStart
                    : 'No indicadas'}
                </dd>
              </div>
              <div>
                <dt class="text-slate-500">Entropía</dt>
                <dd class="mt-0.5 font-semibold text-slate-800">
                  {secret.entropy !== null ? secret.entropy.toFixed(2) : 'No indicada'}
                </dd>
              </div>
              {#if secret.commit}
                <div>
                  <dt class="text-slate-500">Commit</dt>
                  <dd class="mt-0.5 font-mono font-semibold text-slate-800">
                    {secret.commit.slice(0, 10)}
                  </dd>
                </div>
              {/if}
              {#if secret.author}
                <div>
                  <dt class="text-slate-500">Autor</dt>
                  <dd class="mt-0.5 font-semibold text-slate-800">{secret.author}</dd>
                </div>
              {/if}
              {#if secret.date}
                <div>
                  <dt class="text-slate-500">Fecha</dt>
                  <dd class="mt-0.5 font-semibold text-slate-800">
                    {new Date(secret.date).toLocaleString()}
                  </dd>
                </div>
              {/if}
            </dl>
            {#if secret.match}
              <p class="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Coincidencia (enmascarada)
              </p>
              <pre
                class="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{secret.match}</pre>
            {/if}
            <p class="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Rota esta credencial aunque la elimines del código: sigue presente en el historial de
              git.
            </p>
          </div>
        </details>
      {/each}
    </div>
  {/if}
</section>
