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

// ---------- Paneles flotantes: fuera del flujo para que ningún overflow los recorte ----------

export type FloatingOptions = {
  /** Elemento al que se ancla el panel (el botón que lo abre). */
  anchor: HTMLElement | null | undefined;
  align?: 'start' | 'end';
  /** El panel mide al menos lo mismo que el ancla (selects). */
  matchWidth?: boolean;
  offset?: number;
};

const VIEWPORT_MARGIN = 8;

/**
 * Mueve el panel a <body> y lo coloca con `position: fixed` junto a su ancla. Así no lo recorta
 * el `overflow` de una tabla con scroll ni el cuerpo de un modal. Si no cabe debajo, se abre
 * hacia arriba; se recoloca al hacer scroll (en cualquier contenedor) o al redimensionar.
 */
export function floating(node: HTMLElement, initial: FloatingOptions) {
  let options = initial;
  document.body.appendChild(node);
  node.style.position = 'fixed';
  node.style.top = '0px';
  node.style.left = '0px';

  function place() {
    const anchor = options.anchor;
    if (!anchor || !anchor.isConnected) return;
    const gap = options.offset ?? 6;
    const rect = anchor.getBoundingClientRect();
    if (options.matchWidth) node.style.minWidth = `${rect.width}px`;
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    const below = window.innerHeight - rect.bottom - gap - VIEWPORT_MARGIN;
    const above = rect.top - gap - VIEWPORT_MARGIN;
    const top = height > below && above > below ? rect.top - gap - height : rect.bottom + gap;
    let left = options.align === 'end' ? rect.right - width : rect.left;
    left = Math.min(Math.max(left, VIEWPORT_MARGIN), window.innerWidth - width - VIEWPORT_MARGIN);
    node.style.top = `${Math.max(top, VIEWPORT_MARGIN)}px`;
    node.style.left = `${left}px`;
    // si tampoco cabe arriba, el panel se acorta y hace scroll
    node.style.maxHeight = `${Math.max(below, above, 160)}px`;
  }

  place();
  const observer = new ResizeObserver(place);
  observer.observe(node);
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);

  return {
    update(next: FloatingOptions) {
      options = next;
      place();
    },
    destroy() {
      observer.disconnect();
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      node.remove();
    },
  };
}
