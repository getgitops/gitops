/**
 * Utilidades compartidas por los overlays de la UI (Modal, Drawer, DropdownMenu, Select,
 * CommandPalette). Son acciones de Svelte (`use:`) para que cada componente las combine.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ---------- Capas: Esc solo cierra el overlay que está arriba ----------

const layers: number[] = [];
let nextLayer = 0;

/**
 * Registra el nodo como una capa. Al pulsar Esc solo se avisa a la capa superior, así un
 * dropdown abierto dentro de un modal se cierra sin cerrar también el modal.
 */
export function overlayLayer(_node: HTMLElement, onEscape: () => void) {
  const id = nextLayer++;
  let handler = onEscape;
  layers.push(id);

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || layers[layers.length - 1] !== id) return;
    event.preventDefault();
    event.stopPropagation();
    handler();
  }

  window.addEventListener('keydown', onKeydown);
  return {
    update(next: () => void) {
      handler = next;
    },
    destroy() {
      window.removeEventListener('keydown', onKeydown);
      const index = layers.indexOf(id);
      if (index !== -1) layers.splice(index, 1);
    },
  };
}

// ---------- Bloqueo del scroll del fondo (con contador para overlays anidados) ----------

let locks = 0;
let previousOverflow = '';

export function scrollLock(_node: HTMLElement) {
  if (locks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  locks++;
  return {
    destroy() {
      locks--;
      if (locks === 0) document.body.style.overflow = previousOverflow;
    },
  };
}

// ---------- Foco atrapado dentro del overlay, y devuelto al cerrar ----------

export function focusableIn(node: HTMLElement) {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Mueve el foco al primer `[data-autofocus]` (o al propio panel), lo mantiene dentro con Tab y
 * lo devuelve al elemento que lo tenía cuando el overlay se cierra.
 */
export function focusTrap(node: HTMLElement) {
  const previous = document.activeElement as HTMLElement | null;

  requestAnimationFrame(() => {
    const target = node.querySelector<HTMLElement>('[data-autofocus]') ?? node;
    target.focus({ preventScroll: true });
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const items = focusableIn(node);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  node.addEventListener('keydown', onKeydown);
  return {
    destroy() {
      node.removeEventListener('keydown', onKeydown);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    },
  };
}
