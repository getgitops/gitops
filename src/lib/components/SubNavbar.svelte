<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Dropdown from '$lib/components/Dropdown.svelte';
  import { _ } from '$lib/i18n';

  export let label = '';
  export let options: Array<{ id: string; name: string }> = [];
  export let activeId = '';
  export let path = '/';
  export let rootHref = '/pulumi-state';
  export let rootLabel = '';

  const dispatch = createEventDispatcher<{ change: { id: string } }>();

  function handleSelect(event: CustomEvent<{ id: string }>) {
    const id = event.detail.id;
    dispatch('change', { id });
  }

  $: normalizedPath = path.startsWith('/') ? path : `/${path}`;
  $: resolvedLabel = label || $_('subNavbar.defaultLabel');
  $: resolvedRootLabel = rootLabel || $_('subNavbar.defaultRootLabel');
</script>

<nav class="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm sm:px-4">
  <span class="font-semibold text-slate-900">{resolvedLabel}</span>

  {#if options.length > 1}
    <Dropdown
      options={options}
      value={activeId}
      ariaLabel={`${$_('subNavbar.select')} ${resolvedLabel}`}
      on:change={handleSelect}
    />
  {:else}
    <span class="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-medium text-slate-800">
      {options[0]?.name || $_('subNavbar.notAvailable')}
    </span>
  {/if}

  <span class="text-slate-400">•</span>
  <a href={rootHref} class="font-semibold text-slate-700 transition-colors hover:text-slate-900">
    {resolvedRootLabel}
  </a>
  <span class="font-mono text-slate-700">{normalizedPath}</span>
</nav>
