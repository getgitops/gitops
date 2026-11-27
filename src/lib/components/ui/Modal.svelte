<!--
  Modal / drawer accesible.
  - Esc (solo si es la capa superior), clic en el fondo y botón X cierran.
  - Bloquea el scroll del fondo, atrapa el foco y lo devuelve al cerrar.
  - El foco inicial va al primer elemento con `data-autofocus`, o al panel.
  - Para un formulario, pon `id` en el <form> y `form="ese-id"` en el botón del footer.

  Uso:
    <Modal bind:open title="Nuevo secreto" description="…">
      …cuerpo…
      {#snippet footer()}<button class="k-btn k-btn-primary">Guardar</button>{/snippet}
    </Modal>
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { X } from '@lucide/svelte';
  import { focusTrap, overlayLayer, scrollLock } from './overlay';

  type Props = {
    open: boolean;
    title: string;
    description?: string;
    /** Ancho del panel. */
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    /** `right` lo convierte en un drawer lateral. */
    placement?: 'center' | 'right';
    /** `alertdialog` para confirmaciones destructivas. */
    role?: 'dialog' | 'alertdialog';
    /** Si es false, ni Esc ni el fondo lo cierran (p. ej. mientras se envía). */
    dismissible?: boolean;
    onclose?: () => void;
    /** Icono a la izquierda del título. */
    icon?: Snippet;
    /** Cabecera completa a medida; recibe el id que debe llevar el título. */
    header?: Snippet<[titleId: string]>;
    children?: Snippet;
    footer?: Snippet;
    /** Sin padding en el cuerpo (listas, tablas). */
    flush?: boolean;
  };

  let {
    open = $bindable(false),
    title,
    description,
    size = 'md',
    placement = 'center',
    role = 'dialog',
    dismissible = true,
    onclose,
    icon,
    header,
    children,
    footer,
    flush = false,
  }: Props = $props();

  const uid = $props.id();
  const titleId = `${uid}-title`;
  const descriptionId = `${uid}-description`;

  const widths = {
    center: {
      sm: 'max-w-md',
      md: 'max-w-lg',
      lg: 'max-w-2xl',
      xl: 'max-w-4xl',
      '2xl': 'max-w-6xl',
    },
    right: { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-3xl', '2xl': 'max-w-5xl' },
  };

  function panelTransition(node: Element) {
    return placement === 'center'
      ? scale(node, { start: 0.96, duration: 150, easing: cubicOut })
      : fly(node, { x: 420, duration: 220, easing: cubicOut });
  }

  function close() {
    if (!dismissible) return;
    open = false;
    onclose?.();
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 {placement === 'center' ? 'grid place-items-center p-4' : ''}"
    use:scrollLock
    use:overlayLayer={close}
  >
    <button
      type="button"
      tabindex="-1"
      class="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      aria-label="Cerrar"
      onclick={close}
      transition:fade={{ duration: 120 }}
    ></button>

    <div
      class={placement === 'center'
        ? `k-popover relative flex max-h-[85vh] w-full flex-col overflow-hidden outline-none ${widths.center[size]}`
        : `absolute inset-y-0 right-0 flex w-full flex-col border-l border-white/10 bg-ink-900 shadow-2xl outline-none ${widths.right[size]}`}
      {role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      tabindex="-1"
      use:focusTrap
      transition:panelTransition
    >
      {#if header}
        {@render header(titleId)}
      {:else}
        <div class="flex items-start gap-4 border-b border-white/8 px-6 py-5">
          {#if icon}{@render icon()}{/if}
          <div class="min-w-0 flex-1">
            <h2 id={titleId} class="text-lg font-semibold text-white">{title}</h2>
            {#if description}<p id={descriptionId} class="mt-0.5 text-sm text-fg-muted">
                {description}
              </p>{/if}
          </div>
          {#if dismissible}
            <button
              type="button"
              class="k-btn k-btn-ghost k-btn-icon k-btn-sm -mr-2 -mt-1"
              aria-label="Cerrar"
              onclick={close}
            >
              <X class="h-4 w-4" />
            </button>
          {/if}
        </div>
      {/if}

      {#if children}
        <div class="flex-1 overflow-y-auto {flush ? '' : 'px-6 py-5'}">
          {@render children()}
        </div>
      {/if}

      {#if footer}
        <div
          class="flex flex-wrap items-center justify-end gap-2 border-t border-white/8 bg-ink-900/60 px-6 py-4"
        >
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}
