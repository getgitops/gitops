<script lang="ts">
  import { BarChart3, TrendingUp, Search, Plus } from 'lucide-svelte';
  import { page } from '$app/stores';

  $: canCreate = Boolean($page.data.canCreateOpenReport);
</script>

<svelte:head>
  <title>Open Report - GitVault Suite</title>
</svelte:head>

<div class="space-y-6">
  <section class="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
    <div class="bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-900 px-6 py-8 text-white sm:px-8">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-200">Analisis</p>
          <h2 class="mt-2 text-3xl font-bold tracking-tight">Open Report</h2>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-emerald-100/80">
            Panel base para reportes, indicadores y exploración rápida de señales del sistema.
          </p>
        </div>
        {#if canCreate}
          <button
            class="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
          >
            <Plus class="h-4 w-4" />
            Nuevo reporte
          </button>
        {/if}
      </div>
    </div>

    <div class="grid gap-4 p-6 sm:grid-cols-3 sm:p-8">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <BarChart3 class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-sm font-semibold text-slate-900">Metrics</p>
        <p class="mt-1 text-sm leading-6 text-slate-600">KPIs y resúmenes de actividad.</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <TrendingUp class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-sm font-semibold text-slate-900">Trends</p>
        <p class="mt-1 text-sm leading-6 text-slate-600">Cambios a lo largo del tiempo.</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <Search class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-sm font-semibold text-slate-900">Explorer</p>
        <p class="mt-1 text-sm leading-6 text-slate-600">Búsqueda y filtrado de reportes.</p>
      </div>
    </div>
  </section>

  <section class="rounded-[28px] border border-dashed border-slate-300 bg-white p-6 shadow-sm sm:p-8">
    <h3 class="text-lg font-semibold text-slate-900">Próximo paso</h3>
    <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
      Esta es la base visual para el módulo de analítica. Después conectaremos datos reales y vistas más densas.
    </p>
  </section>
</div>