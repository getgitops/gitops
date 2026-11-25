<!--
  Evolución del riesgo ponderado de un servicio, un punto por análisis de vulnerabilidades.
  Una sola serie (series-1) y un solo eje; el desglose por severidad va en el tooltip.
  Convenciones de /brand: línea de 2 px, rejilla casi invisible, tooltip sobre ink-800.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  import { Table2 } from '@lucide/svelte';
  import { locale } from '#lib/i18n';

  type Point = {
    id: string;
    createdAt: string;
    score: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };

  let { points, selectedId = null }: { points: Point[]; selectedId?: string | null } = $props();

  const SERIES = '#e14607';
  const SURFACE = '#101014';

  let canvas = $state<HTMLCanvasElement>();
  let showTable = $state(false);

  function format(iso: string, withTime = false) {
    return new Intl.DateTimeFormat($locale ?? 'es', {
      day: 'numeric',
      month: 'short',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : {}),
    }).format(new Date(iso));
  }

  const sameDay = $derived(
    points.length > 1 &&
      new Date(points[0].createdAt).toDateString() ===
        new Date(points[points.length - 1].createdAt).toDateString(),
  );

  onMount(() => {
    Chart.register(...registerables);
    Chart.defaults.font.family = 'Inter, ui-sans-serif, system-ui';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#72727e';

    const highlighted = points.map(
      (point, index) => point.id === selectedId || (!selectedId && index === points.length - 1),
    );

    const chart = new Chart(canvas!, {
      type: 'line',
      data: {
        // si todos los análisis son del mismo día, la fecha sola no distingue los puntos
        labels: points.map((point) => format(point.createdAt, sameDay)),
        datasets: [
          {
            label: 'Riesgo',
            data: points.map((point) => point.score),
            borderColor: SERIES,
            backgroundColor: SERIES,
            borderWidth: 2,
            pointRadius: highlighted.map((on) => (on ? 4 : points.length > 20 ? 0 : 2)),
            pointBorderColor: SURFACE,
            pointBorderWidth: highlighted.map((on) => (on ? 2 : 0)),
            pointHoverRadius: 5,
            pointHoverBorderColor: SURFACE,
            pointHoverBorderWidth: 2,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#17171d',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            titleColor: '#e7e7ea',
            bodyColor: '#a9a9b3',
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              title: (items) => format(points[items[0].dataIndex].createdAt, true),
              label: (item) => {
                const point = points[item.dataIndex];
                return [
                  `Riesgo: ${point.score} puntos`,
                  `Críticas ${point.critical} · Altas ${point.high}`,
                  `Medias ${point.medium} · Bajas ${point.low}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { maxTicksLimit: 6, maxRotation: 0 },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.06)' },
            border: { display: false },
            beginAtZero: true,
            ticks: { maxTicksLimit: 5, precision: 0 },
          },
        },
      },
    });

    return () => chart.destroy();
  });
</script>

<div class="flex items-center justify-end">
  <button
    type="button"
    class="k-btn k-btn-ghost k-btn-sm -mr-2"
    aria-pressed={showTable}
    onclick={() => (showTable = !showTable)}
  >
    <Table2 class="h-3.5 w-3.5" />{showTable ? 'Ver gráfica' : 'Ver tabla'}
  </button>
</div>

<div class="relative h-52" class:hidden={showTable}>
  <canvas bind:this={canvas} aria-label="Evolución del riesgo en {points.length} análisis"></canvas>
</div>

{#if showTable}
  <div class="max-h-52 overflow-y-auto rounded-lg border border-white/8">
    <table class="w-full text-left text-sm">
      <thead class="sticky top-0 bg-ink-900 text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
        <tr>
          <th class="px-3 py-2 font-semibold">Fecha</th>
          <th class="px-3 py-2 text-right font-semibold">Riesgo</th>
          <th class="px-3 py-2 text-right font-semibold">C</th>
          <th class="px-3 py-2 text-right font-semibold">H</th>
          <th class="px-3 py-2 text-right font-semibold">M</th>
          <th class="px-3 py-2 text-right font-semibold">L</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-white/5 tabular-nums">
        {#each [...points].reverse() as point (point.id)}
          <tr class={point.id === selectedId ? 'bg-brand-500/8' : ''}>
            <td class="px-3 py-1.5 text-fg-muted">{format(point.createdAt, true)}</td>
            <td class="px-3 py-1.5 text-right text-fg">{point.score}</td>
            <td class="px-3 py-1.5 text-right text-fg-muted">{point.critical}</td>
            <td class="px-3 py-1.5 text-right text-fg-muted">{point.high}</td>
            <td class="px-3 py-1.5 text-right text-fg-muted">{point.medium}</td>
            <td class="px-3 py-1.5 text-right text-fg-muted">{point.low}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
