<!-- Aviso de las páginas de acceso: información, éxito o error. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { CircleCheck, CircleX, Info } from '@lucide/svelte';

  let { tone = 'info', children }: { tone?: 'info' | 'success' | 'error'; children: Snippet } =
    $props();

  const styles = {
    info: { box: 'border-white/10 bg-white/4 text-fg', icon: Info, iconClass: 'text-info' },
    success: {
      box: 'border-ok/30 bg-ok/8 text-green-100',
      icon: CircleCheck,
      iconClass: 'text-ok',
    },
    error: {
      box: 'border-danger/30 bg-danger/8 text-red-100',
      icon: CircleX,
      iconClass: 'text-red-400',
    },
  };
  const style = $derived(styles[tone]);
</script>

<p
  class="mb-5 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm {style.box}"
  role={tone === 'error' ? 'alert' : 'status'}
>
  <style.icon class="mt-0.5 h-4 w-4 shrink-0 {style.iconClass}" />
  <span>{@render children()}</span>
</p>
