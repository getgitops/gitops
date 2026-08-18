<script lang="ts">
  import { Database, ArrowRight } from 'lucide-svelte';
  import ProjectsPage from '../projects/+page.svelte';

  export let data: any;
</script>

<svelte:head>
  <title>Pulumi State - GitVault Suite</title>
</svelte:head>

{#if !data.hasBackends}
  <div class="mx-auto max-w-3xl rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm sm:p-12">
    <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
      <Database class="h-6 w-6" />
    </div>
    <h2 class="text-2xl font-semibold text-slate-900">No storage backend configured</h2>
    <p class="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
      Pulumi State needs at least one storage backend to read stacks and checkpoints.
    </p>
    <a
      href="/pulumi-state/backends"
      class="btn-primary mt-6 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium"
    >
      Configure backends
      <ArrowRight class="h-4 w-4" />
    </a>
  </div>
{:else}
  <ProjectsPage {data} />
{/if}