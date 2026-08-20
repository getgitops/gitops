<script lang="ts">
  import { Shield } from 'lucide-svelte';
</script>

<svelte:head>
  <title>Roles y Permisos - Projects</title>
</svelte:head>

<div class="space-y-6">
  <section>
    <h3 class="text-xl font-semibold text-slate-900">Roles y Permisos</h3>
    <p class="mt-2 text-sm text-slate-600">Define roles y permisos específicos por proyecto.</p>
  </section>

  <div
    class="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center"
  >
    <Shield class="h-8 w-8 text-slate-400" />
    <p class="text-sm font-medium text-slate-700">Próximamente</p>
    <p class="max-w-sm text-sm text-slate-500">
      Los roles y permisos por proyecto todavía no están disponibles.
    </p>
  </div>
</div>
