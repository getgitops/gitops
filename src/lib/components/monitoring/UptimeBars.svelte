<script lang="ts">
  import { _, locale } from '#lib/i18n';
  import { formatDuration, formatLatency, formatUptime, statusStyle } from '#lib/monitoring/format';

  type Bar = {
    start: string;
    end: string;
    status: 'up' | 'degraded' | 'down' | 'none';
    uptime: number | null;
    checks: number;
    downSeconds: number;
    degradedSeconds: number;
    latencyAvg: number | null;
  };

  let {
    bars,
    unit,
    height = 'h-8',
  }: { bars: Bar[]; unit: 'hour' | 'day'; height?: string } = $props();

  let hovered = $state<number | null>(null);

  function label(bar: Bar): string {
    const start = new Date(bar.start);
    return unit === 'day'
      ? start.toLocaleDateString($locale, { day: 'numeric', month: 'short', year: 'numeric' })
      : `${start.toLocaleDateString($locale, { day: 'numeric', month: 'short' })} · ${start.toLocaleTimeString($locale, { hour: '2-digit', minute: '2-digit' })}`;
  }
</script>

<div class="relative" role="group" aria-label={$_('monitoring.bars.label')}>
  <div class="flex items-end gap-[2px] {height}">
    {#each bars as bar, index (bar.start)}
      <button
        type="button"
        class="h-full min-w-[2px] flex-1 rounded-[2px] transition-[transform,background-color] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 {statusStyle(
          bar.status,
        ).bar} {hovered === index ? 'scale-y-110' : ''}"
        aria-label={`${label(bar)}: ${$_(`monitoring.status.${bar.status}`)}`}
        onmouseenter={() => (hovered = index)}
        onmouseleave={() => (hovered = null)}
        onfocus={() => (hovered = index)}
        onblur={() => (hovered = null)}
      ></button>
    {/each}
  </div>

  {#if hovered !== null && bars[hovered]}
    {@const bar = bars[hovered]}
    {@const left = Math.min(Math.max(((hovered + 0.5) / bars.length) * 100, 12), 88)}
    <div
      class="pointer-events-none absolute bottom-full z-20 mb-2 w-60 -translate-x-1/2 rounded-xl border border-[var(--border)] bg-[#0b1829] p-3 text-xs shadow-2xl"
      style="left: {left}%"
    >
      <div class="flex items-center justify-between gap-2">
        <span class="font-semibold text-slate-100">{label(bar)}</span>
        <span class="font-semibold {statusStyle(bar.status).text}">
          {$_(`monitoring.status.${bar.status}`)}
        </span>
      </div>
      {#if bar.status !== 'none'}
        <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-slate-400">
          <dt>{$_('monitoring.bars.uptime')}</dt>
          <dd class="text-right text-slate-200">{formatUptime(bar.uptime)}</dd>
          <dt>{$_('monitoring.bars.checks')}</dt>
          <dd class="text-right text-slate-200">{bar.checks}</dd>
          <dt>{$_('monitoring.bars.latency')}</dt>
          <dd class="text-right text-slate-200">{formatLatency(bar.latencyAvg)}</dd>
          {#if bar.downSeconds > 0}
            <dt class="text-rose-300">{$_('monitoring.bars.down')}</dt>
            <dd class="text-right text-rose-300">{formatDuration(bar.downSeconds)}</dd>
          {/if}
          {#if bar.degradedSeconds > 0}
            <dt class="text-amber-300">{$_('monitoring.bars.degraded')}</dt>
            <dd class="text-right text-amber-300">{formatDuration(bar.degradedSeconds)}</dd>
          {/if}
        </dl>
      {:else}
        <p class="mt-1 text-slate-500">{$_('monitoring.bars.noData')}</p>
      {/if}
    </div>
  {/if}
</div>
