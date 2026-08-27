<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { ShieldAlert, FileQuestion, ServerCrash, ArrowLeft, Home } from '@lucide/svelte';

  $: status = $page.status;
  $: message = $page.error?.message;

  $: content =
    status === 404
      ? {
          icon: FileQuestion,
          title: 'Página no encontrada',
          description: 'La página que buscas no existe o fue movida a otra ubicación.',
          accent: 'slate',
        }
      : status === 403
        ? {
            icon: ShieldAlert,
            title: 'No tienes permisos',
            description: 'No cuentas con los permisos necesarios para acceder a este recurso.',
            accent: 'amber',
          }
        : {
            icon: ServerCrash,
            title: 'Algo salió mal',
            description: message || 'Ocurrió un error inesperado. Intenta nuevamente más tarde.',
            accent: 'red',
          };
</script>

<div class="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-16">
  <div class="w-full max-w-md text-center">
    <div
      class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border {content.accent ===
      'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-600'
        : content.accent === 'red'
          ? 'border-red-200 bg-red-50 text-red-600'
          : 'border-slate-200 bg-slate-100 text-slate-600'}"
    >
      <svelte:component this={content.icon} class="h-7 w-7" />
    </div>

    <p class="mt-6 text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">
      Error {status}
    </p>
    <h1 class="mt-2 text-2xl font-semibold text-slate-900">{content.title}</h1>
    <p class="mt-3 text-sm leading-relaxed text-slate-600">{content.description}</p>

    <div class="mt-8 flex items-center justify-center gap-3">
      <a href="/" class="btn-primary inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium">
        <Home class="h-4 w-4" />
        Ir al inicio
      </a>
      <button
        type="button"
        on:click={() => history.back()}
        class="btn-secondary inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
      >
        <ArrowLeft class="h-4 w-4" />
        Volver
      </button>
    </div>
  </div>
</div>
