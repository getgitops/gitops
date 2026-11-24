<script lang="ts">
  import { statusStyle } from '#lib/monitoring/format';

  let { status, size = 'md' }: { status: string; size?: 'sm' | 'md' | 'lg' } = $props();

  const sizes = { sm: 'h-2 w-2', md: 'h-2.5 w-2.5', lg: 'h-3.5 w-3.5' };
  let style = $derived(statusStyle(status));
  // a live monitor pulses; a paused or pending one stays still
  let pulsing = $derived(status === 'up' || status === 'down' || status === 'degraded');
</script>

<span class="relative inline-flex shrink-0 {sizes[size]}" aria-hidden="true">
  {#if pulsing}
    <span
      class="absolute inline-flex h-full w-full rounded-full opacity-60 {style.dot} {status ===
      'down'
        ? 'animate-ping'
        : 'animate-[ping_2.4s_cubic-bezier(0,0,0.2,1)_infinite]'}"
    ></span>
  {/if}
  <span class="relative inline-flex h-full w-full rounded-full {style.dot}"></span>
</span>
