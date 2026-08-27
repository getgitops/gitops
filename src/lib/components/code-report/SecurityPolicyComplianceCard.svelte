<script lang="ts">
  import { AlertTriangle, ChevronDown, ChevronUp, ShieldAlert, ShieldCheck, ShieldQuestion } from '@lucide/svelte';
  import type { PolicyComplianceReport } from '$lib/code-report/policy-evaluation';

  export let report: PolicyComplianceReport;
  export let policiesHref: string | null = null;

  let expanded = true;

  $: theme =
    report.status === 'violated'
      ? {
          border: 'border-red-300',
          bg: 'bg-red-50',
          accent: 'bg-red-600',
          text: 'text-red-900',
          muted: 'text-red-700',
          icon: ShieldAlert,
          title: 'Incumple las políticas de seguridad',
        }
      : report.status === 'compliant'
        ? {
            border: 'border-emerald-300',
            bg: 'bg-emerald-50',
            accent: 'bg-emerald-600',
            text: 'text-emerald-900',
            muted: 'text-emerald-700',
            icon: ShieldCheck,
            title: 'Cumple todas las políticas de seguridad',
          }
        : {
            border: 'border-slate-300',
            bg: 'bg-slate-50',
            accent: 'bg-slate-500',
            text: 'text-slate-900',
            muted: 'text-slate-600',
            icon: ShieldQuestion,
            title:
              report.status === 'no_policies'
                ? 'Sin políticas de seguridad activas'
                : 'Ninguna política aplica a este análisis',
          };

  $: subtitle =
    report.status === 'violated'
      ? `${report.failed.length} políticas incumplidas · ${report.totalViolations} reglas superadas`
      : report.status === 'compliant'
        ? `${report.passed.length} políticas evaluadas sin incidencias`
        : report.status === 'no_policies'
          ? 'Define políticas para vigilar automáticamente cada análisis.'
          : 'Las políticas activas no cubren este servicio o faltan análisis.';
</script>

<section class={`overflow-hidden rounded-2xl border-2 ${theme.border} ${theme.bg} shadow-sm`}>
  <div class={`h-1.5 w-full ${theme.accent}`}></div>

  <div class="flex flex-wrap items-start justify-between gap-4 p-5">
    <div class="flex items-start gap-3">
      <div class={`rounded-xl ${theme.accent} p-2.5 text-white`}>
        <svelte:component this={theme.icon} class="h-6 w-6" />
      </div>
      <div>
        <p class={`text-[11px] font-bold uppercase tracking-wide ${theme.muted}`}>
          Security Policies
        </p>
        <h3 class={`text-lg font-bold ${theme.text}`}>{theme.title}</h3>
        <p class={`mt-0.5 text-sm ${theme.muted}`}>{subtitle}</p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      {#if report.blockingFailures > 0}
        <span class="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
          <AlertTriangle class="h-3.5 w-3.5" />
          {report.blockingFailures} bloqueantes
        </span>
      {/if}
      {#if policiesHref}
        <a
          href={policiesHref}
          class="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Ver políticas
        </a>
      {/if}
      {#if report.evaluations.length > 0}
        <button
          type="button"
          on:click={() => (expanded = !expanded)}
          class="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {expanded ? 'Ocultar detalle' : 'Ver detalle'}
          {#if expanded}
            <ChevronUp class="h-3.5 w-3.5" />
          {:else}
            <ChevronDown class="h-3.5 w-3.5" />
          {/if}
        </button>
      {/if}
    </div>
  </div>

  {#if expanded && report.evaluations.length > 0}
    <div class="space-y-3 border-t border-white/60 bg-white/70 p-5">
      {#each report.evaluations as evaluation (evaluation.policyId)}
        <div
          class={`rounded-xl border bg-white p-4 ${
            !evaluation.evaluable
              ? 'border-slate-200'
              : evaluation.passed
                ? 'border-emerald-200'
                : 'border-red-200'
          }`}
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              {#if !evaluation.evaluable}
                <ShieldQuestion class="h-4 w-4 text-slate-400" />
              {:else if evaluation.passed}
                <ShieldCheck class="h-4 w-4 text-emerald-600" />
              {:else}
                <ShieldAlert class="h-4 w-4 text-red-600" />
              {/if}
              <p class="text-sm font-semibold text-slate-900">{evaluation.policyName}</p>
              <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                {evaluation.enforcement === 'block' ? 'Bloquear' : 'Avisar'}
              </span>
            </div>
            <span
              class={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${
                !evaluation.evaluable
                  ? 'bg-slate-100 text-slate-500'
                  : evaluation.passed
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-100 text-red-700'
              }`}
            >
              {!evaluation.evaluable ? 'No evaluada' : evaluation.passed ? 'Cumple' : 'Incumple'}
            </span>
          </div>

          {#if !evaluation.evaluable}
            <p class="mt-2 text-xs text-slate-500">{evaluation.skippedReason}</p>
          {:else}
            <ul class="mt-3 space-y-2">
              {#each evaluation.checks as item (item.key)}
                <li class="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <div>
                    <p class={`text-xs font-semibold ${item.passed ? 'text-slate-700' : 'text-red-700'}`}>
                      {item.label}
                    </p>
                    <p class="text-[11px] text-slate-500">{item.message}</p>
                    {#if !item.passed && item.samples.length > 0}
                      <p class="mt-1 text-[11px] text-slate-400">
                        Ej.: {item.samples.join(', ')}
                        {#if item.actual > item.samples.length}
                          y {item.actual - item.samples.length} más
                        {/if}
                      </p>
                    {/if}
                  </div>
                  <span
                    class={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      item.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {item.actual}{item.limit !== null ? ` / ${item.limit}` : ''}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>
