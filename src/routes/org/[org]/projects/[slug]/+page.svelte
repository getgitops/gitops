<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { CheckCircle, Save, Trash2 } from 'lucide-svelte';

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
  $: orgSlug = $page.params.org;

  let saving = false;
  let error = '';
  let success = '';

  let editName = project.name;
  let editSlug = project.slug;
  let editDescription = project.description ?? '';
  let editStatus: 'active' | 'inactive' = project.status;

  let deleteModalOpen = false;
  let deleteLoading = false;

  function flashSuccess(message: string) {
    success = message;
    setTimeout(() => {
      success = '';
    }, 2500);
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
          status: editStatus,
        }),
      });

      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);

      project = payload.project;
      flashSuccess('Project updated.');

      if (payload.project.slug !== project.slug) {
        await goto(`/org/${orgSlug}/projects/${payload.project.slug}`, { invalidateAll: true });
      }
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Failed to update project.';
    } finally {
      saving = false;
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
  <title>Información - {project.name}</title>
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
      <p class="text-xs text-slate-500">
        Created {formatDate(project.createdAt)} · Updated {formatDate(project.updatedAt)}
      </p>

      <button
        type="button"
        on:click={openDeleteModal}
        class="btn-danger inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
      >
        <Trash2 class="h-3.5 w-3.5" />
        Delete project
      </button>
    </div>

    <div class="space-y-4 px-4 py-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="block text-sm font-medium text-slate-700" for="edit-project-name"
            >Name</label
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
          Description
        </label>
        <textarea
          id="edit-project-description"
          bind:value={editDescription}
          rows="4"
          class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          placeholder="Optional description"
        ></textarea>
      </div>

      <div class="sm:w-48">
        <label class="block text-sm font-medium text-slate-700" for="edit-project-status"
          >Status</label
        >
        <select
          id="edit-project-status"
          bind:value={editStatus}
          class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
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
</div>

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
