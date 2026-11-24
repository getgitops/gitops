<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart, registerables } from 'chart.js';

  // Orden fijo de series (validado CVD sobre ink-900). No reordenar ni ciclar.
  const series = ['#e14607', '#3b82f6', '#0d9488', '#a855f7', '#b8860b'];
  const surface = '#101014';
  const grid = 'rgba(255,255,255,0.06)';
  const tick = '#72727e';

  let lineCanvas: HTMLCanvasElement;
  let barCanvas: HTMLCanvasElement;
  let showTable = $state(false);

  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const p50 = [
    82, 80, 78, 76, 75, 77, 84, 96, 118, 124, 121, 119, 126, 131, 128, 122, 117, 113, 108, 101, 96,
    90, 86, 84,
  ];
  const p95 = [
    190, 184, 176, 170, 168, 172, 198, 240, 310, 344, 322, 318, 336, 362, 350, 330, 312, 296, 280,
    258, 236, 220, 204, 196,
  ];

  const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const deploys = [14, 22, 18, 26, 31, 6, 3];

  // 90 días de uptime: la mayoría OK, algún degradado y una caída
  const uptime = Array.from({ length: 90 }, (_, i) =>
    i === 61 ? 'down' : i === 23 || i === 74 || i === 75 ? 'degraded' : 'up',
  );
  const uptimeColor = { up: '#22c55e', degraded: '#f59e0b', down: '#ef4444' } as const;
  const uptimeLabel = { up: 'Operativo', degraded: 'Degradado', down: 'Caída' } as const;

  onMount(() => {
    Chart.register(...registerables);
    Chart.defaults.font.family = 'Inter, ui-sans-serif, system-ui';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = tick;

    const tooltip = {
      backgroundColor: '#17171d',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      titleColor: '#e7e7ea',
      bodyColor: '#a9a9b3',
      padding: 10,
      cornerRadius: 8,
      boxPadding: 4,
      usePointStyle: true,
    };

    const line = new Chart(lineCanvas, {
      type: 'line',
      data: {
        labels: hours,
        datasets: [
          {
            label: 'p50',
            data: p50,
            borderColor: series[0],
            backgroundColor: series[0],
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBorderColor: surface,
            pointHoverBorderWidth: 2,
            tension: 0.3,
          },
          {
            label: 'p95',
            data: p95,
            borderColor: series[1],
            backgroundColor: series[1],
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBorderColor: surface,
            pointHoverBorderWidth: 2,
            tension: 0.3,
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
            ...tooltip,
            callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y} ms` },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: {
            grid: { color: grid },
            border: { display: false },
            ticks: { callback: (v) => `${v} ms`, maxTicksLimit: 5 },
            beginAtZero: true,
          },
        },
      },
    });

    const bar = new Chart(barCanvas, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [
          {
            label: 'Despliegues',
            data: deploys,
            backgroundColor: series[0],
            hoverBackgroundColor: '#f95d11',
            borderRadius: { topLeft: 4, topRight: 4 },
            borderSkipped: false,
            maxBarThickness: 28,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { ...tooltip, callbacks: { label: (c) => ` ${c.parsed.y} despliegues` } },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false } },
          y: { grid: { color: grid }, border: { display: false }, ticks: { maxTicksLimit: 5 } },
        },
      },
    });

    return () => {
      line.destroy();
      bar.destroy();
    };
  });
</script>

<div class="grid gap-4 lg:grid-cols-3">
  <div class="k-card p-5 lg:col-span-2">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-sm font-medium text-fg">Tiempo de respuesta</p>
        <p class="text-xs text-fg-subtle">api.kettu.studio · últimas 24 h</p>
      </div>
      <div class="flex items-center gap-4 text-xs text-fg-muted">
        <span class="inline-flex items-center gap-1.5"
          ><span class="h-0.5 w-4 rounded" style="background:{series[0]}"></span>p50</span
        >
        <span class="inline-flex items-center gap-1.5"
          ><span class="h-0.5 w-4 rounded" style="background:{series[1]}"></span>p95</span
        >
        <button class="k-btn k-btn-ghost k-btn-sm" onclick={() => (showTable = !showTable)}>
          {showTable ? 'Ver gráfica' : 'Ver tabla'}
        </button>
      </div>
    </div>
    <div class="relative mt-4 h-64" class:hidden={showTable}>
      <canvas bind:this={lineCanvas} aria-label="Tiempo de respuesta p50 y p95 por hora"></canvas>
    </div>
    {#if showTable}
      <div class="mt-4 h-64 overflow-auto rounded-lg border border-white/10">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 bg-ink-800 text-xs text-fg-subtle">
            <tr
              ><th class="px-3 py-2 font-medium">Hora</th><th class="px-3 py-2 font-medium">p50</th
              ><th class="px-3 py-2 font-medium">p95</th></tr
            >
          </thead>
          <tbody class="divide-y divide-white/5 text-fg-muted">
            {#each hours as h, i}
              <tr
                ><td class="px-3 py-1.5 font-mono text-xs">{h}</td><td class="px-3 py-1.5"
                  >{p50[i]} ms</td
                ><td class="px-3 py-1.5">{p95[i]} ms</td></tr
              >
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  <div class="k-card p-5">
    <p class="text-sm font-medium text-fg">Despliegues por día</p>
    <p class="text-xs text-fg-subtle">Esta semana · 120 en total</p>
    <div class="relative mt-4 h-64">
      <canvas bind:this={barCanvas} aria-label="Despliegues por día de la semana"></canvas>
    </div>
  </div>

  <div class="k-card p-5 lg:col-span-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p class="text-sm font-medium text-fg">Uptime · 90 días</p>
        <p class="text-xs text-fg-subtle">Monitor HTTP · checkout-api</p>
      </div>
      <span class="k-badge k-badge-ok"
        ><span class="h-1.5 w-1.5 rounded-full bg-ok"></span>99,92 %</span
      >
    </div>
    <div class="mt-4 flex h-9 gap-[2px]">
      {#each uptime as estado, i}
        <div
          class="group relative flex-1 rounded-[2px] transition-opacity hover:opacity-80"
          style="background:{uptimeColor[estado]}"
        >
          <div
            class="k-popover pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 text-xs group-hover:block"
          >
            <span class="text-fg">Hace {90 - i} días</span>
            <span class="text-fg-muted"> · {uptimeLabel[estado]}</span>
          </div>
        </div>
      {/each}
    </div>
    <div class="mt-2 flex justify-between text-xs text-fg-subtle">
      <span>Hace 90 días</span><span>Hoy</span>
    </div>
  </div>
</div>
