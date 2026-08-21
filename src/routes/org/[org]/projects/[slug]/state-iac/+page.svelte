<script lang="ts">
  import { GitBranch, HardDrive, Terminal, Layers } from 'lucide-svelte';
  import { page } from '$app/stores';

  $: canCreate = Boolean($page.data.canCreateStateIac);
</script>

<svelte:head>
  <title>State IaC - GitVault Suite</title>
</svelte:head>

<div class="space-y-6">
  <section class="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
    <div
      class="bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 px-6 py-8 text-white sm:px-8"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-indigo-200">
            GitOps
          </p>
          <h2 class="mt-2 text-3xl font-bold tracking-tight">State IaC</h2>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-indigo-100/80">
            Inspecciona el estado de Pulumi, backends de almacenamiento e historial de stacks para
            este proyecto.
          </p>
        </div>
        {#if canCreate}
          <a
            href="/how-to"
            class="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
          >
            <Terminal class="h-4 w-4" />
            CLI Guide
          </a>
        {/if}
      </div>
    </div>

    <div class="grid gap-4 p-6 sm:grid-cols-3 sm:p-8">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <Layers class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-sm font-semibold text-slate-900">Stacks</p>
        <p class="mt-1 text-sm leading-6 text-slate-600">Recursos, outputs y configuración.</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <HardDrive class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-sm font-semibold text-slate-900">Storage Backends</p>
        <p class="mt-1 text-sm leading-6 text-slate-600">Buckets S3 o GCS conectados.</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <GitBranch class="h-5 w-5 text-slate-900" />
        <p class="mt-3 text-sm font-semibold text-slate-900">History</p>
        <p class="mt-1 text-sm leading-6 text-slate-600">Checkpoints e historial de despliegues.</p>
      </div>
    </div>
  </section>

  <section
    class="rounded-[28px] border border-dashed border-slate-300 bg-white p-6 shadow-sm sm:p-8"
  >
    <h3 class="text-lg font-semibold text-slate-900">Próximo paso</h3>
    <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
      Esta pantalla es sólo la base visual. El siguiente paso será conectar el estado real de Pulumi
      para este proyecto.
    </p>
  </section>
</div>
