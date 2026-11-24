<!--
  Elemento de un DropdownMenu. Cierra el menú al pulsarlo (salvo `keepOpen` o `checked`).
  - `href` lo convierte en enlace.
  - `checked` lo convierte en una opción marcable (menuitemcheckbox) que no cierra el menú.
-->
<script lang="ts">
  import { getContext, type Component, type Snippet } from 'svelte';
  import { Check } from '@lucide/svelte';
  import { DROPDOWN_CONTEXT, type DropdownContext } from './DropdownMenu.svelte';

  type Props = {
    icon?: Component<any>;
    /** Teclas que se muestran a la derecha, p. ej. ['⌘', 'E']. */
    shortcut?: string[];
    tone?: 'default' | 'danger' | 'brand';
    href?: string;
    disabled?: boolean;
    checked?: boolean;
    keepOpen?: boolean;
    onclick?: (event: MouseEvent) => void;
    children: Snippet;
  };

  let {
    icon: Icon,
    shortcut,
    tone = 'default',
    href,
    disabled = false,
    checked,
    keepOpen = false,
    onclick,
    children,
  }: Props = $props();

  const dropdown = getContext<DropdownContext | undefined>(DROPDOWN_CONTEXT);
  const isCheckbox = $derived(checked !== undefined);

  const toneClass = {
    default: '',
    danger: 'text-red-300 hover:bg-red-500/10! focus-visible:bg-red-500/10!',
    brand: 'text-brand-300',
  };

  function handleClick(event: MouseEvent) {
    onclick?.(event);
    if (!keepOpen && !isCheckbox) dropdown?.close();
  }
</script>

{#snippet content()}
  {#if isCheckbox}
    <span
      class="grid h-4 w-4 shrink-0 place-items-center rounded-[0.3rem] border {checked
        ? 'border-brand-500 bg-brand-500 text-white'
        : 'border-white/20 bg-ink-900'}"
    >
      {#if checked}<Check class="h-3 w-3" strokeWidth={3} />{/if}
    </span>
  {:else if Icon}
    <Icon class="h-4 w-4 shrink-0 {tone === 'default' ? 'text-fg-subtle' : ''}" />
  {/if}
  <span class="min-w-0 flex-1 truncate">{@render children()}</span>
  {#if shortcut}
    <span class="ml-auto flex gap-1"
      >{#each shortcut as key}<span class="k-kbd">{key}</span>{/each}</span
    >
  {/if}
{/snippet}

{#if href && !disabled}
  <a {href} role="menuitem" class="k-menu-item {toneClass[tone]}" onclick={handleClick}
    >{@render content()}</a
  >
{:else}
  <button
    type="button"
    role={isCheckbox ? 'menuitemcheckbox' : 'menuitem'}
    aria-checked={isCheckbox ? checked : undefined}
    class="k-menu-item {toneClass[tone]} disabled:cursor-not-allowed disabled:opacity-40"
    {disabled}
    onclick={handleClick}
  >
    {@render content()}
  </button>
{/if}
