<!--
  Select con estilo de la marca, opcionalmente con búsqueda.
  - Con `name` añade un <input type="hidden"> para que el valor viaje en el <form>.
  - Dentro de un Field, extiende sus props: <Select {...control} … />.
  - Para listas cortas sin búsqueda en formularios que deben funcionar sin JS, usa un
    <select class="k-input"> nativo.
-->
<script lang="ts" module>
  export type SelectOption = {
    value: string;
    label: string;
    /** Texto secundario a la derecha de la etiqueta. */
    hint?: string;
    disabled?: boolean;
  };
</script>

<script lang="ts">
  import { ChevronsUpDown, Check, Search } from '@lucide/svelte';
  import DropdownMenu from './DropdownMenu.svelte';

  type Props = {
    options: SelectOption[];
    value?: string;
    placeholder?: string;
    searchable?: boolean;
    searchPlaceholder?: string;
    name?: string;
    id?: string;
    disabled?: boolean;
    /** Fuente monoespaciada para ids, regiones, ramas… */
    mono?: boolean;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
    onchange?: (value: string) => void;
  };

  let {
    options,
    value = $bindable(''),
    placeholder = 'Selecciona…',
    searchable = false,
    searchPlaceholder = 'Buscar…',
    name,
    id,
    disabled = false,
    mono = false,
    'aria-invalid': invalid,
    'aria-describedby': describedby,
    onchange,
  }: Props = $props();

  const uid = $props.id();
  const triggerId = $derived(id ?? `${uid}-select`);

  let open = $state(false);
  let query = $state('');

  let selected = $derived(options.find((o) => o.value === value));
  let filtered = $derived(
    query.trim()
      ? options.filter((o) =>
          `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()),
        )
      : options,
  );

  $effect(() => {
    if (!open) query = '';
  });

  function choose(option: SelectOption) {
    if (option.disabled) return;
    value = option.value;
    onchange?.(option.value);
    open = false;
    document.getElementById(triggerId)?.focus();
  }
</script>

<DropdownMenu
  bind:open
  role="listbox"
  label={placeholder}
  block
  {triggerId}
  class="w-full min-w-56 p-1.5"
  initialFocus={searchable ? '[data-select-search]' : '[aria-selected="true"]'}
>
  {#snippet trigger(props)}
    <button
      {...props}
      role="combobox"
      class="k-input flex items-center justify-between gap-2 text-left"
      aria-invalid={invalid}
      aria-describedby={describedby}
      {disabled}
    >
      <span
        class="truncate {selected ? '' : 'text-fg-subtle'} {mono && selected
          ? 'font-mono text-[13px]'
          : ''}"
      >
        {selected?.label ?? placeholder}
      </span>
      <ChevronsUpDown class="h-4 w-4 shrink-0 text-fg-subtle" />
    </button>
  {/snippet}

  {#if searchable}
    <label class="relative mb-1 block">
      <span class="sr-only">{searchPlaceholder}</span>
      <Search
        class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle"
      />
      <input
        data-select-search
        class="k-input k-input-bare h-8 pl-8"
        placeholder={searchPlaceholder}
        autocomplete="off"
        bind:value={query}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const first = filtered.find((o) => !o.disabled);
            if (first) choose(first);
          }
        }}
      />
    </label>
    <div class="k-divider mb-1"></div>
  {/if}

  <div class="max-h-60 overflow-y-auto">
    {#each filtered as option (option.value)}
      <button
        type="button"
        role="option"
        aria-selected={option.value === value}
        aria-disabled={option.disabled}
        class="k-menu-item {option.disabled ? 'cursor-not-allowed opacity-40' : ''}"
        onclick={() => choose(option)}
      >
        <span class="min-w-0 flex-1 truncate">
          <span class={mono ? 'font-mono text-[13px]' : ''}>{option.label}</span>
          {#if option.hint}<span class="text-xs text-fg-subtle"> · {option.hint}</span>{/if}
        </span>
        {#if option.value === value}<Check class="h-4 w-4 shrink-0 text-brand-400" />{/if}
      </button>
    {:else}
      <p class="px-2.5 py-3 text-sm text-fg-subtle">Sin resultados</p>
    {/each}
  </div>
</DropdownMenu>

{#if name}<input type="hidden" {name} {value} />{/if}
