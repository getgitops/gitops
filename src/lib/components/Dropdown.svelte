<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ChevronDown, Check } from '@lucide/svelte';

  export let options: Array<{ id: string; name: string; disabled?: boolean; badge?: string }> = [];
  export let value = '';
  export let ariaLabel = 'Select option';
  export let disabled = false;

  let isOpen = false;

  const dispatch = createEventDispatcher<{ change: { id: string } }>();

  $: selected = options.find((option) => option.id === value) || options[0] || null;

  function toggleOpen() {
    if (disabled) return;
    isOpen = !isOpen;
  }

  function close() {
    isOpen = false;
  }

  function selectOption(option: { id: string; disabled?: boolean }) {
    if (option.disabled) return;
    dispatch('change', { id: option.id });
    close();
  }
</script>

<div class="relative inline-block text-left">
  <button
    type="button"
    class="btn-secondary inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    aria-label={ariaLabel}
    {disabled}
    on:click={toggleOpen}
  >
    <span class="max-w-55 truncate">{selected?.name || 'Select'}</span>
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
              class="btn-ghost flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors {option.disabled
                ? 'cursor-not-allowed text-slate-400'
                : option.id === value
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-700 hover:bg-slate-50'}"
              role="option"
              aria-selected={option.id === value}
              aria-disabled={option.disabled}
              on:click={() => selectOption(option)}
            >
              <span class="truncate">{option.name}</span>
              <span class="flex shrink-0 items-center gap-2">
                {#if option.badge}
                  <span
                    class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {option.badge}
                  </span>
                {/if}
                {#if option.id === value}
                  <Check class="h-4 w-4 text-slate-600" />
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
