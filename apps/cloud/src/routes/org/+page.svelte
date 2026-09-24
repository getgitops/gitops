<script lang="ts">
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { ArrowRight, Building2, Plus } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

  type OrganizationRow = {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
  };

  export let data: { organizations: OrganizationRow[]; canCreateOrganization: boolean };

  $: errorMessage =
    $page?.url?.searchParams?.get('error') === 'organization-not-found' ? $_('org.notFound') : '';

  let createModalOpen = false;
  let creating = false;
  let createError = '';
  let newName = '';
  let newSlug = '';
  let newDescription = '';

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
      createError = $_('clusterSettings.organizations.nameRequired');
      cancel();
      return;
    }

    creating = true;
    return async ({ result, update }) => {
      await update();
      creating = false;

      if (result.type === 'success') {
        closeCreateModal();
        return;
      }

      createError =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : $_('clusterSettings.organizations.createFailed');
    };
  };
</script>

<svelte:head>
  <title>{$_('sidebar.items.organizations')} - GitOps</title>
</svelte:head>

<div class="mx-auto w-full max-w-5xl px-4 py-10">
  <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 class="text-xl font-semibold text-slate-900">{$_('org.selectorTitle')}</h1>
      <p class="mt-2 text-sm text-slate-600">{$_('org.selectorDescription')}</p>
    </div>

    {#if data.canCreateOrganization}
      <button
        type="button"
        on:click={openCreateModal}
        class="btn-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
      >
        <Plus class="h-4 w-4" />{$_('clusterSettings.organizations.new')}</button>
    {/if}
  </div>

  {#if errorMessage}
    <div class="mb-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {errorMessage}
    </div>
  {/if}

  {#if data.organizations.length === 0}
    <div
      class="flex flex-col items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center"
    >
      <Building2 class="h-8 w-8 text-slate-400" />
      <p class="text-sm font-medium text-slate-700">{$_('org.noMembershipTitle')}</p>
      <p class="max-w-sm text-sm text-slate-500">{$_('org.noMembershipDescription')}</p>
    </div>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each data.organizations as organization (organization.id)}
        <a
          href={`/org/${organization.slug}/overview`}
          class="group flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300 hover:shadow-md"
        >
          <div class="flex items-center justify-between">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-600"
            >
              <Building2 class="h-5 w-5" />
            </div>
            <ArrowRight
              class="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-slate-600"
            />
          </div>
          <div class="min-w-0">
            <p class="truncate font-medium text-slate-900">{organization.name}</p>
            <p class="truncate text-xs text-slate-500">{organization.slug}</p>
            {#if organization.description}
              <p class="mt-2 line-clamp-2 text-sm text-slate-600">{organization.description}</p>
            {/if}
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>

{#if createModalOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={closeCreateModal}
    aria-label={$_('clusterSettings.organizations.closeCreateModal')}
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-lg rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label={$_('clusterSettings.organizations.createModal')}
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">{$_('clusterSettings.organizations.createModalTitle')}</h5>
      </div>

      <form method="POST" action="?/createOrganization" use:enhance={createOrganization}>
        <div class="space-y-4 px-4 py-4">
          {#if createError}
            <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {createError}
            </div>
          {/if}

          <div>
            <label class="block text-sm font-medium text-slate-700" for="new-org-name">{$_('common.name')}</label>
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
            <label class="block text-sm font-medium text-slate-700" for="new-org-slug">{$_('common.slug')}</label>
            <input
              id="new-org-slug"
              name="slug"
              type="text"
              bind:value={newSlug}
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
              placeholder={$_('clusterSettings.organizations.slugPlaceholder')}
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700" for="new-org-description">{$_('common.description')}</label>
            <textarea
              id="new-org-description"
              name="description"
              bind:value={newDescription}
              rows="3"
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
              placeholder={$_('clusterSettings.organizations.descriptionPlaceholder')}
            ></textarea>
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
            {creating ? $_('common.creating') : $_('clusterSettings.organizations.new')}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

