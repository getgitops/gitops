<script lang="ts">
  import { onMount } from 'svelte';
  import { CheckCircle, Eye, FolderKanban, Plus, Search, Trash2 } from 'lucide-svelte';

  export let data: { organization: { slug: string } };

  type ProjectRow = {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    status: 'active' | 'inactive';
    createdAt: string;
    updatedAt: string;
  };

  let projects: ProjectRow[] = [];
  let loading = false;
  let error = '';
  let success = '';

  let searchQuery = '';
  let statusFilter: 'all' | 'active' | 'inactive' = 'all';

  let createModalOpen = false;
  let creating = false;
  let createError = '';
  let newName = '';
  let newSlug = '';
  let newDescription = '';
  let newStatus: 'active' | 'inactive' = 'active';

  let deleteModalProject: ProjectRow | null = null;
  let deleteLoading = false;
  let deleteError = '';

  onMount(fetchProjects);

  async function fetchProjects() {
    loading = true;
    error = '';

    try {
      const res = await fetch('/api/projects');
      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);
      projects = payload.projects || [];
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Failed to load projects.';
    } finally {
      loading = false;
    }
  }

  function flashSuccess(message: string) {
    success = message;
    setTimeout(() => {
      success = '';
    }, 2500);
  }

  $: filteredProjects = projects.filter((project) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !query ||
      project.name.toLowerCase().includes(query) ||
      project.slug.toLowerCase().includes(query) ||
      (project.description ?? '').toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  function openCreateModal() {
    createError = '';
    newName = '';
    newSlug = '';
    newDescription = '';
    newStatus = 'active';
    createModalOpen = true;
  }

  function closeCreateModal() {
    createModalOpen = false;
  }

  async function createProject() {
    createError = '';

    if (!newName.trim()) {
      createError = 'Project name is required.';
      return;
    }

    creating = true;
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          slug: newSlug.trim() || undefined,
          description: newDescription.trim() || undefined,
          status: newStatus,
        }),
      });

      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);

      closeCreateModal();
      flashSuccess('Project created.');
      await fetchProjects();
    } catch (err: unknown) {
      createError = err instanceof Error ? err.message : 'Failed to create project.';
    } finally {
      creating = false;
    }
  }

  function openDeleteModal(project: ProjectRow) {
    deleteModalProject = project;
    deleteError = '';
  }

  function closeDeleteModal() {
    deleteModalProject = null;
  }

  async function confirmDelete() {
    if (!deleteModalProject) return;

    deleteError = '';
    deleteLoading = true;

    try {
      const res = await fetch(`/api/projects/${deleteModalProject.id}`, { method: 'DELETE' });
      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);

      closeDeleteModal();
      flashSuccess('Project deleted.');
      await fetchProjects();
    } catch (err: unknown) {
      deleteError = err instanceof Error ? err.message : 'Failed to delete project.';
    } finally {
      deleteLoading = false;
    }
  }

  function formatDate(value: string) {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return value;
    }
  }
</script>

<svelte:head>
  <title>Projects - Settings</title>
</svelte:head>

<div class="space-y-6">
  <section class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
    <div>
      <h3 class="text-xl font-semibold text-slate-900">Projects</h3>
      <p class="mt-2 text-sm text-slate-600">Create, organize and manage the projects.</p>
    </div>

    <button
      type="button"
      on:click={openCreateModal}
      class="btn-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
    >
      <Plus class="h-4 w-4" />
      New project
    </button>
  </section>

  <section class="flex flex-col gap-3 sm:flex-row sm:items-center">
    <div class="relative flex-1">
      <Search
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search by name, slug or description..."
        class="field-input w-full rounded-md border py-2 pl-9 pr-3 text-sm outline-none transition"
      />
    </div>

    <select
      bind:value={statusFilter}
      class="field-input w-full rounded-md border px-3 py-2 text-sm outline-none transition sm:w-48"
    >
      <option value="all">All statuses</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>
  </section>

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

  {#if loading}
    <div class="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
      Loading projects...
    </div>
  {:else if filteredProjects.length === 0}
    <div
      class="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600"
    >
      {projects.length === 0 ? 'No projects found.' : 'No projects match your filters.'}
    </div>
  {:else}
    <div class="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div class="overflow-x-auto">
        <table class="w-full min-w-160 text-sm">
          <thead>
            <tr
              class="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              <th class="px-4 py-3">Name</th>
              <th class="px-4 py-3">Slug</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Created</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredProjects as project (project.id)}
              <tr class="border-t border-slate-100">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <FolderKanban class="h-4 w-4 shrink-0 text-slate-400" />
                    <div class="min-w-0">
                      <p class="truncate font-medium text-slate-900">{project.name}</p>
                      {#if project.description}
                        <p class="truncate text-xs text-slate-500">{project.description}</p>
                      {/if}
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3 text-slate-600">{project.slug}</td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {project.status ===
                    'active'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'}"
                  >
                    {project.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td class="px-4 py-3 text-slate-600">{formatDate(project.createdAt)}</td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-2">
                    <a
                      href={`/org/${data.organization.slug}/projects/${project.slug}/settings/overview`}
                      class="btn-secondary inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
                      title="View project"
                    >
                      <Eye class="h-3.5 w-3.5" />
                      View
                    </a>
                    <button
                      type="button"
                      on:click={() => openDeleteModal(project)}
                      class="btn-danger inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
                      title="Delete project"
                    >
                      <Trash2 class="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

{#if createModalOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={closeCreateModal}
    aria-label="Close create project modal"
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-lg rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Create project modal"
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">New project</h5>
      </div>

      <div class="space-y-4 px-4 py-4">
        {#if createError}
          <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {createError}
          </div>
        {/if}

        <div>
          <label class="block text-sm font-medium text-slate-700" for="new-project-name">Name</label
          >
          <input
            id="new-project-name"
            type="text"
            bind:value={newName}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
            placeholder="Platform Core"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="new-project-slug">Slug</label
          >
          <input
            id="new-project-slug"
            type="text"
            bind:value={newSlug}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
            placeholder="platform-core (auto-generated if empty)"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="new-project-description">
            Description
          </label>
          <textarea
            id="new-project-description"
            bind:value={newDescription}
            rows="3"
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
            placeholder="Optional description"
          ></textarea>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="new-project-status"
            >Status</label
          >
          <select
            id="new-project-status"
            bind:value={newStatus}
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
          on:click={closeCreateModal}
          class="btn-secondary rounded-md px-3 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={createProject}
          disabled={creating}
          class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
        >
          <Plus class="h-4 w-4" />
          {creating ? 'Creating...' : 'Create project'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if deleteModalProject}
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

      {#if deleteError}
        <div class="px-4 pt-4">
          <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {deleteError}
          </div>
        </div>
      {/if}

      <div class="px-4 py-4 text-sm text-slate-600">
        Are you sure you want to delete <span class="font-medium text-slate-900"
          >{deleteModalProject.name}</span
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
