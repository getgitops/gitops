<script lang="ts">
  import { Box, ChevronRight, ChevronDown, Package } from '@lucide/svelte';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let node: any;
  export let level = 0;
  export let selectedUrn = '';

  let expanded = level < 2;

  $: if (node._forceExpand) {
    expanded = true;
  }

  function toggle(event: Event) {
    event.stopPropagation();
    expanded = !expanded;
  }

  function select(event: Event) {
    event.stopPropagation();
    dispatch('select', node);
  }

  function onChildSelect(event: CustomEvent) {
    dispatch('select', event.detail);
  }

  function getShortName(urn: string) {
    const parts = urn.split('::');
    return parts[parts.length - 1] || urn;
  }

  function getShortType(urn: string) {
    const parts = urn.split('::');
    if (parts.length >= 3) {
      return parts[parts.length - 2];
    }
    return '';
  }
</script>

<div class="font-sans">
  <div
    role="button"
    tabindex="0"
    class="flex w-full items-center py-1.5 px-2 hover:bg-gray-100 rounded cursor-pointer group select-none text-left {selectedUrn ===
    node.urn
      ? 'bg-blue-50 border border-blue-200'
      : 'border border-transparent'}"
    style="padding-left: {level * 1.5 + 0.5}rem;"
    on:click={select}
    on:keydown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select(event);
      }
    }}
  >
    <div
      role="button"
      tabindex="0"
      class="w-4 h-4 mr-1 flex items-center justify-center text-gray-400"
      on:click={toggle}
      on:keydown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle(event);
        }
      }}
      aria-label="Toggle node"
    >
      {#if node.children && node.children.length > 0}
        {#if expanded}
          <ChevronDown class="w-4 h-4 hover:text-gray-900" />
        {:else}
          <ChevronRight class="w-4 h-4 hover:text-gray-900" />
        {/if}
      {/if}
    </div>

    {#if node.custom}
      <Box class="w-4 h-4 text-blue-500 mr-2 shrink-0" />
    {:else}
      <Package class="w-4 h-4 text-amber-500 mr-2 shrink-0" />
    {/if}

    <span class="font-semibold text-gray-900 text-sm truncate mr-2">{getShortName(node.urn)}</span>
    <span class="text-xs text-gray-500 truncate">{getShortType(node.urn)}</span>
  </div>

  {#if expanded && node.children && node.children.length > 0}
    <div>
      {#each node.children as child}
        <svelte:self node={child} level={level + 1} {selectedUrn} on:select={onChildSelect} />
      {/each}
    </div>
  {/if}
</div>
