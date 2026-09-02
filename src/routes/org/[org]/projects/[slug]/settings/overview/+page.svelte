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
  } from '@lucide/svelte';
  import { _ } from 'svelte-i18n';

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

  export let data: { project: ProjectRow; canUpdate: boolean; canDelete: boolean };

  $: project = data.project;
  $: canUpdate = data.canUpdate;
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

  type ModuleOption = {
    key: keyof ProjectModules;
    label: string;
    icon: typeof Shield;
    href: string;
    soon?: boolean;
  };

  $: moduleOptions = [
    {
      key: 'vault',
      label: 'Vault',
      icon: Shield,
      href: `/org/${orgSlug}/projects/${project.slug}/vault`,
      soon: true,
    },
    {
      key: 'codereport',
      label: 'Code Report',
      icon: BarChart3,
      href: `/org/${orgSlug}/projects/${project.slug}/code-report`,
    },
    {
      key: 'stateiac',
      label: 'State IaC',
      icon: GitBranch,
      href: `/org/${orgSlug}/projects/${project.slug}/state-iac`,
      soon: true,
    },
  ] satisfies ModuleOption[];

  $: integrationCards = [
    {
      label: 'GitOps CLI',
      description: $_('projectSettings.overview.gitopsCliDescription', {
        values: { slug: data.project.slug },
      }),
      href: 'https://getgitops.com/docs/cli',
      icon: Terminal,
    },
    {
      label: 'GitOps Bot',
      description: $_('projectSettings.overview.gitopsBotDescription'),
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
    if (moduleOptions.some((option) => option.key === key && option.soon)) return;
    editModules = { ...editModules, [key]: !editModules[key] };
  }

  function moduleValueForSubmit(key: keyof ProjectModules) {
    const option = moduleOptions.find((moduleOption) => moduleOption.key === key);
    return editModules[key] && !option?.soon ? 'on' : '';
  }

  async function copySlug() {
    try {
      await navigator.clipboard.writeText(project.slug);
      slugCopied = true;
      setTimeout(() => {
        slugCopied = false;
      }, 2000);
    } catch {
      error = $_('projectSettings.overview.copyFailed');
    }
  }

  const saveProject: SubmitFunction = ({ cancel }) => {
    error = '';
    if (!editName.trim()) {
      error = $_('projectSettings.overview.nameRequired');
      cancel();
      return;
    }

    saving = true;
    return async ({ result, update }) => {
      await update();
      saving = false;

      if (result.type === 'success') {
        flashSuccess($_('projectSettings.overview.updated'));
        return;
      }

      error =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : $_('projectSettings.overview.updateFailed');
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
        flashSuccess(
          wasArchived
            ? $_('projectSettings.overview.reactivated')
            : $_('projectSettings.overview.archived'),
        );
        return;
      }

      error =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : $_('projectSettings.overview.statusUpdateFailed');
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
        error = result.data?.error
          ? String(result.data.error)
          : $_('projectSettings.overview.deleteFailed');
        deleteLoading = false;
      }
    };
  };
</script>

