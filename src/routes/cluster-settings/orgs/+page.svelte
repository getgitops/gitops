<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { Building2, CheckCircle, Eye, Plus, Search, Trash2 } from '@lucide/svelte';

  type OrganizationRow = {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    createdAt: string;
    updatedAt: string;
  };

  export let data: { organizations: OrganizationRow[] };

  $: organizations = data.organizations;

  let error = '';
  let success = '';

  let searchQuery = '';

  let createModalOpen = false;
  let creating = false;
  let createError = '';
  let newName = '';
  let newSlug = '';
  let newDescription = '';

  let deleteModalOrganization: OrganizationRow | null = null;
  let deleteLoading = false;
  let deleteError = '';

  function flashSuccess(message: string) {
    success = message;
    setTimeout(() => {
      success = '';
    }, 2500);
  }

  $: filteredOrganizations = organizations.filter((organization) => {
    const query = searchQuery.trim().toLowerCase();
    return (
      !query ||
      organization.name.toLowerCase().includes(query) ||
      organization.slug.toLowerCase().includes(query) ||
      (organization.description ?? '').toLowerCase().includes(query)
    );
  });

  function openCreateModal() {
    createError = '';
    newName = '';
    newSlug = '';
    newDescription = '';
    createModalOpen = true;
  }

  function closeCreateModal() {
    createModalOpen = false;
  }

  const createOrganization: SubmitFunction = ({ cancel }) => {
    createError = '';

    if (!newName.trim()) {
      createError = 'Organization name is required.';
      cancel();
      return;
    }

    creating = true;
    return async ({ result, update }) => {
      await update();
      creating = false;

      if (result.type === 'success') {
        closeCreateModal();
        flashSuccess('Organization created.');
        return;
      }

      createError =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : 'Failed to create organization.';
    };
  };

  function openDeleteModal(organization: OrganizationRow) {
    deleteModalOrganization = organization;
    deleteError = '';
  }

  function closeDeleteModal() {
    deleteModalOrganization = null;
  }

  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (!deleteModalOrganization) {
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
        flashSuccess('Organization deleted.');
        return;
      }

      deleteError =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : 'Failed to delete organization.';
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
  <title>Organizations - Cluster Settings</title>
</svelte:head>

<div class="space-y-6">
  <section class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
    <div>
      <h3 class="text-xl font-semibold text-slate-900">Organizations</h3>
      <p class="mt-2 text-sm text-slate-600">Create, view and manage cluster organizations.</p>
    </div>

    <button
      type="button"
      on:click={openCreateModal}
      class="btn-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
    >
      <Plus class="h-4 w-4" />
      New organization
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

  {#if filteredOrganizations.length === 0}
    <div
      class="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600"
    >
      {organizations.length === 0
        ? 'No organizations found.'
        : 'No organizations match your search.'}
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
              <th class="px-4 py-3">Created</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredOrganizations as organization (organization.id)}
              <tr class="border-t border-slate-100">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <Building2 class="h-4 w-4 shrink-0 text-slate-400" />
                    <div class="min-w-0">
                      <p class="truncate font-medium text-slate-900">{organization.name}</p>
                      {#if organization.description}
                        <p class="truncate text-xs text-slate-500">{organization.description}</p>
                      {/if}
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3 text-slate-600">{organization.slug}</td>
                <td class="px-4 py-3 text-slate-600">{formatDate(organization.createdAt)}</td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-2">
                    <a
                      href={`/cluster-settings/orgs/${organization.slug}`}
                      class="btn-secondary inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
                      title="View organization"
                    >
                      <Eye class="h-3.5 w-3.5" />
                      View
                    </a>
                    <button
                      type="button"
                      on:click={() => openDeleteModal(organization)}
                      class="btn-danger inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
                      title="Delete organization"
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
    aria-label="Close create organization modal"
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-lg rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Create organization modal"
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">New organization</h5>
      </div>

      <form method="POST" action="?/createOrganization" use:enhance={createOrganization}>
        <div class="space-y-4 px-4 py-4">
          {#if createError}
            <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {createError}
            </div>
          {/if}

          <div>
            <label class="block text-sm font-medium text-slate-700" for="new-org-name">Name</label>
            <input
              id="new-org-name"
              name="name"
              type="text"
              bind:value={newName}
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
              placeholder="GitOps"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700" for="new-org-slug">Slug</label>
            <input
              id="new-org-slug"
              name="slug"
              type="text"
              bind:value={newSlug}
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
              placeholder="gitops (auto-generated if empty)"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700" for="new-org-description">
              Description
            </label>
            <textarea
              id="new-org-description"
              name="description"
              bind:value={newDescription}
              rows="3"
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
              placeholder="Optional description"
            ></textarea>
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
            type="submit"
            disabled={creating}
            class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
          >
            <Plus class="h-4 w-4" />
            {creating ? 'Creating...' : 'Create organization'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if deleteModalOrganization}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={closeDeleteModal}
    aria-label="Close delete organization modal"
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Delete organization modal"
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">Delete organization</h5>
      </div>

      <form method="POST" action="?/deleteOrganization" use:enhance={confirmDelete}>
        <input type="hidden" name="id" value={deleteModalOrganization.id} />
        <div class="space-y-3 px-4 py-4">
          {#if deleteError}
            <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {deleteError}
            </div>
          {/if}

          <p class="text-sm text-slate-600">
            Are you sure you want to delete <span class="font-medium text-slate-900"
              >{deleteModalOrganization.name}</span
            >? This action cannot be undone.
          </p>
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
            type="submit"
            disabled={deleteLoading}
            class="btn-danger inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
          >
            <Trash2 class="h-4 w-4" />
            {deleteLoading ? 'Deleting...' : 'Delete organization'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
