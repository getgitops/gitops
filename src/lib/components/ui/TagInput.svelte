<!--
  Campo de etiquetas con sugerencias (destinatarios, canales, URLs…).
  - Escribe para filtrar las sugerencias; ↑ ↓ para moverte, Enter o clic para añadir.
  - Enter, coma o Tab añaden también lo escrito si `parse` lo acepta (p. ej. un email).
  - Retroceso con el campo vacío quita la última etiqueta; Esc cierra la lista.
  - `values` son identificadores (`user:<id>`, `#canal`…); `describe` decide cómo se pintan.
-->
<script lang="ts" module>
  import type { Component } from 'svelte';

  export type TagSuggestion = {
    value: string;
    label: string;
    hint?: string;
    /** Encabezado bajo el que se agrupa en la lista. */
    group?: string;
    icon?: Component<any>;
  };

  export type TagView = { label: string; icon?: Component<any>; tone?: 'default' | 'brand' };
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { X } from '@lucide/svelte';
  import { floating, overlayLayer } from './overlay';

  type Props = {
    values?: string[];
    suggestions?: TagSuggestion[];
    id?: string;
    placeholder?: string;
    /** Convierte texto libre en un valor; devuelve null si no es válido. Sin él, solo sugerencias. */
    parse?: (text: string) => string | null;
    /** Mensaje cuando `parse` rechaza el texto. */
    invalidMessage?: string;
    /** Cómo se pinta una etiqueta; por defecto, la sugerencia con ese valor o el propio valor. */
    describe?: (value: string) => TagView;
    disabled?: boolean;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    /** Nombre accesible si no hay <label for>. */
    label?: string;
    onchange?: (values: string[]) => void;
  };

  let {
    values = $bindable([]),
    suggestions = [],
    id,
    placeholder = '',
    parse,
    invalidMessage = '',
    describe,
    disabled = false,
    'aria-describedby': describedby,
    'aria-invalid': ariaInvalid,
    label,
    onchange,
  }: Props = $props();

  const uid = $props.id();
  const inputId = $derived(id ?? `${uid}-input`);
  const listId = `${uid}-list`;
  const errorId = `${uid}-error`;

  let query = $state('');
  let open = $state(false);
  let active = $state(0);
  let invalid = $state(false);
  let field = $state<HTMLElement>();
  let input = $state<HTMLInputElement>();

  const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const filtered = $derived.by(() => {
    const q = normalize(query.trim());
    return suggestions
      .filter((item) => !values.includes(item.value))
      .filter(
        (item) =>
          !q || normalize(`${item.label} ${item.hint ?? ''} ${item.group ?? ''}`).includes(q),
      )
      .slice(0, 50);
  });

  // con texto que `parse` acepta y que no es ya una sugerencia, se ofrece como primera opción
  const custom = $derived.by(() => {
    const text = query.trim();
    if (!text || !parse) return null;
    const value = parse(text);
    if (!value || values.includes(value) || filtered.some((item) => item.value === value)) {
      return null;
    }
    return value;
  });

  type Option = {
    value: string;
    label: string;
    hint?: string;
    group?: string;
    icon?: Component<any>;
  };
  const options: Option[] = $derived(
    custom ? [{ value: custom, label: custom, group: undefined }, ...filtered] : filtered,
  );

  $effect(() => {
    void options.length;
    if (active >= options.length) active = Math.max(0, options.length - 1);
  });

  function view(value: string): TagView {
    if (describe) return describe(value);
    const suggestion = suggestions.find((item) => item.value === value);
    return { label: suggestion?.label ?? value, icon: suggestion?.icon };
  }

  function emit(next: string[]) {
    values = next;
    onchange?.(next);
  }

  function add(value: string) {
    if (!values.includes(value)) emit([...values, value]);
    query = '';
    invalid = false;
    active = 0;
    input?.focus();
  }

  function remove(value: string) {
    emit(values.filter((item) => item !== value));
    input?.focus();
  }

  function commitText(): boolean {
    const text = query.trim();
    if (!text) return false;
    const option = options[active];
    if (option) {
      add(option.value);
      return true;
    }
    const value = parse?.(text);
    if (value) {
      add(value);
      return true;
    }
    invalid = true;
    return false;
  }

  async function onKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        open = true;
        return;
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      active = (active + delta + options.length) % Math.max(options.length, 1);
      await tick();
      document.getElementById(`${uid}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      if (open && options[active] && (query.trim() || options.length > 0)) {
        event.preventDefault();
        add(options[active].value);
      } else if (query.trim()) {
        event.preventDefault();
        commitText();
      }
    } else if (event.key === ',' || (event.key === 'Tab' && query.trim())) {
      if (query.trim() && commitText()) event.preventDefault();
      else if (event.key === ',') event.preventDefault();
    } else if (event.key === 'Backspace' && !query && values.length > 0) {
      remove(values[values.length - 1]);
    }
  }

  function onPointerdown(event: PointerEvent) {
    const target = event.target as Node;
    if (!open) return;
    if (field?.contains(target) || document.getElementById(listId)?.contains(target)) return;
    open = false;
  }

  // encabezado de grupo en la primera opción de cada grupo
  const rows = $derived(
    options.map((option, index) => ({
      ...option,
      heading:
        option.group && (index === 0 || options[index - 1].group !== option.group)
          ? option.group
          : null,
    })),
  );
</script>

<svelte:window onpointerdown={onPointerdown} />

<div>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    bind:this={field}
    class="k-input flex min-h-10 cursor-text flex-wrap items-center gap-1.5 py-1.5 focus-within:border-brand-500/60! focus-within:ring-2 focus-within:ring-brand-500/20 {disabled
      ? 'pointer-events-none opacity-50'
      : ''}"
    aria-invalid={ariaInvalid || invalid || undefined}
    onclick={() => input?.focus()}
  >
    {#each values as value (value)}
      {@const tag = view(value)}
      <span
        class="inline-flex max-w-full items-center gap-1 rounded-md border py-0.5 pl-1.5 pr-1 text-xs font-medium {tag.tone ===
        'brand'
          ? 'border-brand-500/30 bg-brand-500/10 text-brand-100'
          : 'border-white/10 bg-white/6 text-fg'}"
      >
        {#if tag.icon}<tag.icon class="h-3 w-3 shrink-0 opacity-70" />{/if}
        <span class="truncate">{tag.label}</span>
        <button
          type="button"
          class="grid h-4 w-4 shrink-0 place-items-center rounded text-fg-subtle hover:bg-white/10 hover:text-white"
          aria-label="Quitar {tag.label}"
          onclick={(event) => {
            event.stopPropagation();
            remove(value);
          }}
        >
          <X class="h-3 w-3" />
        </button>
      </span>
    {/each}
    <input
      bind:this={input}
      id={inputId}
      class="k-input-bare h-7 min-w-32 flex-1 px-1 py-0 text-sm"
      role="combobox"
      autocomplete="off"
      aria-label={label}
      aria-expanded={open && options.length > 0}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={open && options[active] ? `${uid}-opt-${active}` : undefined}
      aria-describedby={[describedby, invalid ? errorId : null].filter(Boolean).join(' ') ||
        undefined}
      placeholder={values.length === 0 ? placeholder : ''}
      {disabled}
      bind:value={query}
      oninput={() => {
        open = true;
        invalid = false;
        active = 0;
      }}
      onfocus={() => (open = true)}
      onkeydown={onKeydown}
    />
  </div>
  {#if invalid && invalidMessage}
    <p id={errorId} class="mt-1.5 text-xs text-red-300" role="alert">{invalidMessage}</p>
  {/if}
</div>

{#if open && options.length > 0}
  <ul
    id={listId}
    role="listbox"
    class="k-popover z-80 max-h-72 overflow-y-auto p-1.5"
    use:floating={{ anchor: field, matchWidth: true }}
    use:overlayLayer={() => (open = false)}
  >
    {#each rows as option, index (option.value)}
      {@const heading = option.heading}
      {#if heading}
        <li
          class="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle"
          role="presentation"
        >
          {heading}
        </li>
      {/if}
      <li
        id="{uid}-opt-{index}"
        role="option"
        aria-selected={index === active}
        class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm {index ===
        active
          ? 'bg-white/8 text-white'
          : 'text-fg'}"
        onpointerdown={(event) => {
          event.preventDefault();
          add(option.value);
        }}
        onpointerenter={() => (active = index)}
      >
        {#if option.icon}<option.icon class="h-4 w-4 shrink-0 text-fg-subtle" />{/if}
        <span class="min-w-0 flex-1 truncate">
          {#if !option.group && custom === option.value}<span class="text-fg-subtle"
              >+
            </span>{/if}{option.label}
        </span>
        {#if option.hint}<span class="truncate text-xs text-fg-subtle">{option.hint}</span>{/if}
      </li>
    {/each}
  </ul>
{/if}
