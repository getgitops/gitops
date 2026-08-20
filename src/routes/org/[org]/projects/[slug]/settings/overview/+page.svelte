<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import {
    Archive,
    BarChart3,
    Building2,
    CheckCircle,
    Copy,
    GitBranch,
    Save,
    Shield,
    Trash2,
  } from 'lucide-svelte';

  type ProjectModules = {
    vault: boolean;
    openreport: boolean;
    stateiac: boolean;
  };

  type ProjectRow = {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    status: 'active' | 'inactive';
    modules: ProjectModules;
    createdAt: string;
    updatedAt: string;
  };

  export let data: { project: ProjectRow };

  $: project = data.project;
  $: orgSlug = $page.params.org;

  let saving = false;
  let error = '';
  let success = '';
  let slugCopied = false;

  let editName = data.project.name;
  let editSlug = data.project.slug;
  let editDescription = data.project.description ?? '';
  let editModules: ProjectModules = { ...data.project.modules };

  const moduleOptions: { key: keyof ProjectModules; label: string; icon: typeof Shield }[] = [
    { key: 'vault', label: 'Vault', icon: Shield },
    { key: 'openreport', label: 'Open Report', icon: BarChart3 },
    { key: 'stateiac', label: 'State IaC', icon: GitBranch },
  ];

  let deleteModalOpen = false;
  let deleteLoading = false;
  let archiveModalOpen = false;
  let archiveLoading = false;

  function flashSuccess(message: string) {
    success = message;
    setTimeout(() => {
      success = '';
    }, 2500);
  }

  function toggleModule(key: keyof ProjectModules) {
    editModules = { ...editModules, [key]: !editModules[key] };
  }

  async function copySlug() {
    try {
      await navigator.clipboard.writeText(project.slug);
      slugCopied = true;
      setTimeout(() => {
        slugCopied = false;
      }, 2000);
    } catch {
      error = 'Failed to copy slug.';
    }
  }

  async function saveProject() {
    error = '';
    if (!editName.trim()) {
      error = 'Project name is required.';
      return;
    }

    saving = true;
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          slug: editSlug.trim(),
          description: editDescription.trim(),
          modules: editModules,
        }),
      });

      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);

      project = payload.project;
      editModules = { ...project.modules };
      flashSuccess('Project updated.');

      if (payload.project.slug !== project.slug) {
        await goto(`/org/${orgSlug}/projects/${payload.project.slug}/settings/overview`, {
          invalidateAll: true,
        });
      }
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Failed to update project.';
    } finally {
      saving = false;
    }
  }

  function openArchiveModal() {
    error = '';
    archiveModalOpen = true;
  }

  function closeArchiveModal() {
    archiveModalOpen = false;
  }

  async function confirmArchive() {
    error = '';
    archiveLoading = true;

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'inactive' }),
      });

      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);

      project = payload.project;
      closeArchiveModal();
      flashSuccess('Project archived.');
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Failed to archive project.';
    } finally {
      archiveLoading = false;
    }
  }

  function openDeleteModal() {
    error = '';
    deleteModalOpen = true;
  }

  function closeDeleteModal() {
    deleteModalOpen = false;
  }

  async function confirmDelete() {
    error = '';
    deleteLoading = true;

    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);

      await goto('/settings/projects');
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Failed to delete project.';
      deleteLoading = false;
    }
  }

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
  <title>Configuración - {project.name}</title>
</svelte:head>

