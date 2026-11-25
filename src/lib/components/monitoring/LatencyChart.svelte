<script lang="ts">
  /**
   * Response time line chart (Chart.js, loaded on the client only):
   * - "1 h": every check in memory, points colored by status; checks with no response (timeout,
   *   DNS, connection) are red triangles on the axis instead of a fake latency.
   * - "24 h" / "90 d": average and p95 per hour / per day from the stored aggregates.
   * The degraded threshold of the monitor is drawn as a dashed amber line.
   */
  import { onDestroy, untrack } from 'svelte';
  import type { Chart as ChartType, ChartDataset, ScriptableContext } from 'chart.js';
  import { _, locale } from '#lib/i18n';
  import { Tabs, tabId, tabPanelId } from '#lib/components/ui';
  import { formatLatency } from '#lib/monitoring/format';
  import type { CheckOutcome } from '#lib/monitoring/types';
  import type { BarData } from './types';

  type Range = 'recent' | 'hour' | 'day';

  let {
    recentChecks,
    hourlyBars,
    dailyBars,
    degradedThresholdMs,
  }: {
    recentChecks: CheckOutcome[];
    hourlyBars: BarData[];
    dailyBars: BarData[];
    degradedThresholdMs: number;
  } = $props();

  // paleta de /brand: series en orden fijo (series-1, series-2); los colores de estado solo
  // marcan estado (puntos y tramos), nunca una serie
  const COLORS = {
    avg: '#e14607',
    p95: '#3b82f6',
    threshold: '#f59e0b',
    up: '#22c55e',
    degraded: '#f59e0b',
    down: '#ef4444',
    grid: 'rgba(255, 255, 255, 0.06)',
    tick: '#72727e',
  };
  const uid = $props.id();

  const withLatency = (bars: BarData[]) => bars.filter((bar) => bar.latencyAvg !== null).length;

  // start on the stored hours when there are some, on the live checks for a new monitor
  let range = $state<Range>(untrack(() => (withLatency(hourlyBars) >= 2 ? 'hour' : 'recent')));
  let canvas = $state<HTMLCanvasElement | null>(null);
  let chart: ChartType | null = null;
  let ChartClass: typeof ChartType | null = null;

  type Point = {
    label: string;
    avg: number | null;
    p95: number | null;
    status: string;
    failed: boolean;
  };

  let points = $derived.by((): Point[] => {
    if (range === 'recent') {
      return recentChecks.map((check) => ({
        label: new Date(check.startedAt).toLocaleTimeString($locale, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        avg: check.httpStatus === null ? null : check.latencyMs,
        p95: null,
        status: check.status,
        failed: check.httpStatus === null,
      }));
    }
    const bars = range === 'hour' ? hourlyBars : dailyBars;
    return bars.map((bar) => {
      const start = new Date(bar.start);
      return {
        label:
          range === 'hour'
            ? start.toLocaleTimeString($locale, { hour: '2-digit', minute: '2-digit' })
            : start.toLocaleDateString($locale, { day: 'numeric', month: 'short' }),
        avg: bar.latencyAvg,
        p95: bar.latencyP95,
        status: bar.status,
        failed: false,
      };
    });
  });

  let summary = $derived.by(() => {
    const values = points
      .map((point) => point.avg)
      .filter((value): value is number => value !== null);
    const p95s = points
      .map((point) => point.p95 ?? point.avg)
      .filter((value): value is number => value !== null);
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return {
      avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      p95:
        range === 'recent'
          ? sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)]
          : Math.max(...p95s),
      min: sorted[0],
      max: sorted.at(-1)!,
    };
  });

  let hasData = $derived(points.some((point) => point.avg !== null || point.failed));

  function statusColor(status: string): string {
    return status === 'down' ? COLORS.down : status === 'degraded' ? COLORS.degraded : COLORS.up;
  }

  /** No dots on a continuous line, but a value with no neighbours (one hour of data) must show. */
  function isolatedRadius(values: (number | null)[]): number[] {
    return values.map((value, index) =>
      value !== null && values[index - 1] == null && values[index + 1] == null ? 3.5 : 0,
    );
  }

  function areaGradient(context: ScriptableContext<'line'>) {
    const { ctx, chartArea } = context.chart;
    if (!chartArea) return 'rgba(225, 70, 7, 0.12)';
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, 'rgba(225, 70, 7, 0.28)');
    gradient.addColorStop(1, 'rgba(225, 70, 7, 0)');
    return gradient;
  }

  function datasets(): ChartDataset<'line'>[] {
    const recent = range === 'recent';
    const sets: ChartDataset<'line'>[] = [
      {
        label: recent ? $_('monitoring.latency.responseTime') : $_('monitoring.latency.avg'),
        data: points.map((point) => point.avg),
        borderColor: COLORS.avg,
        backgroundColor: areaGradient,
        fill: 'origin',
        borderWidth: 2,
        tension: 0.35,
        spanGaps: true,
        pointRadius: recent ? 2.5 : isolatedRadius(points.map((point) => point.avg)),
        pointHoverRadius: 5,
        pointBackgroundColor: points.map((point) =>
          recent ? statusColor(point.status) : COLORS.avg,
        ),
        pointBorderColor: 'transparent',
        // a slow or failing stretch turns the line itself amber/red
        segment: recent
          ? {
              borderColor: (ctx) => {
                const a = points[ctx.p0DataIndex]?.status;
                const b = points[ctx.p1DataIndex]?.status;
                if (a === 'down' || b === 'down') return COLORS.down;
                if (a === 'degraded' || b === 'degraded') return COLORS.degraded;
                return COLORS.avg;
              },
            }
          : undefined,
      },
    ];
    if (!recent) {
      sets.push({
        label: 'p95',
        data: points.map((point) => point.p95),
        borderColor: COLORS.p95,
        borderDash: [6, 4],
        borderWidth: 1.5,
        tension: 0.35,
        spanGaps: true,
        pointRadius: isolatedRadius(points.map((point) => point.p95)),
        pointBackgroundColor: COLORS.p95,
        pointHoverRadius: 4,
        fill: false,
      });
    }
    if (recent && points.some((point) => point.failed)) {
      sets.push({
        label: $_('monitoring.latency.noResponse'),
        data: points.map((point) => (point.failed ? 0 : null)),
        showLine: false,
        pointStyle: 'triangle',
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: COLORS.down,
        pointBorderColor: COLORS.down,
      });
    }
    if (degradedThresholdMs > 0) {
      sets.push({
        label: $_('monitoring.latency.threshold'),
        data: points.map(() => degradedThresholdMs),
        borderColor: COLORS.threshold,
        borderDash: [4, 4],
        borderWidth: 1,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
      });
    }
    return sets;
  }

  function render() {
    if (!ChartClass || !canvas) return;
    const data = { labels: points.map((point) => point.label), datasets: datasets() };
    if (chart) {
      chart.data = data;
      chart.update();
      return;
    }
    chart = new ChartClass(canvas, {
      type: 'line',
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#17171d',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            titleColor: '#e7e7ea',
            bodyColor: '#a9a9b3',
            padding: 10,
            cornerRadius: 8,
            usePointStyle: true,
            boxPadding: 4,
            callbacks: {
              label: (item) =>
                item.raw === null || item.raw === undefined
                  ? ''
                  : item.dataset.label === $_('monitoring.latency.noResponse')
                    ? ` ${item.dataset.label}`
                    : ` ${item.dataset.label}: ${formatLatency(item.raw as number)}`,
            },
            filter: (item) => item.raw !== null && item.raw !== undefined,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: COLORS.tick,
              maxTicksLimit: 8,
              maxRotation: 0,
              font: { size: 11, family: 'Inter, ui-sans-serif, system-ui' },
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: COLORS.grid },
            border: { display: false },
            ticks: {
              color: COLORS.tick,
              maxTicksLimit: 5,
              font: { size: 11, family: 'Inter, ui-sans-serif, system-ui' },
              callback: (value) => formatLatency(Number(value)),
            },
          },
        },
      },
    });
  }

  // load Chart.js on the client once the canvas exists, then redraw on every data change
  $effect(() => {
    if (!canvas) return;
    if (ChartClass) return;
    void import('chart.js').then(({ Chart, registerables }) => {
      Chart.register(...registerables);
      ChartClass = Chart;
      render();
    });
  });

  $effect(() => {
    void points;
    void degradedThresholdMs;
    if (ChartClass) render();
  });

  onDestroy(() => chart?.destroy());

  const ranges = [
    { value: 'recent', label: '1 h' },
    { value: 'hour', label: '24 h' },
    { value: 'day', label: '90 d' },
  ];
