<script lang="ts">
  import { Users } from 'lucide-svelte';
</script>

<svelte:head>
  <title>Usuarios y Grupos - Projects</title>
</svelte:head>

<div class="space-y-6">
  <section>
    <h3 class="text-xl font-semibold text-slate-900">Usuarios y Grupos</h3>
    <p class="mt-2 text-sm text-slate-600">
      Gestiona qué usuarios y grupos tienen acceso a cada proyecto.
    </p>
  </section>

  <div
    class="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center"
  >
    <Users class="h-8 w-8 text-slate-400" />
    <p class="text-sm font-medium text-slate-700">Próximamente</p>
    <p class="max-w-sm text-sm text-slate-500">
      La gestión de usuarios y grupos por proyecto todavía no está disponible.
    </p>
  </div>
</div>
