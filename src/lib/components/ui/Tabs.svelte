<!--
  Pestañas accesibles (tablist con foco itinerante: ← → Inicio Fin).
  - variant="underline": navegación entre secciones de una página.
  - variant="segmented": control compacto para filtros o periodos (1h · 24h · 7d).
  Los paneles los pinta quien lo usa; para enlazarlos, dale al panel
  id={tabPanelId(idPrefix, valor)} y aria-labelledby={tabId(idPrefix, valor)}.
-->
<script lang="ts" module>
  export type TabItem = {
    value: string;
    label: string;
    count?: number | string;
    disabled?: boolean;
  };

  export const tabId = (prefix: string, value: string) => `${prefix}-tab-${value}`;
  export const tabPanelId = (prefix: string, value: string) => `${prefix}-panel-${value}`;
</script>

<script lang="ts">
  type Props = {
    items: TabItem[];
    value?: string;
    /** Nombre accesible del grupo. */
    label: string;
    variant?: 'underline' | 'segmented';
    size?: 'sm' | 'md';
    /** Prefijo de los ids de pestañas y paneles. */
    idPrefix?: string;
    onchange?: (value: string) => void;
  };

  let {
    items,
    value = $bindable(items[0]?.value ?? ''),
    label,
    variant = 'underline',
    size = 'md',
    idPrefix,
    onchange,
  }: Props = $props();

  const uid = $props.id();
  const prefix = $derived(idPrefix ?? uid);
  let list = $state<HTMLElement>();

  function select(next: string) {
    if (next === value) return;
    value = next;
    onchange?.(next);
  }

  function onKeydown(event: KeyboardEvent) {
    const enabled = items.filter((i) => !i.disabled);
    const index = enabled.findIndex((i) => i.value === value);
    let next: TabItem | undefined;
    if (event.key === 'ArrowRight') next = enabled[(index + 1) % enabled.length];
    else if (event.key === 'ArrowLeft')
      next = enabled[(index - 1 + enabled.length) % enabled.length];
    else if (event.key === 'Home') next = enabled[0];
    else if (event.key === 'End') next = enabled[enabled.length - 1];
    if (!next) return;
    event.preventDefault();
    select(next.value);
    list?.querySelector<HTMLElement>(`#${CSS.escape(tabId(prefix, next.value))}`)?.focus();
  }
</script>

{#if variant === 'underline'}
  <div class="border-b border-white/8">
    <div
      bind:this={list}
      class="-mb-px flex gap-6 overflow-x-auto"
      role="tablist"
      aria-label={label}
      tabindex="-1"
      onkeydown={onKeydown}
    >
      {#each items as item (item.value)}
        {@const active = item.value === value}
        <button
          type="button"
          role="tab"
          id={tabId(prefix, item.value)}
          aria-selected={active}
          aria-controls={tabPanelId(prefix, item.value)}
          tabindex={active ? 0 : -1}
          disabled={item.disabled}
          onclick={() => select(item.value)}
          class="flex items-center gap-2 whitespace-nowrap border-b-2 font-medium transition-colors focus-visible:text-white focus-visible:outline-none disabled:opacity-40 {size ===
          'sm'
            ? 'pb-2 text-xs'
            : 'pb-3 text-sm'} {active
            ? 'border-brand-500 text-white'
            : 'border-transparent text-fg-subtle hover:text-fg'}"
        >
          {item.label}
          {#if item.count !== undefined}<span class="k-badge h-5 px-1.5 text-[11px]"
              >{item.count}</span
            >{/if}
        </button>
      {/each}
    </div>
  </div>
{:else}
  <div
    bind:this={list}
    class="inline-flex rounded-[0.625rem] border border-white/10 bg-ink-900 p-1"
    role="tablist"
    aria-label={label}
    tabindex="-1"
    onkeydown={onKeydown}
  >
    {#each items as item (item.value)}
      {@const active = item.value === value}
      <button
        type="button"
        role="tab"
        id={tabId(prefix, item.value)}
        aria-selected={active}
        aria-controls={tabPanelId(prefix, item.value)}
        tabindex={active ? 0 : -1}
        disabled={item.disabled}
        onclick={() => select(item.value)}
        class="rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-40 {size ===
        'sm'
          ? 'h-6 px-2.5 text-xs'
          : 'h-7 px-3 text-xs'} {active
          ? 'bg-white/10 text-white'
          : 'text-fg-subtle hover:text-fg'}"
      >
        {item.label}
      </button>
    {/each}
  </div>
{/if}
