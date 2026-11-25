<script lang="ts">
  import {
    ChevronRight,
    CircleAlert,
    CircleCheck,
    KeyRound,
    Search,
    TriangleAlert,
  } from '@lucide/svelte';
  import type { SecretFinding } from '#lib/code-report/analysis-summary';
  import { SEVERITY_LABEL, severityBadge } from '#lib/code-report/severity-ui';
  import { locale } from '#lib/i18n';

  type Analysis = { status: string; error?: string | null } | null;

  let { analysis, secrets }: { analysis: Analysis; secrets: SecretFinding[] } = $props();

  let query = $state('');

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return secrets.filter(
      (secret) =>
        !q ||
        [secret.ruleId, secret.title, secret.file, secret.author].some((value) =>
          value.toLowerCase().includes(q),
        ),
    );
  });

  const files = $derived(new Set(secrets.map((secret) => secret.file)).size);

  function lines(secret: SecretFinding) {
    if (secret.lineStart === null) return null;
    return secret.lineEnd !== null && secret.lineEnd !== secret.lineStart
      ? `${secret.lineStart}-${secret.lineEnd}`
      : String(secret.lineStart);
  }

  function date(iso: string) {
    return new Intl.DateTimeFormat($locale ?? 'es', { dateStyle: 'medium' }).format(new Date(iso));
  }
</script>

{#if !analysis}
  <div class="k-card px-6 py-12 text-center text-sm text-fg-muted">
    Este servicio todavía no tiene un análisis de secretos (Gitleaks).
  </div>
{:else if analysis.status === 'failed'}
  <div class="k-card flex items-start gap-3 border-red-500/30 px-5 py-4 text-sm text-red-200">
    <CircleAlert class="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
    {analysis.error || 'El análisis de secretos falló.'}
  </div>
{:else if analysis.status === 'in_progress'}
  <div class="k-card px-6 py-12 text-center text-sm text-fg-muted">
    El análisis de secretos está en curso.
  </div>
{:else if secrets.length === 0}
  <div class="k-card flex flex-col items-center gap-3 px-6 py-12 text-center">
    <span class="grid h-12 w-12 place-items-center rounded-full bg-ok/10 text-ok"
      ><CircleCheck class="h-6 w-6" /></span
    >
    <p class="text-sm font-medium text-white">Sin secretos expuestos</p>
    <p class="text-sm text-fg-muted">Gitleaks no ha encontrado credenciales en el código.</p>
  </div>
{:else}
  <div class="space-y-4">
    <div
      class="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/6 px-5 py-4 text-sm"
    >
      <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
      <div>
        <p class="font-medium text-white">
          {secrets.length}
          {secrets.length === 1 ? 'secreto expuesto' : 'secretos expuestos'} en {files}
          {files === 1 ? 'archivo' : 'archivos'}
        </p>
        <p class="mt-0.5 text-red-200/80">
          Rota cada credencial aunque la borres del código: sigue en el historial de git. Después,
          muévela al Vault.
        </p>
      </div>
    </div>

    <div class="k-card overflow-hidden">
      <div class="flex flex-wrap items-center gap-3 border-b border-white/8 p-4">
        <label class="relative w-full sm:w-80">
          <Search
            class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
          />
          <input
            type="search"
            class="k-input h-9 pl-9"
            placeholder="Buscar regla, archivo o autor…"
            aria-label="Buscar secretos"
            bind:value={query}
          />
        </label>
        <span class="ml-auto text-xs tabular-nums text-fg-subtle"
          >{filtered.length} de {secrets.length}</span
        >
      </div>

      <ul class="divide-y divide-white/6">
        {#each filtered as secret, index (secret.id + index)}
          <li>
            <details class="group">
              <summary
                class="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 transition-colors hover:bg-white/2.5 [&::-webkit-details-marker]:hidden"
              >
                <ChevronRight
                  class="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-90"
                />
                <KeyRound class="h-4 w-4 shrink-0 text-red-400" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm text-white">
                    <span class="font-mono text-[13px] font-medium">{secret.ruleId}</span>
                    {#if secret.title && secret.title !== secret.ruleId}
                      <span class="ml-1 text-fg-muted">{secret.title}</span>
                    {/if}
                  </p>
                  <p class="truncate font-mono text-xs text-fg-subtle">
                    {secret.file}{#if lines(secret)}:{lines(secret)}{/if}
                  </p>
                </div>
                {#if secret.severity !== 'unknown'}
                  <span class="k-badge {severityBadge(secret.severity)} font-semibold"
                    >{SEVERITY_LABEL[secret.severity]}</span
                  >
                {/if}
              </summary>
              <div class="space-y-4 border-t border-white/6 bg-ink-950/40 px-5 py-4 pl-12">
                <dl class="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div class="sm:col-span-2">
                    <dt class="text-fg-subtle">Archivo</dt>
                    <dd class="mt-0.5 break-all font-mono text-fg">
                      {secret.file}{#if lines(secret)}<span class="text-fg-subtle"
                          >:{lines(secret)}</span
                        >{/if}
                    </dd>
                  </div>
                  {#if secret.commit}
                    <div>
                      <dt class="text-fg-subtle">Commit</dt>
                      <dd class="mt-0.5 font-mono text-fg">{secret.commit.slice(0, 10)}</dd>
                    </div>
                  {/if}
                  {#if secret.entropy !== null}
                    <div>
                      <dt class="text-fg-subtle">Entropía</dt>
                      <dd class="mt-0.5 tabular-nums text-fg">{secret.entropy.toFixed(2)}</dd>
                    </div>
                  {/if}
                  {#if secret.author}
                    <div>
                      <dt class="text-fg-subtle">Autor</dt>
                      <dd class="mt-0.5 text-fg">{secret.author}</dd>
                    </div>
                  {/if}
                  {#if secret.date}
                    <div>
                      <dt class="text-fg-subtle">Fecha</dt>
                      <dd class="mt-0.5 text-fg">{date(secret.date)}</dd>
                    </div>
                  {/if}
                </dl>
                {#if secret.match}
                  <div>
                    <p class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
                      Coincidencia (enmascarada)
                    </p>
                    <pre
                      class="mt-1.5 overflow-x-auto rounded-lg border border-white/8 bg-ink-950 p-3 font-mono text-xs text-fg">{secret.match}</pre>
                  </div>
                {/if}
              </div>
            </details>
          </li>
        {:else}
          <li class="px-5 py-10 text-center text-sm text-fg-subtle">
            Ningún secreto coincide con la búsqueda.
          </li>
        {/each}
      </ul>
    </div>
  </div>
{/if}
