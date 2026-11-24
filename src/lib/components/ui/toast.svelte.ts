/**
 * Avisos efímeros. Pon <Toaster /> una vez en el layout y llama a `toast.*` desde el cliente:
 *
 *   import { toast } from '#lib/components/ui';
 *   toast.success('Secreto guardado', 'DATABASE_URL · prod');
 *
 * Solo para eventos del navegador (clics, respuestas de fetch). No lo llames durante el SSR:
 * el estado es de módulo y se compartiría entre peticiones.
 */

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export type ToastItem = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Milisegundos; 0 = no se cierra solo. */
  duration: number;
};

type ToastOptions = { description?: string; duration?: number };

const MAX_VISIBLE = 4;
let nextId = 0;

export const toasts = $state<ToastItem[]>([]);
// Temporizadores fuera del estado reactivo: no hace falta que la UI los observe.
const timers: Record<number, ReturnType<typeof setTimeout>> = {};

function dismiss(id: number) {
  const index = toasts.findIndex((t) => t.id === id);
  if (index !== -1) toasts.splice(index, 1);
  clearTimeout(timers[id]);
  delete timers[id];
}

function push(tone: ToastTone, title: string, options: string | ToastOptions = {}) {
  const { description, duration = tone === 'error' ? 6000 : 4000 } =
    typeof options === 'string' ? { description: options } : options;
  const id = ++nextId;
  toasts.push({ id, tone, title, description, duration });
  while (toasts.length > MAX_VISIBLE) dismiss(toasts[0].id);
  if (duration > 0) timers[id] = setTimeout(() => dismiss(id), duration);
  return id;
}

export const toast = {
  success: (title: string, options?: string | ToastOptions) => push('success', title, options),
  error: (title: string, options?: string | ToastOptions) => push('error', title, options),
  warning: (title: string, options?: string | ToastOptions) => push('warning', title, options),
  info: (title: string, options?: string | ToastOptions) => push('info', title, options),
  dismiss,
};