<div class="space-y-6">
  {#if error}
    <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </div>
  {/if}

  {#if success}
    <div
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
    >
      <span class="inline-flex items-center gap-2"><CheckCircle class="h-4 w-4" /> {success}</span>
    </div>
  {/if}

  <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
    <div
      class="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p class="text-xs text-slate-500">Fecha de creación: {formatDate(project.createdAt)}</p>

      <button
        type="button"
        on:click={copySlug}
        class="btn-secondary inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
      >
        <Copy class="h-3.5 w-3.5" />
        {slugCopied ? 'Slug copiado' : 'Copy Project Slug'}
      </button>
    </div>

    <div class="space-y-4 px-4 py-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="block text-sm font-medium text-slate-700" for="edit-project-name"
            >Nombre</label
          >
          <input
            id="edit-project-name"
            type="text"
            bind:value={editName}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="edit-project-slug"
            >Slug</label
          >
          <input
            id="edit-project-slug"
            type="text"
            bind:value={editSlug}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-slate-700" for="edit-project-description">
          Descripción
        </label>
        <textarea
          id="edit-project-description"
          bind:value={editDescription}
          rows="4"
          class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          placeholder="Optional description"
        ></textarea>
      </div>
    </div>

    <div class="border-t border-slate-200 px-4 py-4">
      <p class="text-sm font-medium text-slate-700">Modules</p>
      <p class="mt-1 text-xs text-slate-500">
        Pulsa en una card para activar o desactivar el módulo.
      </p>

      <div class="mt-3 grid gap-3 sm:grid-cols-3">
        {#each moduleOptions as option (option.key)}
          <button
            type="button"
            on:click={() => toggleModule(option.key)}
            class="flex flex-col gap-3 rounded-md border px-4 py-3 text-left transition-colors {editModules[
              option.key
            ]
              ? 'border-slate-200 bg-white'
              : 'border-slate-200 bg-slate-100 text-slate-400'}"
          >
            <div class="flex items-center justify-between">
              <span
                class="flex items-center gap-2 text-sm font-medium {editModules[option.key]
                  ? 'text-slate-900'
                  : 'text-slate-500'}"
              >
                <svelte:component
                  this={option.icon}
                  class="h-4 w-4 {editModules[option.key] ? 'text-slate-500' : 'text-slate-400'}"
                />
                {option.label}
              </span>
            </div>
            <span
              class="inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium {editModules[
                option.key
              ]
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-slate-200 text-slate-500'}"
            >
              {editModules[option.key] ? 'Activo' : 'Desactivado'}
            </span>
          </button>
        {/each}
      </div>
    </div>

    <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
      <button
        type="button"
        on:click={saveProject}
        disabled={saving}
        class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
      >
        <Save class="h-4 w-4" />
        {saving ? 'Saving...' : 'Save changes'}
      </button>
    </div>
  </section>

  <section class="overflow-hidden rounded-md border border-red-200 bg-white">
    <div class="border-b border-red-200 bg-red-50 px-4 py-3">
      <h3 class="text-sm font-semibold text-red-800">Danger Zone</h3>
    </div>

    <div class="divide-y divide-slate-100">
      <div class="flex items-center justify-between gap-4 px-4 py-4">
        <div>
          <p class="text-sm font-medium text-slate-900">Transferir a organización</p>
          <p class="mt-1 text-xs text-slate-500">Mueve este proyecto a otra organización.</p>
        </div>
        <button
          type="button"
          disabled
          title="Próximamente"
          class="btn-secondary inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium opacity-50"
        >
          <Building2 class="h-3.5 w-3.5" />
          Transferir
        </button>
      </div>

      <div class="flex items-center justify-between gap-4 px-4 py-4">
        <div>
          <p class="text-sm font-medium text-slate-900">Archivar proyecto</p>
          <p class="mt-1 text-xs text-slate-500">
            El proyecto pasará a estado inactivo y dejará de listarse como activo.
          </p>
        </div>
        <button
          type="button"
          on:click={openArchiveModal}
          class="btn-secondary inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
        >
          <Archive class="h-3.5 w-3.5" />
          Archivar
        </button>
      </div>

      <div class="flex items-center justify-between gap-4 px-4 py-4">
        <div>
          <p class="text-sm font-medium text-slate-900">Delete project</p>
          <p class="mt-1 text-xs text-slate-500">Esta acción no se puede deshacer.</p>
        </div>
        <button
          type="button"
          on:click={openDeleteModal}
          class="btn-danger inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
        >
          <Trash2 class="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  </section>
</div>

{#if archiveModalOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={closeArchiveModal}
    aria-label="Close archive project modal"
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Archive project modal"
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">Archive project</h5>
      </div>

      <div class="px-4 py-4 text-sm text-slate-600">
        Are you sure you want to archive <span class="font-medium text-slate-900"
          >{project.name}</span
        >? It will be marked as inactive.
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button
          type="button"
          on:click={closeArchiveModal}
          class="btn-secondary rounded-md px-3 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={confirmArchive}
          disabled={archiveLoading}
          class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
        >
          <Archive class="h-4 w-4" />
          {archiveLoading ? 'Archiving...' : 'Archive project'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if deleteModalOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={closeDeleteModal}
    aria-label="Close delete project modal"
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Delete project modal"
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">Delete project</h5>
      </div>

      <div class="px-4 py-4 text-sm text-slate-600">
        Are you sure you want to delete <span class="font-medium text-slate-900"
          >{project.name}</span
        >? This action cannot be undone.
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button
          type="button"
          on:click={closeDeleteModal}
          class="btn-secondary rounded-md px-3 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={confirmDelete}
          disabled={deleteLoading}
          class="btn-danger inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
        >
          <Trash2 class="h-4 w-4" />
          {deleteLoading ? 'Deleting...' : 'Delete project'}
        </button>
      </div>
    </div>
  </div>
{/if}
