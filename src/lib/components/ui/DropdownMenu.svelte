<!--
  Popover anclado a un disparador: menús de acciones, paneles (notificaciones) y listas (Select).
  - El disparador es un snippet que recibe las props que debe extender en su botón.
  - Se cierra con clic fuera, con Esc (devuelve el foco al disparador) y al elegir un MenuItem.
  - Con role="menu" o "listbox", ↑ ↓ Inicio Fin mueven el foco entre los elementos.

  Uso:
    <DropdownMenu label="Acciones">
      {#snippet trigger(props)}
        <button class="k-btn k-btn-secondary" {...props}>Acciones</button>
      {/snippet}
      <MenuItem icon={Pencil} onclick={edit}>Editar</MenuItem>
    </DropdownMenu>
-->
<script lang="ts" module>
  export type DropdownTriggerProps = {
    id: string;
    type: 'button';
    'aria-haspopup': 'menu' | 'dialog' | 'listbox';
    'aria-expanded': boolean;
    'aria-controls': string;
    onclick: (event: MouseEvent) => void;
    onkeydown: (event: KeyboardEvent) => void;
  };

  export type DropdownContext = { close: (restoreFocus?: boolean) => void };
  export const DROPDOWN_CONTEXT = Symbol('dropdown');
</script>

<script lang="ts">
  import { setContext, tick, type Snippet } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { floating, overlayLayer } from './overlay';

  type Props = {
    open?: boolean;
    /** Nombre accesible del panel. */
    label: string;
    role?: 'menu' | 'dialog' | 'listbox';
    align?: 'start' | 'end';
    /** Clases extra del panel (ancho, padding…). Por defecto `w-56 p-1.5`. */
    class?: string;
    /** Selector del elemento que recibe el foco al abrir. Por defecto, el primer elemento del menú. */
    initialFocus?: string;
    /** Ocupa todo el ancho del contenedor (selects, selector de contexto). */
    block?: boolean;
    /** Id del botón disparador (para enlazarlo con un <label for>). */
    triggerId?: string;
    trigger: Snippet<[DropdownTriggerProps]>;
    children: Snippet;
    onopenchange?: (open: boolean) => void;
  };

  let {
    open = $bindable(false),
    label,
    role = 'menu',
    align = 'start',
    class: panelClass = 'w-56 p-1.5',
    initialFocus,
    block = false,
    triggerId: customTriggerId,
    trigger,
    children,
    onopenchange,
  }: Props = $props();

  const uid = $props.id();
  const triggerId = $derived(customTriggerId ?? `${uid}-trigger`);
  const panelId = `${uid}-panel`;
  const ITEMS =
    '[role="menuitem"]:not([disabled]),[role="menuitemcheckbox"]:not([disabled]),[role="menuitemradio"]:not([disabled]),[role="option"]:not([disabled]):not([aria-disabled="true"])';

  let root = $state<HTMLElement>();
  let panel = $state<HTMLElement>();

  function setOpen(next: boolean) {
    if (open === next) return;
    open = next;
    onopenchange?.(next);
  }

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) document.getElementById(triggerId)?.focus();
  }

  setContext<DropdownContext>(DROPDOWN_CONTEXT, { close });

  async function focusInitial() {
    await tick();
    if (!panel) return;
    const target = initialFocus
      ? panel.querySelector<HTMLElement>(initialFocus)
      : role === 'dialog'
        ? null
        : panel.querySelector<HTMLElement>(ITEMS);
    (target ?? panel).focus({ preventScroll: true });
  }

  $effect(() => {
    if (open) focusInitial();
  });

  const triggerProps: DropdownTriggerProps = $derived({
    id: triggerId,
    type: 'button',
    'aria-haspopup': role,
    'aria-expanded': open,
    'aria-controls': panelId,
    onclick: () => setOpen(!open),
    onkeydown: (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' && !open) {
        event.preventDefault();
        setOpen(true);
      }
    },
  });

  function onWindowPointerdown(event: PointerEvent) {
    const target = event.target as Node;
    // el panel vive en <body> (ver `floating`), fuera de `root`
    if (open && root && !root.contains(target) && !panel?.contains(target)) setOpen(false);
  }

  function onPanelKeydown(event: KeyboardEvent) {
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (role === 'dialog' || !panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(ITEMS));
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const inTextField = (event.target as HTMLElement).tagName === 'INPUT';
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = index <= 0 ? items.length - 1 : index - 1;
    else if (event.key === 'Home' && !inTextField) next = 0;
    else if (event.key === 'End' && !inTextField) next = items.length - 1;
    if (next === null) return;
    event.preventDefault();
    items[next].focus();
  }
</script>

<svelte:window onpointerdown={onWindowPointerdown} />

<div class="relative {block ? 'block w-full' : 'inline-block'}" bind:this={root}>
  {@render trigger(triggerProps)}

  {#if open}
    <div
      bind:this={panel}
      id={panelId}
      {role}
      aria-label={label}
      tabindex="-1"
      class="k-popover z-80 overflow-y-auto outline-none {panelClass}"
      use:floating={{
        anchor: root?.querySelector<HTMLElement>(`#${CSS.escape(triggerId)}`) ?? root,
        align,
        matchWidth: block,
      }}
      use:overlayLayer={() => close()}
      onkeydown={onPanelKeydown}
      transition:fly={{ y: -4, duration: 120, easing: cubicOut }}
    >
      {@render children()}
    </div>
  {/if}
</div>
