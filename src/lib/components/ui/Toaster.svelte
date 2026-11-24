<!-- Pinta la pila de toasts. Va una sola vez en el layout. -->
<script lang="ts">
  import { fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { CircleCheck, CircleX, Info, TriangleAlert, X } from '@lucide/svelte';
  import { toast, toasts } from './toast.svelte';

  const tones = {
    success: { icon: CircleCheck, class: 'text-green-400' },
    error: { icon: CircleX, class: 'text-red-400' },
    warning: { icon: TriangleAlert, class: 'text-amber-400' },
    info: { icon: Info, class: 'text-blue-300' },
  };
</script>

<div
  class="pointer-events-none fixed inset-x-4 bottom-4 z-70 flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6"
  aria-live="polite"
>
  {#each toasts as item (item.id)}
    {@const tone = tones[item.tone]}
    <div
      class="k-popover pointer-events-auto flex w-full items-start gap-3 p-4 sm:w-80"
      role={item.tone === 'error' ? 'alert' : 'status'}
      animate:flip={{ duration: 160 }}
      transition:fly={{ y: 12, duration: 180, easing: cubicOut }}
    >
      <tone.icon class="mt-0.5 h-4 w-4 shrink-0 {tone.class}" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-white">{item.title}</p>
        {#if item.description}<p class="mt-0.5 text-xs text-fg-subtle">{item.description}</p>{/if}
      </div>
      <button
        type="button"
        class="text-fg-subtle hover:text-white"
        aria-label="Cerrar aviso"
        onclick={() => toast.dismiss(item.id)}
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  {/each}
</div>
