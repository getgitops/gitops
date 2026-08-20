<script lang="ts">
  import { FolderKanban } from 'lucide-svelte';

  type ProjectRow = {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    status: 'active' | 'inactive';
    createdAt: string;
    updatedAt: string;
  };

  export let data: { project: ProjectRow };

  $: project = data.project;

  function formatDate(value?: string) {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }
</script>

<svelte:head>
  <title>Overview - {project.name}</title>
</svelte:head>

<div class="space-y-6">
  <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
    <div class="flex items-center gap-3 border-b border-slate-200 px-4 py-4">
      <FolderKanban class="h-5 w-5 text-slate-900" />
      <div>
        <h3 class="text-lg font-semibold text-slate-900">{project.name}</h3>
        <p class="text-xs text-slate-500">Slug: {project.slug}</p>
      </div>
    </div>

    <dl class="grid gap-4 px-4 py-4 sm:grid-cols-2">
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Estado</dt>
        <dd class="mt-1">
          <span
            class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {project.status ===
            'active'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-slate-100 text-slate-600'}"
          >
            {project.status === 'active' ? 'Active' : 'Inactive'}
          </span>
        </dd>
      </div>

      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Descripción</dt>
        <dd class="mt-1 text-sm text-slate-700">{project.description || 'Sin descripción.'}</dd>
      </div>

      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Creado</dt>
        <dd class="mt-1 text-sm text-slate-700">{formatDate(project.createdAt)}</dd>
      </div>

      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Actualizado</dt>
        <dd class="mt-1 text-sm text-slate-700">{formatDate(project.updatedAt)}</dd>
      </div>
    </dl>
  </section>
</div>
