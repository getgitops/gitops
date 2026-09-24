<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { CheckCircle, Copy, Save, Trash2 } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

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
      error = $_('clusterSettings.organizationDetail.copySlugFailed');
    }
  }

  const saveOrganization: SubmitFunction = ({ cancel }) => {
    error = '';
    if (!editName.trim()) {
      error = $_('clusterSettings.organizationDetail.nameRequired');
      cancel();
      return;
    }

    saving = true;
    return async ({ result, update }) => {
      await update();
      saving = false;

      if (result.type === 'success') {
        flashSuccess($_('clusterSettings.organizationDetail.updated'));
        return;
      }

      error =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : $_('clusterSettings.organizationDetail.updateFailed');
    };
  };

  function openDeleteModal() {
    deleteError = '';
    deleteModalOpen = true;
  }

  function closeDeleteModal() {
    deleteModalOpen = false;
  }

  const confirmDelete: SubmitFunction = () => {
    deleteError = '';
    deleteLoading = true;
    return async ({ result, update }) => {
      await update();

      if (result.type === 'failure') {
        deleteError = result.data?.error
          ? String(result.data.error)
          : $_('clusterSettings.organizationDetail.deleteFailed');
        deleteLoading = false;
      }
    };
  };
</script>

<svelte:head>
  <title>{organization.name} - {$_('clusterSettings.organizationDetail.titleSuffix')}</title>
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

  <form
    method="POST"
    action="?/updateOrganization"
    use:enhance={saveOrganization}
    class="overflow-hidden rounded-md border border-slate-200 bg-white"
  >
    <input type="hidden" name="id" value={organization.id} />
    <div class="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
      <h3 class="text-sm font-semibold text-slate-900">{$_('clusterSettings.organizationDetail.information')}</h3>
      <button
        type="button"
        on:click={copySlug}
        class="btn-secondary inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
      >
        <Copy class="h-3.5 w-3.5" />
        {slugCopied ? $_('clusterSettings.organizationDetail.slugCopied') : $_('clusterSettings.organizationDetail.copySlug')}
      </button>
    </div>

    <div class="space-y-4 px-4 py-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="block text-sm font-medium text-slate-700" for="edit-org-name">{$_('common.name')}</label>
          <input
            id="edit-org-name"
            name="name"
            type="text"
            bind:value={editName}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="edit-org-slug">{$_('common.slug')}</label>
          <input
            id="edit-org-slug"
            name="slug"
            type="text"
            bind:value={editSlug}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-slate-700" for="edit-org-description">{$_('common.description')}</label>
        <textarea
          id="edit-org-description"
          name="description"
          bind:value={editDescription}
          rows="4"
          class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          placeholder={$_('clusterSettings.organizationDetail.optionalDescription')}
        ></textarea>
      </div>
    </div>

    <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
      <button
        type="submit"
        disabled={saving}
        class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
      >
        <Save class="h-4 w-4" />
        {saving ? $_('common.saving') : $_('clusterSettings.organizationDetail.saveChanges')}
      </button>
    </div>
  </form>

  <section class="overflow-hidden rounded-md border border-red-200 bg-white">
    <div class="border-b border-red-200 px-4 py-3">
      <h3 class="text-sm font-semibold text-red-700">{$_('clusterSettings.organizationDetail.dangerZone')}</h3>
    </div>
    <div class="flex items-center justify-between gap-3 px-4 py-4">
      <div>
        <p class="text-sm font-medium text-slate-900">{$_('clusterSettings.organizationDetail.deleteTitle')}</p>
        <p class="mt-1 text-xs text-slate-500">{$_('clusterSettings.organizationDetail.deleteDescription')}</p>
      </div>
      <button
        type="button"
        on:click={openDeleteModal}
        class="btn-danger inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium"
      >
        <Trash2 class="h-3.5 w-3.5" />{$_('clusterSettings.organizationDetail.deleteTitle')}</button>
    </div>
  </section>
</div>

{#if deleteModalOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={closeDeleteModal}
    aria-label={$_('clusterSettings.organizationDetail.closeDeleteModal')}
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label={$_('clusterSettings.organizationDetail.deleteModal')}
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">{$_('clusterSettings.organizationDetail.deleteConfirmTitle')}</h5>
      </div>

      <form method="POST" action="?/deleteOrganization" use:enhance={confirmDelete}>
        <input type="hidden" name="id" value={organization.id} />
        <div class="space-y-3 px-4 py-4">
          {#if deleteError}
            <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {deleteError}
            </div>
          {/if}

          <p class="text-sm text-slate-600">
            {$_('clusterSettings.organizationDetail.deleteConfirmStart')}<span class="font-medium text-slate-900"
              >{organization.name}</span
            >{$_('clusterSettings.organizationDetail.deleteConfirmEnd')}
          </p>
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
            {deleteLoading ? $_('clusterSettings.organizationDetail.deleting') : $_('clusterSettings.organizationDetail.deleteTitle')}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
