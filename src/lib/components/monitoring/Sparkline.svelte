<script lang="ts">
  /** Latency line of the last hours: a light inline SVG, no chart library. */
  let {
    values,
    status = 'up',
    width = 120,
    height = 32,
  }: { values: (number | null)[]; status?: string; width?: number; height?: number } = $props();

  const colors: Record<string, string> = {
    up: '#22c55e',
    degraded: '#f59e0b',
    down: '#ef4444',
  };
  // stable between SSR and hydration
  const uid = $props.id();
  const gradientId = `spark-${uid}`;

  let points = $derived.by(() => {
    const known = values.filter((value): value is number => value !== null);
    if (known.length < 2) return null;
    const max = Math.max(...known);
    const min = Math.min(...known);
    const span = max - min || 1;
    const step = width / Math.max(values.length - 1, 1);
    return values
      .map((value, index) =>
        value === null ? null : [index * step, height - 3 - ((value - min) / span) * (height - 6)],
      )
      .filter((point): point is number[] => point !== null);
  });
  let line = $derived(
    points
      ? points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
      : '',
  );
  let area = $derived(
    points
      ? `${line} L${points.at(-1)![0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`
      : '',
  );
  let color = $derived(colors[status] ?? '#72727e');
</script>

<svg {width} {height} viewBox="0 0 {width} {height}" class="overflow-visible" aria-hidden="true">
  {#if points}
    <defs>
      <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color={color} stop-opacity="0.28" />
        <stop offset="100%" stop-color={color} stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d={area} fill="url(#{gradientId})" />
    <path
      d={line}
      fill="none"
      stroke={color}
      stroke-width="1.6"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <circle cx={points.at(-1)![0]} cy={points.at(-1)![1]} r="2.2" fill={color} />
  {:else}
    <line
      x1="0"
      x2={width}
      y1={height / 2}
      y2={height / 2}
      stroke="rgba(255,255,255,0.12)"
      stroke-dasharray="3 3"
    />
  {/if}
</svg>