</script>

<section class="k-card p-5 sm:p-6">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h2 class="text-sm font-semibold text-white">{$_('monitoring.latency.title')}</h2>
      <p class="mt-1 text-xs text-fg-subtle">
        {range === 'recent'
          ? $_('monitoring.latency.recentHelp')
          : $_('monitoring.latency.aggregateHelp')}
      </p>
    </div>
    <Tabs
      variant="segmented"
      size="sm"
      label={$_('monitoring.latency.title')}
      idPrefix="latency-{uid}"
      items={ranges}
      bind:value={() => range, (next) => (range = next as Range)}
    />
  </div>

  {#if summary}
    <div class="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-fg-subtle">
      <span class="inline-flex items-center gap-2">
        <span class="h-0.5 w-4 rounded" style="background: {COLORS.avg}"></span>
        {range === 'recent' ? $_('monitoring.latency.responseTime') : $_('monitoring.latency.avg')}
        <strong class="font-medium tabular-nums text-fg">{formatLatency(summary.avg)}</strong>
      </span>
      <span class="inline-flex items-center gap-2">
        {#if range !== 'recent'}
          <span class="h-0 w-4 border-t-2 border-dashed" style="border-color: {COLORS.p95}"></span>
        {/if}
        p95 <strong class="font-medium tabular-nums text-fg">{formatLatency(summary.p95)}</strong>
      </span>
      <span>min <strong class="font-medium tabular-nums text-fg">{formatLatency(summary.min)}</strong></span>
      <span>max <strong class="font-medium tabular-nums text-fg">{formatLatency(summary.max)}</strong></span>
      {#if degradedThresholdMs > 0}
        <span class="inline-flex items-center gap-2">
          <span class="h-0 w-4 border-t border-dashed" style="border-color: {COLORS.threshold}"
          ></span>
          {$_('monitoring.latency.threshold')}
          <strong class="font-medium tabular-nums text-fg">{formatLatency(degradedThresholdMs)}</strong>
        </span>
      {/if}
    </div>
  {/if}

  <div
    class="relative mt-4 h-64"
    role="tabpanel"
    id={tabPanelId(`latency-${uid}`, range)}
    aria-labelledby={tabId(`latency-${uid}`, range)}
  >
    <canvas
      bind:this={canvas}
      class={hasData ? '' : 'invisible'}
      aria-label={$_('monitoring.latency.title')}
    ></canvas>
    {#if !hasData}
      <p class="absolute inset-0 flex items-center justify-center text-sm text-fg-subtle">
        {$_('monitoring.latency.noData')}
      </p>
    {/if}
  </div>
</section>
