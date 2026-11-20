<script lang="ts">
  import { onMount } from 'svelte';
  import { createPageStore } from '#lib/page-store';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { ArrowRight, Building2, Plus } from '@lucide/svelte';
  import { _ } from '#lib/i18n';

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

  onMount(() => {
    if (data.canCreateOrganization && new URLSearchParams(window.location.search).has('create')) {
      openCreateModal();
    }
  });

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
  const page = createPageStore();
</script>

<svelte:head>
  <title>{$_('sidebar.items.organizations')} - GitOps</title>
</svelte:head>

<div class="organizations-page">
  <header class="organizations-header">
    <div class="page-title">
      <div class="page-symbol"><Building2 class="h-5 w-5" /></div>
      <div>
        <h1>{$_('org.selectorTitle')}</h1>
        <p>{$_('org.selectorDescription')}</p>
      </div>
    </div>
  </header>

  {#if errorMessage}
    <div class="mb-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {errorMessage}
    </div>
  {/if}

  {#if data.organizations.length === 0}
    <div class="organizations-empty">
      <Building2 class="h-8 w-8 text-slate-400" />
      <p class="text-sm font-medium text-slate-700">{$_('org.noMembershipTitle')}</p>
      <p class="max-w-sm text-sm text-slate-500">{$_('org.noMembershipDescription')}</p>
    </div>
    {#if data.canCreateOrganization}
      <div class="organizations-grid empty-grid">
        <button type="button" class="organization-card add-organization" on:click={openCreateModal}>
          <span class="organization-icon"><Plus class="h-5 w-5" /></span>
          <span>
            <strong>Añadir organización</strong>
            <small>Crea un nuevo espacio para tu equipo</small>
          </span>
        </button>
      </div>
    {/if}
  {:else}
    <div class="organizations-grid">
      {#each data.organizations as organization (organization.id)}
        <a href={`/org/${organization.slug}/overview`} class="organization-card">
          <div class="flex items-center justify-between">
            <div class="organization-icon">
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
      {#if data.canCreateOrganization}
        <button type="button" class="organization-card add-organization" on:click={openCreateModal}>
          <span class="organization-icon"><Plus class="h-5 w-5" /></span>
          <span>
            <strong>Añadir organización</strong>
            <small>Crea un nuevo espacio para tu equipo</small>
          </span>
        </button>
      {/if}
    </div>
  {/if}
</div>

{#if createModalOpen}
  <button
    type="button"
    class="organization-modal-backdrop"
    on:click={closeCreateModal}
    aria-label={$_('clusterSettings.organizations.closeCreateModal')}
  ></button>
  <div class="organization-modal-layer">
    <div
      class="organization-modal"
      role="dialog"
      aria-modal="true"
      aria-label={$_('clusterSettings.organizations.createModal')}
    >
      <header class="organization-modal-header">
        <h2>
          {$_('clusterSettings.organizations.createModalTitle')}
        </h2>
        <button type="button" on:click={closeCreateModal} aria-label="Cerrar">×</button>
      </header>

      <form method="POST" action="?/createOrganization" use:enhance={createOrganization}>
        <div class="organization-modal-body">
          {#if createError}
            <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {createError}
            </div>
          {/if}

          <div>
            <label class="block text-sm font-medium text-slate-700" for="new-org-name"
              >{$_('common.name')}</label
            >
            <input
              id="new-org-name"
              name="name"
              type="text"
              bind:value={newName}
              class="organization-field"
              placeholder="GitOps"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700" for="new-org-slug"
              >{$_('common.slug')}</label
            >
            <input
              id="new-org-slug"
              name="slug"
              type="text"
              bind:value={newSlug}
              class="organization-field"
              placeholder={$_('clusterSettings.organizations.slugPlaceholder')}
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700" for="new-org-description"
              >{$_('common.description')}</label
            >
            <textarea
              id="new-org-description"
              name="description"
              bind:value={newDescription}
              rows="3"
              class="organization-field"
              placeholder={$_('clusterSettings.organizations.descriptionPlaceholder')}></textarea>
          </div>
        </div>

        <footer class="organization-modal-actions">
          <button type="button" on:click={closeCreateModal} class="modal-button-secondary">
            {$_('common.cancel')}
          </button>
          <button type="submit" disabled={creating} class="modal-button-primary">
            <Plus class="h-4 w-4" />
            {creating ? $_('common.creating') : $_('clusterSettings.organizations.new')}
          </button>
        </footer>
      </form>
    </div>
  </div>
{/if}

<style>
  .organizations-page {
    width: 100%;
    max-width: 1320px;
    margin: 0 auto;
  }

  .organizations-header {
    display: flex;
    min-height: 96px;
    align-items: center;
  }

  .page-title {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .page-symbol {
    display: flex;
    width: 50px;
    height: 50px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgb(249 93 17 / 0.26);
    border-radius: 12px;
    background: linear-gradient(145deg, rgb(249 93 17 / 0.18), rgb(249 93 17 / 0.05));
    color: #ff8a4c;
  }

  h1 {
    color: #ece8ee;
    font-size: 28px;
    font-weight: 580;
    letter-spacing: -0.45px;
  }

  .page-title p {
    margin-top: 5px;
    color: #77737a;
    font-size: 16px;
  }

  .organizations-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin-top: 22px;
  }

  .empty-grid {
    grid-template-columns: minmax(260px, 360px);
  }

  .organization-card {
    display: flex;
    min-height: 230px;
    flex-direction: column;
    justify-content: space-between;
    padding: 20px;
    border: 1px solid rgb(255 255 255 / 0.085);
    border-radius: 12px;
    background: rgb(255 255 255 / 0.025);
    color: #ddd8df;
    text-align: left;
    transition:
      transform 0.15s ease,
      border-color 0.15s ease,
      background 0.15s ease;
  }

  .organization-card:hover {
    border-color: rgb(249 93 17 / 0.28);
    background: rgb(255 255 255 / 0.04);
    transform: translateY(-2px);
  }

  .organization-card > div:first-child {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .organization-icon {
    display: inline-flex;
    width: 44px;
    height: 44px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgb(249 93 17 / 0.22);
    border-radius: 11px;
    background: rgb(249 93 17 / 0.08);
    color: #ff8a4c;
  }

  .organization-card p:first-child {
    color: #ece8ee;
    font-size: 17px;
    font-weight: 580;
  }

  .organization-card p:nth-child(2) {
    margin-top: 4px;
    color: #6f6973;
    font-size: 13px;
  }

  .organization-card p:nth-child(3) {
    margin-top: 12px;
    color: #8c868f;
    font-size: 14px;
    line-height: 1.5;
  }

  .add-organization {
    align-items: center;
    justify-content: center;
    gap: 14px;
    border-style: dashed;
    color: #8f8992;
    text-align: center;
  }

  .add-organization > span:last-child {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .add-organization strong {
    color: #d7d1d9;
    font-size: 16px;
    font-weight: 560;
  }

  .add-organization small {
    color: #716b74;
    font-size: 13px;
  }

  .organizations-empty {
    display: flex;
    min-height: 280px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
    margin-top: 22px;
    border: 1px dashed rgb(255 255 255 / 0.1);
    border-radius: 12px;
    background: rgb(255 255 255 / 0.018);
    color: #858089;
    text-align: center;
  }

  .organization-modal-backdrop {
    position: fixed;
    z-index: 1000;
    inset: 0;
    background: rgb(5 5 7 / 0.78);
    backdrop-filter: blur(8px);
  }

  .organization-modal-layer {
    position: fixed;
    z-index: 1010;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .organization-modal {
    width: min(520px, 100%);
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.1);
    border-radius: 14px;
    background: #121216;
    box-shadow: 0 30px 100px rgb(0 0 0 / 0.68);
  }

  .organization-modal-header,
  .organization-modal-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-color: rgb(255 255 255 / 0.08);
  }

  .organization-modal-header {
    border-bottom-width: 1px;
  }

  .organization-modal-header h2 {
    color: #f0ecf1;
    font-size: 19px;
    font-weight: 600;
  }

  .organization-modal-header button {
    color: #817b85;
    font-size: 25px;
  }

  .organization-modal-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
  }

  .organization-modal-body label {
    display: flex;
    flex-direction: column;
    color: #b6b0b9;
    font-size: 14px;
    font-weight: 500;
  }

  .organization-field {
    appearance: none;
    width: 100%;
    height: 42px;
    margin-top: 8px;
    padding: 0 12px;
    border: 1px solid rgb(255 255 255 / 0.09) !important;
    border-radius: 8px;
    outline: none;
    background: #17171c !important;
    color: #e9e5ea !important;
    font-size: 14px;
    line-height: 1.4;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      background 0.15s ease;
  }

  .organization-field::placeholder {
    color: #6d6870 !important;
    opacity: 1;
  }

  textarea.organization-field {
    min-height: 92px;
    height: auto;
    resize: vertical;
    padding-top: 10px;
  }

  .organization-field:focus {
    border-color: rgb(249 93 17 / 0.48) !important;
    background: #1a1715 !important;
    box-shadow: 0 0 0 3px rgb(249 93 17 / 0.1);
  }

  .organization-modal-actions {
    justify-content: flex-end;
    gap: 9px;
    border-top-width: 1px;
  }

  .modal-button-secondary,
  .modal-button-primary {
    display: inline-flex;
    height: 39px;
    align-items: center;
    gap: 7px;
    padding: 0 14px;
    border: 1px solid rgb(255 255 255 / 0.09);
    border-radius: 8px;
    font-size: 14px;
    font-weight: 550;
  }

  .modal-button-secondary {
    background: rgb(255 255 255 / 0.025);
    color: #bcb6bf;
  }

  .modal-button-primary {
    border-color: #f95d11;
    background: linear-gradient(180deg, #ff7430, #e74d08);
    color: #fff;
  }

  @media (max-width: 1024px) {
    .organizations-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .organizations-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
