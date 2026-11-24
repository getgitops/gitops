<script lang="ts" module>
  import type { Component } from 'svelte';

  export type CommandItem = {
    id: string;
    label: string;
    hint?: string;
    icon: Component<any>;
    shortcut?: string[];
    keywords?: string;
    run: () => void;
  };
  export type CommandGroup = { label: string; items: CommandItem[] };
</script>

<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { ArrowDown, ArrowUp, CornerDownLeft, Search } from '@lucide/svelte';

  let { open = $bindable(false), groups }: { open: boolean; groups: CommandGroup[] } = $props();

  let query = $state('');
  let active = $state(0);
  let list = $state<HTMLElement>();

  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  let filtered = $derived.by(() => {
    const q = normalize(query.trim());
    return groups
      .map((g) => ({
        ...g,
        items: q
          ? g.items.filter((i) =>
              normalize(`${i.label} ${i.hint ?? ''} ${i.keywords ?? ''}`).includes(q),
            )
          : g.items,
      }))
      .filter((g) => g.items.length > 0);
  });
  let flat = $derived(filtered.flatMap((g) => g.items));

  // Al cambiar la búsqueda, volvemos al primer resultado
  $effect(() => {
    void query;
    active = 0;
  });

  // Al abrir, limpiamos el estado anterior
  $effect(() => {
    if (open) query = '';
  });

  function focusOnMount(node: HTMLInputElement) {
    node.focus();
  }

  function close() {
    open = false;
  }

  function runItem(item: CommandItem) {
    close();
    item.run();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = flat.length ? (active + 1) % flat.length : 0;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = flat.length ? (active - 1 + flat.length) % flat.length : 0;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flat[active];
      if (item) runItem(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else {
      return;
    }
    queueMicrotask(() =>
      list
        ?.querySelector<HTMLElement>('[data-active="true"]')
        ?.scrollIntoView({ block: 'nearest' }),
    );
  }
</script>

{#if open}
  <div class="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]">
    <button
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      aria-label="Cerrar búsqueda"
      onclick={close}
      transition:fade={{ duration: 120 }}
    ></button>

    <div
      class="k-popover relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Búsqueda"
      transition:scale={{ start: 0.97, duration: 140, easing: cubicOut }}
    >
      <div class="flex items-center gap-3 border-b border-white/[0.08] px-4">
        <Search class="h-4 w-4 shrink-0 text-fg-subtle" />
        <input
          use:focusOnMount
          class="k-input k-input-bare h-14 px-0 text-[15px]"
          placeholder="Busca proyectos, secretos, acciones…"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-list"
          aria-activedescendant={flat[active] ? `cmd-${flat[active].id}` : undefined}
          bind:value={query}
          onkeydown={onKeydown}
        />
        <span class="k-kbd">Esc</span>
      </div>

      <div id="command-list" role="listbox" class="flex-1 overflow-y-auto p-2" bind:this={list}>
        {#each filtered as group}
          <p
            class="px-2.5 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle first:pt-1.5"
          >
            {group.label}
          </p>
          {#each group.items as item}
            {@const index = flat.indexOf(item)}
            {@const isActive = index === active}
            <button
              id="cmd-{item.id}"
              role="option"
              aria-selected={isActive}
              data-active={isActive}
              class="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors {isActive
                ? 'bg-white/[0.07] text-white'
                : 'text-fg'}"
              onmousemove={() => (active = index)}
              onclick={() => runItem(item)}
            >
              <span
                class="grid h-7 w-7 shrink-0 place-items-center rounded-md border transition-colors {isActive
                  ? 'border-brand-500/40 bg-brand-500/10 text-brand-400'
                  : 'border-white/10 bg-white/[0.03] text-fg-subtle'}"
              >
                <item.icon class="h-3.5 w-3.5" />
              </span>
              <span class="min-w-0 flex-1 truncate">
                {item.label}
                {#if item.hint}<span class="text-fg-subtle"> · {item.hint}</span>{/if}
              </span>
              {#if item.shortcut}
                <span class="flex gap-1">
                  {#each item.shortcut as key}<span class="k-kbd">{key}</span>{/each}
                </span>
              {:else if isActive}
                <CornerDownLeft class="h-3.5 w-3.5 text-fg-subtle" />
              {/if}
            </button>
          {/each}
        {:else}
          <div class="px-4 py-10 text-center">
            <p class="text-2xl">🦊</p>
            <p class="mt-2 text-sm text-fg">Sin resultados para “{query}”</p>
            <p class="mt-1 text-xs text-fg-subtle">
              Prueba con el nombre de un proyecto o una acción.
            </p>
          </div>
        {/each}
      </div>

      <div
        class="flex items-center gap-4 border-t border-white/[0.08] bg-ink-900/60 px-4 py-2.5 text-xs text-fg-subtle"
      >
        <span class="flex items-center gap-1.5">
          <span class="k-kbd"><ArrowUp class="h-3 w-3" /></span><span class="k-kbd"
            ><ArrowDown class="h-3 w-3" /></span
          >
          navegar
        </span>
        <span class="flex items-center gap-1.5"
          ><span class="k-kbd"><CornerDownLeft class="h-3 w-3" /></span>abrir</span
        >
        <span class="ml-auto">{flat.length} resultados</span>
      </div>
    </div>
  </div>
{/if}