<svelte:head>
  <title>{$_('projectSettings.overview.title')} - {project.name}</title>
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
    <input type="hidden" name="moduleVault" value={moduleValueForSubmit('vault')} />
    <input type="hidden" name="moduleCodeReport" value={moduleValueForSubmit('codereport')} />
    <input type="hidden" name="moduleStateIac" value={moduleValueForSubmit('stateiac')} />
    <div class="flex items-center justify-end gap-3 border-b border-slate-200 px-4 py-4">
      {#if isArchived}
        <span
          class="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
        >
          <span class="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
          {$_('projectSettings.overview.archivedBadge')}
        </span>
      {/if}

      <button
        type="button"
        on:click={copySlug}
        class="btn-secondary inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
      >
        <Copy class="h-3.5 w-3.5" />
        {slugCopied
          ? $_('projectSettings.overview.slugCopied')
          : $_('projectSettings.overview.copyProjectSlug')}
      </button>
    </div>

    <div class="space-y-4 px-4 py-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="block text-sm font-medium text-slate-700" for="edit-project-name"
            >{$_('common.name')}</label
          >
          {#if canUpdate}
            <input
              id="edit-project-name"
              name="name"
              type="text"
              bind:value={editName}
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
            />
          {:else}
            <p
              id="edit-project-name"
              class="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            >
              {project.name}
            </p>
          {/if}
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="edit-project-slug"
            >{$_('common.slug')}</label
          >
          {#if canUpdate}
            <input
              id="edit-project-slug"
              name="slug"
              type="text"
              bind:value={editSlug}
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
            />
          {:else}
            <p
              id="edit-project-slug"
              class="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            >
              {project.slug}
            </p>
          {/if}
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-slate-700" for="edit-project-description">
          {$_('common.description')}
        </label>
        {#if canUpdate}
          <textarea
            id="edit-project-description"
            name="description"
            bind:value={editDescription}
            rows="4"
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
            placeholder={$_('projectSettings.overview.optionalDescription')}></textarea>
        {:else}
          <p
            id="edit-project-description"
            class="mt-2 w-full whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          >
            {project.description || $_('projectSettings.overview.optionalDescription')}
          </p>
        {/if}
      </div>
    </div>

    <div class="border-t border-slate-200 px-4 py-4">
      <p class="text-sm font-medium text-slate-700">{$_('projectSettings.overview.modules')}</p>
      <p class="mt-1 text-xs text-slate-500">
        {$_('projectSettings.overview.modulesDescription')}
      </p>

      <div class="mt-3 grid gap-3 sm:grid-cols-3">
        {#each moduleOptions as option (option.key)}
          {@const moduleEnabled = editModules[option.key] && !option.soon}
          <label
            class="group flex cursor-pointer flex-col gap-3 rounded-md border px-4 py-3 text-left transition-colors {moduleEnabled
              ? 'border-[#2457ff]/55 bg-[#082057]/70 shadow-[0_0_24px_rgba(36,87,255,0.14)]'
              : 'border-slate-200 bg-slate-100 text-slate-400'} {canUpdate && !option.soon ? 'hover:border-[#2457ff]/70' : 'cursor-default opacity-75'}"
          >
            <span class="flex items-start justify-between gap-3">
              <span
                class="flex items-center gap-2 text-sm font-medium {moduleEnabled
                  ? 'text-slate-900'
                  : 'text-slate-500'}"
              >
                <svelte:component
                  this={option.icon}
                  class="h-4 w-4 {moduleEnabled ? 'text-[#4b83ff]' : 'text-slate-400'}"
                />
                {option.label}
              </span>

              <span class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors {moduleEnabled ? 'border-[#2457ff] bg-[#2457ff]' : 'border-slate-300 bg-slate-200'}">
                <span class="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform {moduleEnabled ? 'translate-x-5' : 'translate-x-1'}"></span>
              </span>
            </span>

            <input
              type="checkbox"
              class="sr-only"
              checked={moduleEnabled}
              disabled={!canUpdate || option.soon}
              aria-label={`${option.label}: ${moduleEnabled ? $_('projectSettings.overview.moduleActive') : option.soon ? $_('common.comingSoon') : $_('projectSettings.overview.moduleDisabled')}`}
              on:change={() => toggleModule(option.key)}
            />

            <div class="flex items-center justify-between gap-2">
              <span
                class="inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium {moduleEnabled
                  ? 'bg-emerald-50 text-emerald-700'
                  : option.soon
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-slate-200 text-slate-500'}"
              >
                {#if option.soon}
                  {$_('common.comingSoon')}
                {:else if moduleEnabled}
                  {$_('projectSettings.overview.moduleActive')}
                {:else}
                  {$_('projectSettings.overview.moduleDisabled')}
                {/if}
              </span>

              {#if moduleEnabled}
                <a
                  href={option.href}
                  class="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  {$_('projectSettings.overview.open')}
                  <ExternalLink class="h-3 w-3" />
                </a>
              {/if}
            </div>
          </label>
        {/each}
      </div>
    </div>

    {#if canUpdate}
      <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button
          type="submit"
          disabled={saving}
          class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
        >
          <Save class="h-4 w-4" />
          {saving ? $_('common.saving') : $_('projectSettings.overview.saveChanges')}
        </button>
      </div>
    {/if}
  </form>

  <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
    <div class="border-b border-slate-200 px-4 py-3">
      <h3 class="text-sm font-semibold text-slate-900">
        {$_('projectSettings.overview.integrations')}
      </h3>
      <p class="mt-1 text-xs text-slate-500">
        {$_('projectSettings.overview.integrationsDescription')}
      </p>
    </div>

    <div class="grid gap-4 p-4 sm:grid-cols-2">
      {#each integrationCards as card (card.label)}
        <svelte:element
          this={card.href ? 'a' : 'div'}
          href={card.href}
          target={card.href ? '_blank' : undefined}
          rel={card.href ? 'noopener noreferrer' : undefined}
          class="group flex items-start gap-3 rounded-md border p-4 {card.href
            ? 'border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300 hover:shadow-md'
            : 'border-dashed border-slate-300 bg-slate-50 opacity-75'}"
        >
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700"
          >
            <svelte:component this={card.icon} class="h-4 w-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="text-sm font-semibold text-slate-900">{card.label}</p>
              {#if !card.href}
                <span
                  class="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600"
                >
                  {$_('projectSettings.overview.comingSoon')}
                </span>
              {/if}
            </div>
            <p class="mt-1 text-xs leading-5 text-slate-600">{card.description}</p>
          </div>
          {#if card.href}
            <ExternalLink
              class="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-900"
            />
          {/if}
        </svelte:element>
      {/each}
    </div>
  </section>

  {#if canUpdate || data.canDelete}
    <section class="overflow-hidden rounded-md border border-red-200 bg-white">
      <div class="border-b border-red-200 bg-red-50 px-4 py-3">
        <h3 class="text-sm font-semibold text-red-800">
          {$_('projectSettings.overview.dangerZone')}
        </h3>
      </div>

      <div class="divide-y divide-slate-100">
        {#if canUpdate}
          <div class="flex items-center justify-between gap-4 px-4 py-4">
            <div>
              <p class="text-sm font-medium text-slate-900">
                {$_('projectSettings.overview.transferToOrganization')}
              </p>
              <p class="mt-1 text-xs text-slate-500">
                {$_('projectSettings.overview.transferDescription')}
              </p>
            </div>
            <button
              type="button"
              disabled
              title={$_('projectSettings.overview.transferSoon')}
              class="btn-secondary inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium opacity-50"
            >
              <Building2 class="h-3.5 w-3.5" />
              {$_('projectSettings.overview.transfer')}
            </button>
          </div>

          <div class="flex items-center justify-between gap-4 px-4 py-4">
            <div>
              <p class="text-sm font-medium text-slate-900">
                {isArchived
                  ? $_('projectSettings.overview.activateProject')
                  : $_('projectSettings.overview.archiveProject')}
              </p>
              <p class="mt-1 text-xs text-slate-500">
                {isArchived
                  ? $_('projectSettings.overview.activateDescription')
                  : $_('projectSettings.overview.archiveDescription')}
              </p>
            </div>
            <button
              type="button"
              on:click={openArchiveModal}
              class="btn-secondary inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
            >
              {#if isArchived}
                <ArchiveRestore class="h-3.5 w-3.5" />
                {$_('projectSettings.overview.activate')}
              {:else}
                <Archive class="h-3.5 w-3.5" />
                {$_('projectSettings.overview.archive')}
              {/if}
            </button>
          </div>
        {/if}

        {#if data.canDelete}
          <div class="flex items-center justify-between gap-4 px-4 py-4">
            <div>
              <p class="text-sm font-medium text-slate-900">
                {$_('projectSettings.overview.deleteProject')}
              </p>
              <p class="mt-1 text-xs text-slate-500">
                {$_('projectSettings.overview.deleteDescription')}
              </p>
            </div>
            <button
              type="button"
              on:click={openDeleteModal}
              class="btn-danger inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium"
            >
              <Trash2 class="h-3.5 w-3.5" />
              {$_('common.delete')}
            </button>
          </div>
        {/if}
      </div>
    </section>
  {/if}
</div>

{#if archiveModalOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-slate-900/50"
    on:click={closeArchiveModal}
    aria-label={$_('projectSettings.overview.closeArchiveModal')}
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label={$_('projectSettings.overview.archiveModal')}
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">
          {isArchived
            ? $_('projectSettings.overview.activateProjectModal')
            : $_('projectSettings.overview.archiveProjectModal')}
        </h5>
      </div>

      <form method="POST" action="?/updateProjectStatus" use:enhance={confirmArchive}>
        <input type="hidden" name="id" value={project.id} />
        <input type="hidden" name="status" value={isArchived ? 'active' : 'inactive'} />

        <div class="px-4 py-4 text-sm text-slate-600">
          {#if isArchived}
            {$_('projectSettings.overview.activateConfirmationStart')}
            <span class="font-medium text-slate-900">{project.name}</span>{$_(
              'projectSettings.overview.activateConfirmationEnd',
            )}
          {:else}
            {$_('projectSettings.overview.archiveConfirmationStart')}
            <span class="font-medium text-slate-900">{project.name}</span>{$_(
              'projectSettings.overview.archiveConfirmationEnd',
            )}
          {/if}
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            on:click={closeArchiveModal}
            class="btn-secondary rounded-md px-3 py-2 text-sm font-medium"
          >
            {$_('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={archiveLoading}
            class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
          >
            {#if isArchived}
              <ArchiveRestore class="h-4 w-4" />
              {archiveLoading
                ? $_('projectSettings.overview.activating')
                : $_('projectSettings.overview.activateProject')}
            {:else}
              <Archive class="h-4 w-4" />
              {archiveLoading
                ? $_('projectSettings.overview.archiving')
                : $_('projectSettings.overview.archiveProject')}
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
    aria-label={$_('projectSettings.overview.closeDeleteModal')}
  ></button>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label={$_('projectSettings.overview.deleteModal')}
    >
      <div class="border-b border-slate-200 px-4 py-3">
        <h5 class="text-sm font-semibold text-slate-900">
          {$_('projectSettings.overview.deleteProject')}
        </h5>
      </div>

      <form method="POST" action="?/deleteProject" use:enhance={confirmDelete}>
        <input type="hidden" name="id" value={project.id} />
        <div class="px-4 py-4 text-sm text-slate-600">
          {$_('projectSettings.overview.deleteConfirmationStart')}
          <span class="font-medium text-slate-900">{project.name}</span>{$_(
            'projectSettings.overview.deleteConfirmationEnd',
          )}
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
              ? $_('projectSettings.overview.deleting')
              : $_('projectSettings.overview.deleteProject')}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
