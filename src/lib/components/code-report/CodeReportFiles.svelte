<!-- Vulnerabilidades agrupadas por archivo: lista a la izquierda, detalle del archivo a la derecha. -->
<script lang="ts">
  import { ExternalLink, FileCode2, Search } from '@lucide/svelte';
  import type { VulnerabilityFinding } from '#lib/code-report/analysis-summary';
  import {
    SEVERITY_FILL,
    SEVERITY_LABEL,
    SEVERITY_RANK,
    severityBadge,
    type SeverityKey,
  } from '#lib/code-report/severity-ui';

  let { findings }: { findings: VulnerabilityFinding[] } = $props();

  let query = $state('');
  let selectedPath = $state('');

  const SHOWN: SeverityKey[] = ['critical', 'high', 'medium', 'low'];

  const groups = $derived.by(() => {
    const map = new Map<string, VulnerabilityFinding[]>();
    for (const finding of findings) {
      const list = map.get(finding.packagePath);
      if (list) list.push(finding);
      else map.set(finding.packagePath, [finding]);
    }
    return [...map.entries()]
      .map(([path, items]) => ({
        path,
        name: path.split(/[\\/]/).pop() || path,
        dir: path.split(/[\\/]/).slice(0, -1).join('/'),
        items: items.sort(
          (left, right) =>
            (SEVERITY_RANK[right.severity] ?? 0) - (SEVERITY_RANK[left.severity] ?? 0),
        ),
        counts: Object.fromEntries(
          SHOWN.map((key) => [key, items.filter((item) => item.severity === key).length]),
        ) as Record<SeverityKey, number>,
        worst: Math.max(...items.map((item) => SEVERITY_RANK[item.severity] ?? 0)),
      }))
      .sort((left, right) => right.worst - left.worst || right.items.length - left.items.length);
  });

  const visible = $derived(
    groups.filter((group) => group.path.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const selected = $derived(
    groups.find((group) => group.path === selectedPath) ?? visible[0] ?? null,
  );
</script>

{#if groups.length === 0}
  <div class="k-card px-6 py-10 text-center text-sm text-fg-subtle">
    Ninguna vulnerabilidad coincide con los filtros.
  </div>
{:else}
  <div class="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
    <aside class="k-card flex min-w-0 flex-col overflow-hidden" aria-label="Archivos">
      <div class="border-b border-white/8 p-3">
        <label class="relative block">
          <Search
            class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
          />
          <input
            type="search"
            class="k-input h-9 pl-9"
            placeholder="Buscar archivo…"
            aria-label="Buscar archivo"
            bind:value={query}
          />
        </label>
        <p class="mt-2 px-1 text-xs text-fg-subtle">{groups.length} archivos con hallazgos</p>
      </div>
      <ul class="max-h-136 overflow-y-auto p-1.5">
        {#each visible as group (group.path)}
          {@const active = selected?.path === group.path}
          <li>
            <button
              type="button"
              class="w-full rounded-lg px-3 py-2.5 text-left transition-colors {active
                ? 'bg-brand-500/10 ring-1 ring-brand-500/40'
                : 'hover:bg-white/4'}"
              aria-pressed={active}
              title={group.path}
              onclick={() => (selectedPath = group.path)}
            >
              <span class="flex items-center gap-2">
                <FileCode2
                  class="h-3.5 w-3.5 shrink-0 {active ? 'text-brand-400' : 'text-fg-subtle'}"
                />
                <span class="truncate font-mono text-[13px] text-white">{group.name}</span>
                <span class="ml-auto text-xs tabular-nums text-fg-subtle">{group.items.length}</span
                >
              </span>
              {#if group.dir}
                <span class="mt-0.5 block truncate pl-5.5 font-mono text-[11px] text-fg-subtle"
                  >{group.dir}/</span
                >
              {/if}
              <span class="mt-1.5 flex h-1 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                {#each SHOWN as key (key)}
                  {#if group.counts[key] > 0}
                    <span
                      class={SEVERITY_FILL[key]}
                      style="width:{(group.counts[key] / group.items.length) * 100}%"
                    ></span>
                  {/if}
                {/each}
              </span>
            </button>
          </li>
        {:else}
          <li class="px-3 py-6 text-center text-xs text-fg-subtle">Ningún archivo coincide.</li>
        {/each}
      </ul>
    </aside>

    <section class="k-card min-w-0 overflow-hidden">
      {#if selected}
        <div class="border-b border-white/8 px-5 py-4">
          <p class="break-all font-mono text-sm text-white">{selected.path}</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            {#each SHOWN as key (key)}
              {#if selected.counts[key] > 0}
                <span class="k-badge {severityBadge(key)} font-semibold tabular-nums"
                  >{SEVERITY_LABEL[key]} · {selected.counts[key]}</span
                >
              {/if}
            {/each}
          </div>
        </div>
        <ul class="divide-y divide-white/6">
          {#each selected.items as finding, index (finding.id + finding.packageName + finding.installedVersion + index)}
            <li class="px-5 py-4">
              <div class="flex flex-wrap items-center gap-2">
                <span class="k-badge {severityBadge(finding.severity)} font-semibold"
                  >{SEVERITY_LABEL[finding.severity]}</span
                >
                <span class="font-mono text-[13px] font-medium text-white">{finding.id}</span>
                <span class="text-sm text-fg-muted">{finding.packageName}</span>
                <a
                  href={finding.cveUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  class="ml-auto inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-white"
                  ><ExternalLink class="h-3 w-3" />NVD</a
                >
              </div>
              <p class="mt-1 font-mono text-xs">
                <span class="text-red-300">{finding.installedVersion}</span>
                <span class="text-fg-subtle">→</span>
                <span class={finding.fixedVersion ? 'text-ok' : 'text-fg-subtle'}
                  >{finding.fixedVersion || 'sin versión corregida'}</span
                >
              </p>
              {#if finding.title || finding.description}
                <p class="mt-2 line-clamp-3 text-sm leading-6 text-fg-muted">
                  {finding.description || finding.title}
                </p>
              {/if}
              {#if finding.codeSnippet}
                <pre
                  class="mt-3 overflow-x-auto rounded-lg border border-white/8 bg-ink-950 p-3 font-mono text-xs leading-5 text-fg">{finding.codeSnippet}</pre>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
{/if}
