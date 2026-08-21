<script lang="ts">
  import { goto } from '$app/navigation';
  import { CheckCircle, Copy, Save, Trash2 } from 'lucide-svelte';

  type OrganizationRow = {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    createdAt: string;
    updatedAt: string;
  };

  export let data: { organization: OrganizationRow };

  $: organization = data.organization;

  let saving = false;
  let error = '';
  let success = '';
  let slugCopied = false;

  let editName = data.organization.name;
  let editSlug = data.organization.slug;
  let editDescription = data.organization.description ?? '';

  let deleteModalOpen = false;
  let deleteLoading = false;
  let deleteError = '';

  function flashSuccess(message: string) {
    success = message;
    setTimeout(() => {
      success = '';
    }, 2500);
  }

  async function copySlug() {
    try {
      await navigator.clipboard.writeText(organization.slug);
      slugCopied = true;
      setTimeout(() => {
        slugCopied = false;
      }, 2000);
    } catch {
      error = 'Failed to copy slug.';
    }
  }

  async function saveOrganization() {
    error = '';
    if (!editName.trim()) {
      error = 'Organization name is required.';
      return;
    }

    saving = true;
    try {
      const res = await fetch(`/api/organizations/${organization.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          slug: editSlug.trim(),
          description: editDescription.trim(),
        }),
      });

      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);

      const previousSlug = organization.slug;
      organization = payload.organization;
      flashSuccess('Organization updated.');

      if (payload.organization.slug !== previousSlug) {
        await goto(`/cluster-settings/orgs/${payload.organization.slug}`, {
          invalidateAll: true,
        });
      }
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Failed to update organization.';
    } finally {
      saving = false;
    }
  }

  function openDeleteModal() {
    deleteError = '';
    deleteModalOpen = true;
  }

  function closeDeleteModal() {
    deleteModalOpen = false;
  }

  async function confirmDelete() {
    deleteError = '';
    deleteLoading = true;

    try {
      const res = await fetch(`/api/organizations/${organization.id}`, { method: 'DELETE' });
      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);

      await goto('/cluster-settings/orgs');
    } catch (err: unknown) {
      deleteError = err instanceof Error ? err.message : 'Failed to delete organization.';
      deleteLoading = false;
    }
  }
</script>

<svelte:head>
  <title>{organization.name} - Cluster Settings</title>
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
    <div class="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
      <h3 class="text-sm font-semibold text-slate-900">Información</h3>
      <button
        type="button"
        on:click={copySlug}
        class="btn-secondary inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
      >
        <Copy class="h-3.5 w-3.5" />
        {slugCopied ? 'Slug copiado' : 'Copy Organization Slug'}
      </button>
    </div>

    <div class="space-y-4 px-4 py-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="block text-sm font-medium text-slate-700" for="edit-org-name">Nombre</label
          >
          <input
            id="edit-org-name"
            type="text"
            bind:value={editName}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="edit-org-slug">Slug</label>
          <input
            id="edit-org-slug"
            type="text"
            bind:value={editSlug}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-slate-700" for="edit-org-description">
          Descripción
        </label>
        <textarea
          id="edit-org-description"
          bind:value={editDescription}
          rows="4"
          class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          placeholder="Optional description"
        ></textarea>
      </div>
    </div>

    <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
      <button
        type="button"
        on:click={saveOrganization}
        disabled={saving}
        class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
      >
        <Save class="h-4 w-4" />
        {saving ? 'Saving...' : 'Save changes'}
      </button>
    </div>
  </section>

  <section class="overflow-hidden rounded-md border border-red-200 bg-white">
    <div class="border-b border-red-200 px-4 py-3">
      <h3 class="text-sm font-semibold text-red-700">Danger Zone</h3>
    </div>
    <div class="flex items-center justify-between gap-3 px-4 py-4">
      <div>
        <p class="text-sm font-medium text-slate-900">Delete organization</p>
        <p class="mt-1 text-xs text-slate-500">
          Permanently deletes this organization. This action cannot be undone.
        </p>
      </div>
      <button
        type="button"
        on:click={openDeleteModal}
        class="btn-danger inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium"
      >
        <Trash2 class="h-3.5 w-3.5" />
        Delete organization
      </button>
    </div>
  </section>
</div>

{#if deleteModalOpen}
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

      <div class="space-y-3 px-4 py-4">
        {#if deleteError}
          <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {deleteError}
          </div>
        {/if}

        <p class="text-sm text-slate-600">
          Are you sure you want to delete <span class="font-medium text-slate-900"
            >{organization.name}</span
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
          type="button"
          on:click={confirmDelete}
          disabled={deleteLoading}
          class="btn-danger inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
        >
          <Trash2 class="h-4 w-4" />
          {deleteLoading ? 'Deleting...' : 'Delete organization'}
        </button>
      </div>
    </div>
  </div>
{/if}
