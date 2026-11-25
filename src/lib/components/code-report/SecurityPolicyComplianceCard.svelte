<script lang="ts">
  import {
    ChevronDown,
    ShieldAlert,
    ShieldCheck,
    ShieldQuestion,
    TriangleAlert,
  } from '@lucide/svelte';
  import type { PolicyComplianceReport } from '#lib/code-report/policy-evaluation';

  let {
    report,
    policiesHref = null,
  }: { report: PolicyComplianceReport; policiesHref?: string | null } = $props();

  // abierto por defecto solo si incumple; el usuario puede plegarlo o desplegarlo
  let expanded = $derived(report.status === 'violated');

  const theme = $derived(
    report.status === 'violated'
      ? {
          icon: ShieldAlert,
          iconTone: 'bg-red-500/10 text-red-400',
          border: 'border-red-500/30',
          title: 'Incumple las políticas de seguridad',
        }
      : report.status === 'compliant'
        ? {
            icon: ShieldCheck,
            iconTone: 'bg-ok/10 text-ok',
            border: '',
            title: 'Cumple todas las políticas de seguridad',
          }
        : {
            icon: ShieldQuestion,
            iconTone: 'bg-white/5 text-fg-subtle',
            border: '',
            title:
              report.status === 'no_policies'
                ? 'Sin políticas de seguridad activas'
                : 'Ninguna política aplica a este análisis',
          },
  );

  const subtitle = $derived(
    report.status === 'violated'
      ? `${report.failed.length} ${report.failed.length === 1 ? 'política incumplida' : 'políticas incumplidas'} · ${report.totalViolations} ${report.totalViolations === 1 ? 'regla superada' : 'reglas superadas'}`
      : report.status === 'compliant'
        ? `${report.passed.length} ${report.passed.length === 1 ? 'política evaluada' : 'políticas evaluadas'} sin incidencias`
        : report.status === 'no_policies'
          ? 'Define políticas para vigilar automáticamente cada análisis.'
          : 'Las políticas activas no cubren este servicio o faltan análisis.',
  );
</script>

<section class="k-card overflow-hidden {theme.border}" aria-label="Políticas de seguridad">
  <div class="flex flex-wrap items-center gap-4 px-5 py-4">
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl {theme.iconTone}">
      <theme.icon class="h-5 w-5" />
    </span>
    <div class="min-w-0 flex-1">
      <p class="font-semibold text-white">{theme.title}</p>
      <p class="text-xs text-fg-subtle">{subtitle}</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if report.blockingFailures > 0}
        <span class="k-badge k-badge-danger font-semibold">
          <TriangleAlert class="h-3 w-3" />{report.blockingFailures}
          {report.blockingFailures === 1 ? 'bloqueante' : 'bloqueantes'}
        </span>
      {/if}
      {#if policiesHref}
        <a href={policiesHref} class="k-btn k-btn-ghost k-btn-sm">Ver políticas</a>
      {/if}
      {#if report.evaluations.length > 0}
        <button
          type="button"
          class="k-btn k-btn-secondary k-btn-sm"
          aria-expanded={expanded}
          onclick={() => (expanded = !expanded)}
        >
          {expanded ? 'Ocultar' : 'Detalle'}
          <ChevronDown class="h-3.5 w-3.5 transition-transform {expanded ? 'rotate-180' : ''}" />
        </button>
      {/if}
    </div>
  </div>

  {#if expanded && report.evaluations.length > 0}
    <ul class="divide-y divide-white/6 border-t border-white/8">
      {#each report.evaluations as evaluation (evaluation.policyId)}
        <li class="px-5 py-4">
          <div class="flex flex-wrap items-center gap-2">
            {#if !evaluation.evaluable}
              <ShieldQuestion class="h-4 w-4 text-fg-subtle" />
            {:else if evaluation.passed}
              <ShieldCheck class="h-4 w-4 text-ok" />
            {:else}
              <ShieldAlert class="h-4 w-4 text-red-400" />
            {/if}
            <p class="text-sm font-medium text-white">{evaluation.policyName}</p>
            <span class="k-badge">{evaluation.enforcement === 'block' ? 'Bloquear' : 'Avisar'}</span
            >
            <span
              class="k-badge ml-auto {!evaluation.evaluable
                ? ''
                : evaluation.passed
                  ? 'k-badge-ok'
                  : 'k-badge-danger'}"
            >
              {!evaluation.evaluable ? 'No evaluada' : evaluation.passed ? 'Cumple' : 'Incumple'}
            </span>
          </div>

          {#if !evaluation.evaluable}
            <p class="mt-2 pl-6 text-xs text-fg-subtle">{evaluation.skippedReason}</p>
          {:else}
            <ul class="mt-3 space-y-1.5 pl-6">
              {#each evaluation.checks as item (item.key)}
                <li
                  class="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-white/2 px-3 py-2"
                >
                  <div class="min-w-0">
                    <p class="text-xs font-medium {item.passed ? 'text-fg' : 'text-red-300'}">
                      {item.label}
                    </p>
                    <p class="text-[11px] text-fg-subtle">{item.message}</p>
                    {#if !item.passed && item.samples.length > 0}
                      <p class="mt-1 font-mono text-[11px] text-fg-subtle">
                        {item.samples.join(', ')}{#if item.actual > item.samples.length}
                          y {item.actual - item.samples.length} más{/if}
                      </p>
                    {/if}
                  </div>
                  <span
                    class="k-badge tabular-nums {item.passed ? 'k-badge-ok' : 'k-badge-danger'}"
                  >
                    {item.actual}{item.limit !== null ? ` / ${item.limit}` : ''}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>
