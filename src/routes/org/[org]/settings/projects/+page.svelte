<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { CheckCircle, Eye, FolderKanban, Plus, Search, Trash2 } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

  export let data: {
    organization: { id: string; slug: string } | null;
    projects: ProjectRow[];
    canCreate: boolean;
    canDelete: boolean;
  };

  type ProjectRow = {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    status: 'active' | 'inactive';
    createdAt: string;
    updatedAt: string;
  };

  $: projects = data.projects;

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

  const createProject: SubmitFunction = ({ cancel }) => {
    createError = '';

    if (!newName.trim()) {
      createError = $_('orgSettings.projects.nameRequired');
      cancel();
      return;
    }

    if (!data.organization) {
      createError = $_('orgSettings.projects.noOrganization');
      cancel();
      return;
    }

    creating = true;
    return async ({ result, update }) => {
      await update();
      creating = false;

      if (result.type === 'success') {
        closeCreateModal();
        flashSuccess($_('orgSettings.projects.created'));
        return;
      }

      createError =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : $_('orgSettings.projects.createFailed');
    };
  };

  function openDeleteModal(project: ProjectRow) {
    deleteModalProject = project;
    deleteError = '';
  }

  function closeDeleteModal() {
    deleteModalProject = null;
  }

  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (!deleteModalProject) {
      cancel();
      return;
    }

    deleteError = '';
    deleteLoading = true;
    return async ({ result, update }) => {
      await update();
      deleteLoading = false;

      if (result.type === 'success') {
        closeDeleteModal();
        flashSuccess($_('orgSettings.projects.deleted'));
        return;
      }

      deleteError =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : $_('orgSettings.projects.deleteFailed');
    };
  };

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
  <title>{$_('orgSettings.projects.title')} - {$_('orgSettings.title')}</title>
</svelte:head>

<div class="space-y-6">
  <section class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
    <div>
      <h3 class="text-xl font-semibold text-slate-900">{$_('orgSettings.projects.title')}</h3>
      <p class="mt-2 text-sm text-slate-600">{$_('orgSettings.projects.description')}</p>
    </div>

    {#if data.canCreate}
      <button
        type="button"
        on:click={openCreateModal}
        class="btn-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
      >
        <Plus class="h-4 w-4" />{$_('orgSettings.projects.new')}</button
      >
    {/if}
  </section>

  <section class="flex flex-col gap-3 sm:flex-row sm:items-center">
    <div class="relative flex-1">
      <Search
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder={$_('orgSettings.projects.searchPlaceholder')}
        class="field-input w-full rounded-md border py-2 pl-9 pr-3 text-sm outline-none transition"
      />
    </div>

    <select
      bind:value={statusFilter}
      class="field-input w-full rounded-md border px-3 py-2 text-sm outline-none transition sm:w-48"
    >
      <option value="all">{$_('orgSettings.projects.allStatuses')}</option>
      <option value="active">{$_('common.active')}</option>
      <option value="inactive">{$_('common.inactive')}</option>
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

  {#if filteredProjects.length === 0}
    <div
      class="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600"
    >
      {projects.length === 0
        ? $_('orgSettings.projects.empty')
        : $_('orgSettings.projects.emptyFiltered')}
    </div>
  {:else}
    <div class="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div class="overflow-x-auto">
        <table class="w-full min-w-160 text-sm">
          <thead>
            <tr
              class="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              <th class="px-4 py-3">{$_('common.name')}</th>
              <th class="px-4 py-3">{$_('common.slug')}</th>
              <th class="px-4 py-3">{$_('common.status')}</th>
              <th class="px-4 py-3">{$_('common.created')}</th>
              <th class="px-4 py-3 text-right">{$_('common.actions')}</th>
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
                    {project.status === 'active' ? $_('common.active') : $_('common.inactive')}
                  </span>
                </td>
                <td class="px-4 py-3 text-slate-600">{formatDate(project.createdAt)}</td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-2">
                    <a
                      href={data.organization
                        ? `/org/${data.organization.slug}/projects/${project.slug}/settings/overview`
                        : '/cluster-settings/orgs'}
                      class="btn-secondary inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
                      title={$_('orgSettings.projects.viewProject')}
                    >
                      <Eye class="h-3.5 w-3.5" />{$_('common.view')}</a
                    >
                    {#if data.canDelete}
                      <button
                        type="button"
                        on:click={() => openDeleteModal(project)}
                        class="btn-danger inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
                        title={$_('orgSettings.projects.deleteProject')}
                      >
                        <Trash2 class="h-3.5 w-3.5" />{$_('common.delete')}</button
                      >
                    {/if}
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
    aria-label={$_('orgSettings.projects.closeCreateModal')}
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-lg rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label={$_('orgSettings.projects.createModal')}
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">
          {$_('orgSettings.projects.createModalTitle')}
        </h5>
      </div>

      <form method="POST" action="?/createProject" use:enhance={createProject}>
        <input type="hidden" name="organizationId" value={data.organization?.id ?? ''} />
        <div class="space-y-4 px-4 py-4">
          {#if createError}
            <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {createError}
            </div>
          {/if}

          <div>
            <label class="block text-sm font-medium text-slate-700" for="new-project-name"
              >{$_('common.name')}</label
            >
            <input
              id="new-project-name"
              name="name"
              type="text"
              bind:value={newName}
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
              placeholder="Platform Core"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700" for="new-project-slug"
              >{$_('common.slug')}</label
            >
            <input
              id="new-project-slug"
              name="slug"
              type="text"
              bind:value={newSlug}
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
              placeholder={$_('orgSettings.projects.slugPlaceholder')}
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700" for="new-project-description"
              >{$_('common.description')}</label
            >
            <textarea
              id="new-project-description"
              name="description"
              bind:value={newDescription}
              rows="3"
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
              placeholder={$_('orgSettings.projects.descriptionPlaceholder')}></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700" for="new-project-status"
              >{$_('common.status')}</label
            >
            <select
              id="new-project-status"
              name="status"
              bind:value={newStatus}
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
            >
              <option value="active">{$_('common.active')}</option>
              <option value="inactive">{$_('common.inactive')}</option>
            </select>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            on:click={closeCreateModal}
            class="btn-secondary rounded-md px-3 py-2 text-sm font-medium"
          >
            {$_('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={creating}
            class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
          >
            <Plus class="h-4 w-4" />
            {creating ? $_('common.creating') : $_('common.create')}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if deleteModalProject}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={closeDeleteModal}
    aria-label={$_('orgSettings.projects.closeDeleteModal')}
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label={$_('orgSettings.projects.deleteModal')}
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">
          {$_('orgSettings.projects.deleteConfirmTitle')}
        </h5>
      </div>

      <form method="POST" action="?/deleteProject" use:enhance={confirmDelete}>
        <input type="hidden" name="id" value={deleteModalProject.id} />
        {#if deleteError}
          <div class="px-4 pt-4">
            <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {deleteError}
            </div>
          </div>
        {/if}

        <div class="px-4 py-4 text-sm text-slate-600">
          {$_('orgSettings.projects.deleteConfirmStart')}<span class="font-medium text-slate-900"
            >{deleteModalProject.name}</span
          >{$_('orgSettings.projects.deleteConfirmEnd')}
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            on:click={closeDeleteModal}
            class="btn-secondary rounded-md px-3 py-2 text-sm font-medium"
          >
            {$_('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={deleteLoading}
            class="btn-danger inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
          >
            <Trash2 class="h-4 w-4" />
            {deleteLoading
              ? $_('orgSettings.projects.deleting')
              : $_('orgSettings.projects.deleteProject')}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
