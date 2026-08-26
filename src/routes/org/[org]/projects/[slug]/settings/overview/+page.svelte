<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import type { SubmitFunction } from '@sveltejs/kit';
  import {
    Archive,
    ArchiveRestore,
    BarChart3,
    Bot,
    Building2,
    CheckCircle,
    Copy,
    ExternalLink,
    GitBranch,
    Save,
    Shield,
    Terminal,
    Trash2,
  } from 'lucide-svelte';

  type ProjectModules = {
    vault: boolean;
    codereport: boolean;
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
  $: orgSlug = $page?.params?.org ?? '';
  $: isArchived = project.status === 'inactive';

  let saving = false;
  let error = '';
  let success = '';
  let slugCopied = false;

  let editName = data.project.name;
  let editSlug = data.project.slug;
  let editDescription = data.project.description ?? '';
  let editModules: ProjectModules = { ...data.project.modules };

  const moduleOptions: {
    key: keyof ProjectModules;
    label: string;
    icon: typeof Shield;
    href: string;
  }[] = [
    {
      key: 'vault',
      label: 'Vault',
      icon: Shield,
      href: `/org/${orgSlug}/projects/${data.project.slug}/vault`,
    },
    {
      key: 'codereport',
      label: 'Code Report',
      icon: BarChart3,
      href: `/org/${orgSlug}/projects/${data.project.slug}/code-report`,
    },
    {
      key: 'stateiac',
      label: 'State IaC',
      icon: GitBranch,
      href: `/org/${orgSlug}/projects/${data.project.slug}/state-iac`,
    },
  ];

  const integrationCards = [
    {
      label: 'GitOps CLI',
      description: `Conecta este proyecto con gitops project use ${data.project.slug}.`,
      icon: Terminal,
    },
    {
      label: 'GitOps Bot',
      description: 'Automatiza análisis y PRs para este proyecto.',
      icon: Bot,
    },
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

  const saveProject: SubmitFunction = ({ cancel }) => {
    error = '';
    if (!editName.trim()) {
      error = 'Project name is required.';
      cancel();
      return;
    }

    saving = true;
    return async ({ result, update }) => {
      await update();
      saving = false;

      if (result.type === 'success') {
        flashSuccess('Project updated.');
        return;
      }

      error =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : 'Failed to update project.';
    };
  };

  function openArchiveModal() {
    error = '';
    archiveModalOpen = true;
  }

  function closeArchiveModal() {
    archiveModalOpen = false;
  }

  const confirmArchive: SubmitFunction = () => {
    error = '';
    archiveLoading = true;
    const wasArchived = isArchived;
    return async ({ result, update }) => {
      await update();
      archiveLoading = false;

      if (result.type === 'success') {
        closeArchiveModal();
        flashSuccess(wasArchived ? 'Project reactivated.' : 'Project archived.');
        return;
      }

      error =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : 'Failed to update project status.';
    };
  };

  function openDeleteModal() {
    error = '';
    deleteModalOpen = true;
  }

  function closeDeleteModal() {
    deleteModalOpen = false;
  }

  const confirmDelete: SubmitFunction = () => {
    error = '';
    deleteLoading = true;
    return async ({ result, update }) => {
      await update();

      if (result.type === 'failure') {
        error = result.data?.error ? String(result.data.error) : 'Failed to delete project.';
        deleteLoading = false;
      }
    };
  };
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

  <form
    method="POST"
    action="?/updateProject"
    use:enhance={saveProject}
    class="overflow-hidden rounded-md border border-slate-200 bg-white"
  >
    <input type="hidden" name="id" value={project.id} />
    <input type="hidden" name="moduleVault" value={editModules.vault ? 'on' : ''} />
    <input type="hidden" name="moduleCodeReport" value={editModules.codereport ? 'on' : ''} />
    <input type="hidden" name="moduleStateIac" value={editModules.stateiac ? 'on' : ''} />
    <div class="flex items-center justify-end gap-3 border-b border-slate-200 px-4 py-4">
      {#if isArchived}
        <span
          class="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
        >
          <span class="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
          Archivado
        </span>
      {/if}

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
            name="name"
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
            name="slug"
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
          name="description"
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
          <div
            class="flex flex-col gap-3 rounded-md border px-4 py-3 text-left transition-colors {editModules[
              option.key
            ]
              ? 'border-slate-200 bg-white'
              : 'border-slate-200 bg-slate-100 text-slate-400'}"
          >
            <button
              type="button"
              on:click={() => toggleModule(option.key)}
              class="flex items-center justify-between text-left"
            >
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
            </button>

            <div class="flex items-center justify-between gap-2">
              <span
                class="inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium {editModules[
                  option.key
                ]
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-200 text-slate-500'}"
              >
                {editModules[option.key] ? 'Activo' : 'Desactivado'}
              </span>

              {#if editModules[option.key]}
                <a
                  href={option.href}
                  class="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Abrir
                  <ExternalLink class="h-3 w-3" />
                </a>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
      <button
        type="submit"
        disabled={saving}
        class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
      >
        <Save class="h-4 w-4" />
        {saving ? 'Saving...' : 'Save changes'}
      </button>
    </div>
  </form>

  <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
    <div class="border-b border-slate-200 px-4 py-3">
      <h3 class="text-sm font-semibold text-slate-900">Integraciones</h3>
      <p class="mt-1 text-xs text-slate-500">Conecta este proyecto con las herramientas GitOps.</p>
    </div>

    <div class="grid gap-4 p-4 sm:grid-cols-2">
      {#each integrationCards as card (card.label)}
        <div
          class="flex items-start gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 opacity-75"
        >
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600"
          >
            <svelte:component this={card.icon} class="h-4 w-4" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-sm font-semibold text-slate-900">{card.label}</p>
              <span
                class="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600"
              >
                Próximamente
              </span>
            </div>
            <p class="mt-1 text-xs leading-5 text-slate-600">{card.description}</p>
          </div>
        </div>
      {/each}
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
          <p class="text-sm font-medium text-slate-900">
            {isArchived ? 'Activar proyecto' : 'Archivar proyecto'}
          </p>
          <p class="mt-1 text-xs text-slate-500">
            {isArchived
              ? 'El proyecto volverá a estado activo y se listará de nuevo.'
              : 'El proyecto pasará a estado inactivo y dejará de listarse como activo.'}
          </p>
        </div>
        <button
          type="button"
          on:click={openArchiveModal}
          class="btn-secondary inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
        >
          {#if isArchived}
            <ArchiveRestore class="h-3.5 w-3.5" />
            Activar
          {:else}
            <Archive class="h-3.5 w-3.5" />
            Archivar
          {/if}
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
        <h5 class="text-sm font-semibold text-slate-900">
          {isArchived ? 'Activate project' : 'Archive project'}
        </h5>
      </div>

      <form method="POST" action="?/updateProjectStatus" use:enhance={confirmArchive}>
        <input type="hidden" name="id" value={project.id} />
        <input type="hidden" name="status" value={isArchived ? 'active' : 'inactive'} />

        <div class="px-4 py-4 text-sm text-slate-600">
          {#if isArchived}
            Are you sure you want to activate <span class="font-medium text-slate-900"
              >{project.name}</span
            >? It will be marked as active again.
          {:else}
            Are you sure you want to archive <span class="font-medium text-slate-900"
              >{project.name}</span
            >? It will be marked as inactive.
          {/if}
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
            type="submit"
            disabled={archiveLoading}
            class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
          >
            {#if isArchived}
              <ArchiveRestore class="h-4 w-4" />
              {archiveLoading ? 'Activating...' : 'Activate project'}
            {:else}
              <Archive class="h-4 w-4" />
              {archiveLoading ? 'Archiving...' : 'Archive project'}
            {/if}
          </button>
        </div>
      </form>
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

      <form method="POST" action="?/deleteProject" use:enhance={confirmDelete}>
        <input type="hidden" name="id" value={project.id} />
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
            type="submit"
            disabled={deleteLoading}
            class="btn-danger inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
          >
            <Trash2 class="h-4 w-4" />
            {deleteLoading ? 'Deleting...' : 'Delete project'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
