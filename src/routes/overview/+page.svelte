<script lang="ts">
  import { ArrowRight, FolderKanban, Search } from 'lucide-svelte';

  type ProjectRow = {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    status: 'active' | 'inactive';
    createdAt: string;
    updatedAt: string;
  };

  export let data: { projects: ProjectRow[] };

  let searchQuery = '';

  $: filteredProjects = data.projects.filter((project) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;

    return (
      project.name.toLowerCase().includes(query) ||
      project.slug.toLowerCase().includes(query) ||
      (project.description ?? '').toLowerCase().includes(query)
    );
  });
</script>

<svelte:head>
  <title>Overview - GitVault Suite</title>
</svelte:head>

<div class="mx-auto w-full max-w-7xl space-y-6">
  <section>
    <h2 class="text-2xl font-semibold text-slate-900">Overview</h2>
    <p class="mt-2 text-sm text-slate-600">Selecciona un proyecto activo para ver su detalle.</p>
  </section>

  <section class="relative max-w-md">
    <Search
      class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
    />
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Buscar proyectos..."
      class="field-input w-full rounded-md border py-2 pl-9 pr-3 text-sm outline-none transition"
    />
  </section>

  {#if filteredProjects.length === 0}
    <div
      class="rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center text-sm text-slate-600"
    >
      {data.projects.length === 0
        ? 'No hay proyectos activos.'
        : 'Ningún proyecto coincide con la búsqueda.'}
    </div>
  {:else}
    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each filteredProjects as project (project.id)}
        <a
          href={`/project/${project.slug}/overview`}
          class="group flex flex-col justify-between rounded-md border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300 hover:shadow-md"
        >
          <div>
            <div class="flex items-center gap-2">
              <FolderKanban class="h-5 w-5 shrink-0 text-slate-400" />
              <h3 class="truncate text-base font-semibold text-slate-900">{project.name}</h3>
            </div>
            {#if project.description}
              <p class="mt-2 line-clamp-2 text-sm text-slate-600">{project.description}</p>
            {/if}
          </div>

          <div class="mt-4 flex items-center justify-between">
            <span
              class="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
            >
              Active
            </span>
            <ArrowRight
              class="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-slate-900"
            />
          </div>
        </a>
      {/each}
    </section>
  {/if}
</div>
