<script lang="ts">
  import { Shield, KeyRound, Lock, Sparkles } from '@lucide/svelte';
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
        <span
          class="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900"
        >
          <Sparkles class="h-4 w-4" />
          Coming soon
        </span>
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

  <section
    class="flex flex-col items-center rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm sm:p-14"
  >
    <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
      <Sparkles class="h-6 w-6" />
    </div>
    <h3 class="mt-4 text-lg font-semibold text-slate-900">Estamos trabajando en esto</h3>
    <p class="mt-2 max-w-md text-sm leading-6 text-slate-600">
      El módulo de Vault está en construcción. Pronto podrás administrar secretos, políticas y
      controles de acceso directamente desde aquí.
    </p>
  </section>
</div>