<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import {
    CalendarDays,
    CheckCircle,
    Eye,
    FolderKanban,
    Pencil,
    Plus,
    Search,
    Trash2,
  } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import OrganizationNavigation from '#lib/components/OrganizationNavigation.svelte';

  export let data: {
    organization: { id: string; slug: string; name: string } | null;
    projects: ProjectRow[];
    canCreate: boolean;
    canUpdate: boolean;
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
  let editModalProject: ProjectRow | null = null;
  let editName = '';
  let editDescription = '';
  let editStatus: 'active' | 'inactive' = 'active';
  let updating = false;
  let updateError = '';

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

  function openEditModal(project: ProjectRow) {
    editModalProject = project;
    editName = project.name;
    editDescription = project.description ?? '';
    editStatus = project.status;
    updateError = '';
  }

  function closeEditModal() {
    editModalProject = null;
  }

  const updateProject: SubmitFunction = ({ cancel }) => {
    updateError = '';
    if (!editModalProject || !editName.trim()) {
      updateError = $_('orgSettings.projects.nameRequired');
      cancel();
      return;
    }

    updating = true;
    return async ({ result, update }) => {
      await update();
      updating = false;

      if (result.type === 'success') {
        closeEditModal();
        flashSuccess('Proyecto actualizado');
        return;
      }

      updateError =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : 'No se pudo actualizar el proyecto.';
    };
  };

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

<div class="projects-page">
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <a href="/org">Organizations</a>
    <span>/</span>
    <span>{data.organization?.name ?? 'Organization'}</span>
  </nav>

  <header class="projects-header">
    <div class="page-title">
      <div class="page-symbol"><FolderKanban class="h-5 w-5" /></div>
      <div>
        <h1>{data.organization?.name ?? 'Organization'}</h1>
        <p>Gestiona los proyectos, servicios y accesos de tu organización</p>
      </div>
    </div>

    {#if data.canCreate}
      <button type="button" on:click={openCreateModal} class="button-primary">
        <Plus class="h-4 w-4" />{$_('orgSettings.projects.new')}</button
      >
    {/if}
  </header>

  <OrganizationNavigation organizationSlug={data.organization?.slug ?? ''} active="projects" />

  <section class="projects-toolbar">
    <div class="projects-search">
      <Search
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder={$_('orgSettings.projects.searchPlaceholder')}
        class="field-input projects-filter"
      />
    </div>

    <div class="status-filter" aria-label="Filtrar por estado">
      <button
        type="button"
        class:active={statusFilter === 'all'}
        on:click={() => (statusFilter = 'all')}>Todos</button
      >
      <button
        type="button"
        class:active={statusFilter === 'active'}
        on:click={() => (statusFilter = 'active')}>Activos</button
      >
      <button
        type="button"
        class:active={statusFilter === 'inactive'}
        on:click={() => (statusFilter = 'inactive')}>Inactivos</button
      >
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

  {#if filteredProjects.length === 0}
    <div
      class="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600"
    >
      {projects.length === 0
        ? $_('orgSettings.projects.empty')
        : $_('orgSettings.projects.emptyFiltered')}
    </div>
  {:else}
    <div class="projects-grid">
      {#each filteredProjects as project, index (project.id)}
        <article class="project-card">
          <div class="project-card-top">
            <span class={`project-card-icon icon-${index % 3}`}>
              <FolderKanban class="h-5 w-5" />
            </span>
            <span class:inactive={project.status !== 'active'} class="project-status">
              <i></i>{project.status === 'active' ? $_('common.active') : $_('common.inactive')}
            </span>
          </div>

          <a
            href={`/org/${data.organization?.slug}/projects/${project.slug}/overview`}
            class="project-card-body"
          >
            <h2>{project.name}</h2>
            <p>{project.description || 'Sin descripción'}</p>
            <code>{project.slug}</code>
          </a>

          <div class="project-card-meta">
            <span><CalendarDays class="h-3.5 w-3.5" /> {formatDate(project.createdAt)}</span>
            <div class="project-card-actions">
              <a
                href={`/org/${data.organization?.slug}/projects/${project.slug}/overview`}
                title={$_('orgSettings.projects.viewProject')}
                aria-label={$_('orgSettings.projects.viewProject')}
              >
                <Eye class="h-4 w-4" />
              </a>
              {#if data.canUpdate}
                <button
                  type="button"
                  on:click={() => openEditModal(project)}
                  title="Editar proyecto"
                  aria-label={`Editar proyecto: ${project.name}`}
                >
                  <Pencil class="h-4 w-4" />
                </button>
              {/if}
              {#if data.canDelete}
                <button
                  type="button"
                  class="delete-project"
                  on:click={() => openDeleteModal(project)}
                  title={$_('orgSettings.projects.deleteProject')}
                  aria-label={`${$_('orgSettings.projects.deleteProject')}: ${project.name}`}
                >
                  <Trash2 class="h-4 w-4" />
                </button>
              {/if}
            </div>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

{#if createModalOpen}
  <button
    type="button"
    class="modal-backdrop"
    on:click={closeCreateModal}
    aria-label={$_('orgSettings.projects.closeCreateModal')}
  ></button>
  <div class="modal-layer">
    <div
      class="project-modal"
      role="dialog"
      aria-modal="true"
      aria-label={$_('orgSettings.projects.createModal')}
    >
      <header class="project-modal-header">
        <div>
          <h2>{$_('orgSettings.projects.createModalTitle')}</h2>
          <p>Crea un nuevo espacio para organizar tus productos y servicios.</p>
        </div>
        <button type="button" on:click={closeCreateModal} aria-label="Cerrar">×</button>
      </header>

      <form method="POST" action="?/createProject" use:enhance={createProject}>
        <input type="hidden" name="organizationId" value={data.organization?.id ?? ''} />
        <div class="project-modal-body">
          {#if createError}
            <div class="project-modal-error">{createError}</div>
          {/if}

          <label>
            <span>{$_('common.name')}</span>
            <input
              id="new-project-name"
              name="name"
              type="text"
              bind:value={newName}
              placeholder="Platform Core"
            />
          </label>

          <label>
            <span>{$_('common.slug')}</span>
            <input
              id="new-project-slug"
              name="slug"
              type="text"
              bind:value={newSlug}
              placeholder={$_('orgSettings.projects.slugPlaceholder')}
            />
          </label>

          <label>
            <span>{$_('common.description')}</span>
            <textarea
              id="new-project-description"
              name="description"
              bind:value={newDescription}
              rows="3"
              placeholder={$_('orgSettings.projects.descriptionPlaceholder')}></textarea>
          </label>

          <div class="project-create-note">
            <CheckCircle class="h-4 w-4" />
            El proyecto se creará activo. Podrás desactivarlo después desde Editar proyecto.
          </div>
        </div>

        <footer class="project-modal-actions">
          <button type="button" on:click={closeCreateModal} class="modal-button-secondary">
            {$_('common.cancel')}
          </button>
          <button type="submit" disabled={creating} class="modal-button-primary">
            <Plus class="h-4 w-4" />
            {creating ? $_('common.creating') : $_('common.create')}
          </button>
        </footer>
      </form>
    </div>
  </div>
{/if}

{#if editModalProject}
  <button
    type="button"
    class="modal-backdrop"
    on:click={closeEditModal}
    aria-label="Cerrar modal de edición"
  ></button>
  <div class="modal-layer">
    <div class="project-modal" role="dialog" aria-modal="true" aria-label="Editar proyecto">
      <header class="project-modal-header">
        <div>
          <h2>Editar proyecto</h2>
          <p>Actualiza los datos y el estado del proyecto.</p>
        </div>
        <button type="button" on:click={closeEditModal} aria-label="Cerrar">×</button>
      </header>

      <form method="POST" action="?/updateProject" use:enhance={updateProject}>
        <input type="hidden" name="id" value={editModalProject.id} />
        <div class="project-modal-body">
          {#if updateError}
            <div class="project-modal-error">{updateError}</div>
          {/if}

          <label>
            <span>{$_('common.name')}</span>
            <input name="name" type="text" bind:value={editName} />
          </label>
          <label>
            <span>{$_('common.description')}</span>
            <textarea name="description" rows="3" bind:value={editDescription}></textarea>
          </label>
          <label>
            <span>{$_('common.status')}</span>
            <select name="status" bind:value={editStatus}>
              <option value="active">{$_('common.active')}</option>
              <option value="inactive">{$_('common.inactive')}</option>
            </select>
          </label>
        </div>

        <footer class="project-modal-actions">
          <button type="button" class="modal-button-secondary" on:click={closeEditModal}>
            {$_('common.cancel')}
          </button>
          <button type="submit" class="modal-button-primary" disabled={updating}>
            {updating ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </footer>
      </form>
    </div>
  </div>
{/if}

{#if deleteModalProject}
  <button
    type="button"
    class="modal-backdrop"
    on:click={closeDeleteModal}
    aria-label={$_('orgSettings.projects.closeDeleteModal')}
  ></button>
  <div class="modal-layer">
    <div
      class="project-modal project-modal-compact"
      role="dialog"
      aria-modal="true"
      aria-label={$_('orgSettings.projects.deleteModal')}
    >
      <header class="project-modal-header">
        <div>
          <h2>{$_('orgSettings.projects.deleteConfirmTitle')}</h2>
          <p>Esta acción no se puede deshacer.</p>
        </div>
        <button type="button" on:click={closeDeleteModal} aria-label="Cerrar">×</button>
      </header>

      <form method="POST" action="?/deleteProject" use:enhance={confirmDelete}>
        <input type="hidden" name="id" value={deleteModalProject.id} />
        {#if deleteError}
          <div class="px-4 pt-4">
            <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {deleteError}
            </div>
          </div>
        {/if}

        <div class="project-modal-body delete-copy">
          {$_('orgSettings.projects.deleteConfirmStart')}<span class="font-medium text-slate-900"
            >{deleteModalProject.name}</span
          >{$_('orgSettings.projects.deleteConfirmEnd')}
        </div>

        <footer class="project-modal-actions">
          <button type="button" on:click={closeDeleteModal} class="modal-button-secondary">
            {$_('common.cancel')}
          </button>
          <button type="submit" disabled={deleteLoading} class="modal-button-danger">
            <Trash2 class="h-4 w-4" />
            {deleteLoading
              ? $_('orgSettings.projects.deleting')
              : $_('orgSettings.projects.deleteProject')}
          </button>
        </footer>
      </form>
    </div>
  </div>
{/if}

<style>
  .projects-page {
    width: 100%;
    max-width: 1320px;
    margin: 0 auto;
  }

  .breadcrumbs {
    display: flex;
    height: 16px;
    align-items: center;
    gap: 8px;
    color: #625e65;
    font-size: 14px;
  }

  .breadcrumbs a {
    color: #625e65;
  }

  .breadcrumbs span:last-child {
    color: #a9a4ac;
  }

  .projects-header {
    display: flex;
    min-height: 92px;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-top: 10px;
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
    color: #ececf0;
    font-size: 28px;
    font-weight: 570;
    letter-spacing: -0.45px;
  }

  .page-title p {
    margin-top: 5px;
    color: #77737a;
    font-size: 16px;
  }

  .button-primary {
    display: inline-flex;
    height: 40px;
    align-items: center;
    gap: 8px;
    padding: 0 15px;
    border: 1px solid #f95d11;
    border-radius: 7px;
    background: linear-gradient(180deg, #ff7430, #e74d08);
    color: #fff;
    font-size: 14px;
    font-weight: 550;
    box-shadow: 0 8px 24px rgb(249 93 17 / 0.18);
  }

  .projects-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 22px;
  }

  .projects-search {
    position: relative;
    width: min(360px, 100%);
  }

  .projects-filter {
    height: 42px;
    border-radius: 8px;
    font-size: 14px;
  }

  .projects-filter {
    width: 100%;
    padding: 0 14px 0 38px;
    border-color: rgb(255 255 255 / 0.09) !important;
    background: rgb(255 255 255 / 0.025) !important;
    color: #e7e3e8 !important;
    box-shadow: none !important;
  }

  .projects-filter:focus {
    border-color: rgb(249 93 17 / 0.42) !important;
    background: rgb(255 255 255 / 0.04) !important;
    box-shadow: 0 0 0 3px rgb(249 93 17 / 0.1) !important;
  }

  .projects-filter::placeholder {
    color: #6d6870 !important;
  }

  .status-filter {
    display: inline-flex;
    height: 38px;
    align-items: center;
    gap: 3px;
    padding: 3px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 9px;
    background: rgb(255 255 255 / 0.025);
  }

  .status-filter button {
    height: 30px;
    padding: 0 11px;
    border-radius: 6px;
    color: #77727b;
    font-size: 13px;
  }

  .status-filter button:hover {
    color: #d8d3da;
  }

  .status-filter button.active {
    background: rgb(255 255 255 / 0.075);
    color: #f1edf2;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
  }

  .projects-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin-top: 18px;
  }

  .project-card {
    display: flex;
    min-height: 250px;
    flex-direction: column;
    padding: 18px;
    border: 1px solid rgb(255 255 255 / 0.085);
    border-radius: 12px;
    background: rgb(255 255 255 / 0.025);
    transition:
      border-color 0.15s ease,
      transform 0.15s ease,
      background 0.15s ease;
  }

  .project-card:hover {
    border-color: rgb(249 93 17 / 0.24);
    background: rgb(255 255 255 / 0.04);
    transform: translateY(-2px);
  }

  .project-card-top,
  .project-card-meta,
  .project-card-actions {
    display: flex;
    align-items: center;
  }

  .project-card-top {
    justify-content: space-between;
  }

  .project-card-icon {
    display: flex;
    width: 42px;
    height: 42px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgb(249 93 17 / 0.22);
    border-radius: 11px;
    background: rgb(249 93 17 / 0.08);
    color: #ff8a4c;
  }

  .project-card-icon.icon-1 {
    border-color: rgb(52 211 153 / 0.22);
    background: rgb(52 211 153 / 0.07);
    color: #6ee7b7;
  }

  .project-card-icon.icon-2 {
    border-color: rgb(96 165 250 / 0.22);
    background: rgb(96 165 250 / 0.07);
    color: #83b9ff;
  }

  .project-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border: 1px solid rgb(52 211 153 / 0.16);
    border-radius: 999px;
    background: rgb(52 211 153 / 0.06);
    color: #73d4ad;
    font-size: 12px;
  }

  .project-status i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #6ee7b7;
  }

  .project-status.inactive {
    border-color: rgb(255 255 255 / 0.08);
    background: rgb(255 255 255 / 0.035);
    color: #827c85;
  }

  .project-status.inactive i {
    background: #716b74;
  }

  .project-card-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    padding: 20px 0;
  }

  .project-card-body h2 {
    color: #e9e5ea;
    font-size: 17px;
    font-weight: 560;
  }

  .project-card-body p {
    display: -webkit-box;
    min-height: 42px;
    margin-top: 7px;
    overflow: hidden;
    color: #837d86;
    font-size: 14px;
    line-height: 1.5;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .project-card-body code {
    align-self: flex-start;
    margin-top: 13px;
    padding: 4px 7px;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 6px;
    background: rgb(0 0 0 / 0.16);
    color: #a49da8;
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .project-card-meta {
    justify-content: space-between;
    padding-top: 14px;
    border-top: 1px solid rgb(255 255 255 / 0.07);
  }

  .project-card-meta > span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #625d66;
    font-size: 13px;
  }

  .project-card-actions {
    gap: 5px;
  }

  .project-card-actions a,
  .project-card-actions button {
    display: inline-flex;
    width: 32px;
    height: 32px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 7px;
    color: #89828c;
  }

  .project-card-actions a:hover {
    border-color: rgb(249 93 17 / 0.24);
    background: rgb(249 93 17 / 0.08);
    color: #ff955b;
  }

  .project-card-actions .delete-project:hover {
    border-color: rgb(239 68 68 / 0.24);
    background: rgb(239 68 68 / 0.08);
    color: #f87171;
  }

  .modal-backdrop {
    position: fixed;
    z-index: 1000;
    inset: 0;
    background: rgb(5 5 7 / 0.78);
    backdrop-filter: blur(8px);
  }

  .modal-layer {
    position: fixed;
    z-index: 1010;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .project-modal {
    width: min(520px, 100%);
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.1);
    border-radius: 14px;
    background: #121216;
    box-shadow: 0 30px 100px rgb(0 0 0 / 0.65);
  }

  .project-modal-compact {
    width: min(460px, 100%);
  }

  .project-modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 20px;
    border-bottom: 1px solid rgb(255 255 255 / 0.08);
  }

  .project-modal-header h2 {
    color: #f0ecf1;
    font-size: 19px;
    font-weight: 600;
  }

  .project-modal-header p {
    margin-top: 4px;
    color: #77717b;
    font-size: 14px;
  }

  .project-modal-header > button {
    color: #77717b;
    font-size: 25px;
    line-height: 1;
  }

  .project-modal-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
  }

  .project-modal-body label {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .project-modal-body label > span {
    color: #b6b0b9;
    font-size: 14px;
    font-weight: 500;
  }

  .project-modal-body input,
  .project-modal-body textarea,
  .project-modal-body select {
    width: 100%;
    border: 1px solid rgb(255 255 255 / 0.09);
    border-radius: 8px;
    outline: none;
    background: rgb(255 255 255 / 0.025) !important;
    color: #e9e5ea !important;
    font-size: 14px;
  }

  .project-modal-body input,
  .project-modal-body select {
    height: 42px;
    padding: 0 12px;
  }

  .project-modal-body textarea {
    resize: vertical;
    padding: 10px 12px;
  }

  .project-modal-body input:focus,
  .project-modal-body textarea:focus,
  .project-modal-body select:focus {
    border-color: rgb(249 93 17 / 0.42);
    box-shadow: 0 0 0 3px rgb(249 93 17 / 0.1);
  }

  .project-modal-error {
    padding: 10px 12px;
    border: 1px solid rgb(239 68 68 / 0.24);
    border-radius: 8px;
    background: rgb(239 68 68 / 0.08);
    color: #fca5a5;
    font-size: 14px;
  }

  .project-create-note {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid rgb(52 211 153 / 0.16);
    border-radius: 8px;
    background: rgb(52 211 153 / 0.055);
    color: #8cd8ba;
    font-size: 13px;
    line-height: 1.45;
  }

  .project-modal-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 9px;
    padding: 14px 20px;
    border-top: 1px solid rgb(255 255 255 / 0.08);
  }

  .modal-button-secondary,
  .modal-button-primary,
  .modal-button-danger {
    display: inline-flex;
    height: 39px;
    align-items: center;
    justify-content: center;
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

  .modal-button-danger {
    border-color: rgb(239 68 68 / 0.4);
    background: rgb(239 68 68 / 0.9);
    color: #fff;
  }

  .modal-button-primary:disabled,
  .modal-button-danger:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .delete-copy {
    color: #a69fa9;
    font-size: 15px;
    line-height: 1.6;
  }

  @media (max-width: 1024px) {
    .projects-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .projects-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .projects-toolbar {
      align-items: flex-start;
      flex-direction: column;
    }

    .projects-search {
      width: 100%;
    }

    .projects-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
