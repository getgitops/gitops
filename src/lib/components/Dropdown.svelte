<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ChevronDown, Check } from '@lucide/svelte';

  export let options: Array<{ id: string; name: string }> = [];
  export let value = '';
  export let ariaLabel = 'Select option';

  let isOpen = false;

  const dispatch = createEventDispatcher<{ change: { id: string } }>();

  $: selected = options.find((option) => option.id === value) || options[0] || null;

  function toggleOpen() {
    isOpen = !isOpen;
  }

  function close() {
    isOpen = false;
  }

  function selectOption(id: string) {
    dispatch('change', { id });
    close();
  }
</script>

<div class="relative inline-block text-left">
  <button
    type="button"
    class="btn-secondary inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-sm font-medium text-slate-800"
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    aria-label={ariaLabel}
    on:click={toggleOpen}
  >
    <span class="max-w-[220px] truncate">{selected?.name || 'Select'}</span>
    <ChevronDown class="h-4 w-4 text-slate-500" />
  </button>

  {#if isOpen}
    <button
      type="button"
      class="fixed inset-0 z-40 cursor-default"
      on:click={close}
      aria-label="Close dropdown"
    ></button>

    <div class="absolute left-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
      <ul class="max-h-64 overflow-y-auto py-1" role="listbox" aria-label={ariaLabel}>
        {#each options as option}
          <li>
            <button
              type="button"
              class="btn-ghost flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors {option.id === value
                ? 'bg-slate-100 text-slate-900'
                : 'text-slate-700 hover:bg-slate-50'}"
              role="option"
              aria-selected={option.id === value}
              on:click={() => selectOption(option.id)}
            >
              <span class="truncate">{option.name}</span>
              {#if option.id === value}
                <Check class="h-4 w-4 text-slate-600" />
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
