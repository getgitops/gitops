<script lang="ts">
  import { Shield, KeyRound, Lock, Plus } from '@lucide/svelte';
  import { page } from '$app/stores';

  $: canCreate = Boolean($page.data.canCreateVault);
</script>

<svelte:head>
  <title>Vault - GitOps</title>
</svelte:head>

<div class="space-y-6">
  <section class="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
    <div class="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-8 text-white sm:px-8">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-300">Seguridad</p>
          <h2 class="mt-2 text-3xl font-bold tracking-tight">Vault</h2>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Centraliza secretos, credenciales y controles de acceso para los futuros módulos de seguridad.
          </p>
        </div>
        {#if canCreate}
          <button
            class="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
          >
            <Plus class="h-4 w-4" />
            Nuevo secreto
          </button>
        {/if}
      </div>
    </div>

    <div class="grid gap-4 p-6 sm:grid-cols-3 sm:p-8">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <Shield class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-sm font-semibold text-slate-900">Policies</p>
        <p class="mt-1 text-sm leading-6 text-slate-600">Reglas y límites de acceso por módulo.</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <KeyRound class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-sm font-semibold text-slate-900">Secrets</p>
        <p class="mt-1 text-sm leading-6 text-slate-600">Variables, tokens y claves compartidas.</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <Lock class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-sm font-semibold text-slate-900">Access</p>
        <p class="mt-1 text-sm leading-6 text-slate-600">Autorización y separación por rol.</p>
      </div>
    </div>
  </section>

  <section class="rounded-[28px] border border-dashed border-slate-300 bg-white p-6 shadow-sm sm:p-8">
    <h3 class="text-lg font-semibold text-slate-900">Próximo paso</h3>
    <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
      Esta pantalla es sólo la base visual. El siguiente paso será conectar un modelo de datos para secretos y políticas.
    </p>
  </section>
</div>