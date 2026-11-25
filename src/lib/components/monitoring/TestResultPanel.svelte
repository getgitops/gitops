<script lang="ts">
  import { ChevronDown, Clock, Globe, Repeat } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import { formatLatency, statusStyle } from '#lib/monitoring/format';
  import StatusDot from './StatusDot.svelte';
  import type { TestResult } from './types';

  let { result }: { result: TestResult } = $props();

  let outcome = $derived(result.outcome);
  let preview = $derived(result.preview);
  let headerEntries = $derived(Object.entries(preview?.responseHeaders ?? {}));
</script>

<section
  class="k-card overflow-hidden {outcome.status === 'up'
    ? 'border-ok/30'
    : outcome.status === 'degraded'
      ? 'border-warn/30'
      : 'border-danger/35'}"
  aria-live="polite"
>
  <header
    class="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4"
  >
    <div class="flex items-center gap-3">
      <StatusDot status={outcome.status} size="lg" />
      <div>
        <p class="text-sm font-semibold {statusStyle(outcome.status).text}">
          {$_(`monitoring.test.result.${outcome.status}`)}
        </p>
        {#if outcome.error}
          <p class="text-xs text-fg-muted">
            {outcome.cause ? $_(`monitoring.causes.${outcome.cause}`) : ''} — {outcome.error}
          </p>
        {/if}
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2 text-xs">
      {#if outcome.httpStatus !== null}
        <span class="k-badge font-mono">
          HTTP {outcome.httpStatus}
        </span>
      {/if}
      <span class="k-badge gap-1">
        <Clock class="h-3.5 w-3.5" />{formatLatency(outcome.latencyMs)}
      </span>
      {#if preview && preview.redirects > 0}
        <span class="k-badge gap-1">
          <Repeat class="h-3.5 w-3.5" />{$_('monitoring.test.redirects', {
            values: { count: preview.redirects },
          })}
        </span>
      {/if}
    </div>
  </header>

  {#if preview}
    <div class="space-y-3 px-5 py-4 text-xs">
      <p class="flex items-center gap-2 text-fg-muted">
        <Globe class="h-3.5 w-3.5 shrink-0" />
        <span class="truncate font-mono">{preview.finalUrl}</span>
      </p>
      {#if headerEntries.length}
        <details class="group rounded-xl border border-white/8">
          <summary
            class="flex cursor-pointer list-none items-center justify-between px-3 py-2 font-medium text-fg"
          >
            {$_('monitoring.test.responseHeaders', { values: { count: headerEntries.length } })}
            <ChevronDown class="h-4 w-4 transition group-open:rotate-180" />
          </summary>
          <dl
            class="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-x-4 gap-y-1 border-t border-white/8 px-3 py-2 font-mono"
          >
            {#each headerEntries as [name, value] (name)}
              <dt class="truncate text-fg-subtle">{name}</dt>
              <dd class="break-all text-fg">{value}</dd>
            {/each}
          </dl>
        </details>
      {/if}
      {#if preview.bodyPreview}
        <div>
          <p class="mb-1 font-medium text-fg-muted">{$_('monitoring.test.body')}</p>
          <pre
            class="max-h-64 overflow-auto rounded-xl border border-white/8 bg-ink-950 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-fg">{preview.bodyPreview}</pre>
        </div>
      {/if}
    </div>
  {/if}
</section>
