<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import {
    Activity,
    ArrowUpRight,
    BarChart3,
    FolderKanban,
    FolderPlus,
    LoaderCircle,
    MoreHorizontal,
    Plus,
    Search,
    Settings,
    Shield,
    Trash2,
    X,
  } from '@lucide/svelte';
  import { DropdownMenu, Field, MenuItem, Modal, Select, Tabs, toast } from '#lib/components/ui';
  import { _, locale } from '#lib/i18n';

  type ProjectModules = { vault?: boolean; codereport?: boolean; monitoring?: boolean };

  type ProjectRow = {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    status: 'active' | 'inactive';
    modules?: ProjectModules;
    createdAt: string;
    updatedAt: string;
  };

  type StatusFilter = 'all' | 'active' | 'inactive';

  let {
    data,
  }: {
    data: {
      organization: { id: string; slug: string } | null;
      projects: ProjectRow[];
      canCreate: boolean;
      canDelete: boolean;
    };
  } = $props();

  const orgSlug = $derived(data.organization?.slug ?? '');

  let searchQuery = $state('');
  let statusFilter = $state<StatusFilter>('all');
  let searchInput = $state<HTMLInputElement>();

  const counts = $derived({
    all: data.projects.length,
    active: data.projects.filter((project) => project.status === 'active').length,
    inactive: data.projects.filter((project) => project.status === 'inactive').length,
  });

  const filteredProjects = $derived.by(() => {
    const query = searchQuery.trim().toLowerCase();
    return data.projects
      .filter((project) => {
        const matchesQuery =
          !query ||
          project.name.toLowerCase().includes(query) ||
          project.slug.toLowerCase().includes(query) ||
          (project.description ?? '').toLowerCase().includes(query);
        const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
        return matchesQuery && matchesStatus;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  const moduleChips = [
    { key: 'codereport', label: 'Code Report', icon: BarChart3 },
    { key: 'vault', label: 'Vault', icon: Shield },
    { key: 'monitoring', label: 'Monitoring', icon: Activity },
  ] as const;

  // crear
  let createOpen = $state(false);
  let creating = $state(false);
  let newName = $state('');
  let newSlug = $state('');
  let newDescription = $state('');
  let newStatus = $state<'active' | 'inactive'>('active');
  let nameError = $state('');

  const slugPreview = $derived(
    newName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, ''),
  );

  // eliminar
  let deleteTarget = $state<ProjectRow | null>(null);
  let deleteOpen = $state(false);
  let deleting = $state(false);
  let deleteConfirm = $state('');

  function projectHref(project: ProjectRow) {
    return `/org/${orgSlug}/projects/${project.slug}/overview`;
  }

  function initials(name: string) {
    const words = name.trim().split(/\s+/).filter(Boolean);
    const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
    return letters.toUpperCase();
  }

  function formatDate(value: string) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString($locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return value;
    }
  }

  function failureMessage(
    result: { type: string; data?: Record<string, unknown> },
    fallback: string,
  ) {
    return result.type === 'failure' && result.data?.error ? String(result.data.error) : fallback;
  }

  function openCreate() {
    newName = '';
    newSlug = '';
    newDescription = '';
    newStatus = 'active';
    nameError = '';
    createOpen = true;
  }

  function openDelete(project: ProjectRow) {
    deleteTarget = project;
    deleteConfirm = '';
    deleteOpen = true;
  }

  function clearFilters() {
    searchQuery = '';
    statusFilter = 'all';
    searchInput?.focus();
  }

  const createProject: SubmitFunction = ({ cancel }) => {
    nameError = '';
    if (!newName.trim()) {
      nameError = $_('orgSettings.projects.nameRequired');
      cancel();
      return;
    }
    if (!data.organization) {
      toast.error($_('orgSettings.projects.noOrganization'));
      cancel();
      return;
    }
    creating = true;
    return async ({ result, update }) => {
      await update();
      creating = false;
      if (result.type === 'success') {
        createOpen = false;
        toast.success($_('orgSettings.projects.created'));
      } else {
        toast.error(failureMessage(result, $_('orgSettings.projects.createFailed')));
      }
    };
  };

  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (!deleteTarget || deleteConfirm !== deleteTarget.name) {
      cancel();
      return;
    }
    deleting = true;
    return async ({ result, update }) => {
      await update();
      deleting = false;
      if (result.type === 'success') {
        deleteOpen = false;
        toast.success($_('orgSettings.projects.deleted'));
      } else {
        toast.error(failureMessage(result, $_('orgSettings.projects.deleteFailed')));
      }
    };
  };
</script>

<svelte:head>
  <title>{$_('orgSettings.projects.title')} - {$_('orgSettings.title')}</title>
</svelte:head>

<div class="space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-white">
        {$_('orgSettings.projects.title')}
      </h1>
      <p class="mt-1 text-sm text-fg-muted">{$_('orgSettings.projects.description')}</p>
    </div>
    {#if data.canCreate}
      <button type="button" class="k-btn k-btn-primary" onclick={openCreate}>
        <Plus class="h-4 w-4" />{$_('orgSettings.projects.new')}
      </button>
    {/if}
  </header>

  {#if data.projects.length > 0}
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div class="relative flex-1 sm:max-w-md">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
        />
        <input
          bind:this={searchInput}
          type="search"
          bind:value={searchQuery}
          aria-label={$_('orgSettings.projects.searchPlaceholder')}
          placeholder={$_('orgSettings.projects.searchPlaceholder')}
          class="k-input h-9 pl-9 pr-9"
        />
        {#if searchQuery}
          <button
            type="button"
            class="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-fg-subtle hover:bg-white/5 hover:text-white"
            aria-label={$_('orgSettings.projects.clearSearch')}
            onclick={() => {
              searchQuery = '';
              searchInput?.focus();
            }}
          >
            <X class="h-3.5 w-3.5" />
          </button>
        {/if}
      </div>
      <div class="sm:ml-auto">
        <Tabs
          variant="segmented"
          size="sm"
          label={$_('orgSettings.projects.filterLabel')}
          value={statusFilter}
          onchange={(value) => (statusFilter = value as StatusFilter)}
          items={[
            { value: 'all', label: $_('orgSettings.projects.filterAll'), count: counts.all },
            {
              value: 'active',
              label: $_('orgSettings.projects.filterActive'),
              count: counts.active,
            },
            {
              value: 'inactive',
              label: $_('orgSettings.projects.filterArchived'),
              count: counts.inactive,
            },
          ]}
        />
      </div>
    </div>
  {/if}

  {#if data.projects.length === 0}
    <div class="k-card flex flex-col items-center gap-3 border-dashed px-6 py-16 text-center">
      <span class="grid h-12 w-12 place-items-center rounded-xl bg-brand-500/10 text-brand-400">
        <FolderKanban class="h-6 w-6" />
      </span>
      <p class="text-sm font-medium text-white">{$_('orgSettings.projects.empty')}</p>
      <p class="max-w-sm text-sm text-fg-muted">{$_('orgSettings.projects.emptyDescription')}</p>
      {#if data.canCreate}
        <button type="button" class="k-btn k-btn-primary k-btn-sm mt-2" onclick={openCreate}>
          <Plus class="h-3.5 w-3.5" />{$_('orgSettings.projects.new')}
        </button>
      {/if}
    </div>
  {:else if filteredProjects.length === 0}
    <div class="k-card flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
      <span class="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-fg-subtle">
        <Search class="h-5 w-5" />
      </span>
      <p class="text-sm text-fg-muted">{$_('orgSettings.projects.emptyFiltered')}</p>
      <button type="button" class="k-btn k-btn-ghost k-btn-sm" onclick={clearFilters}>
        {$_('orgSettings.projects.clearFilters')}
      </button>
    </div>
  {:else}
    <ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {#each filteredProjects as project (project.id)}
        {@const archived = project.status === 'inactive'}
        {@const activeModules = moduleChips.filter((chip) => project.modules?.[chip.key])}
        <li
          class="k-card k-card-hover relative flex flex-col p-5 focus-within:border-brand-500/40 {archived
            ? 'opacity-70 hover:opacity-100'
            : ''}"
        >
          <div class="flex items-start gap-3">
            <span
              class="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-semibold {archived
                ? 'bg-white/5 text-fg-subtle'
                : 'bg-brand-500/12 text-brand-400'}"
              aria-hidden="true"
            >
              {initials(project.name)}
            </span>
            <div class="min-w-0 flex-1">
              <a
                href={projectHref(project)}
                class="block truncate text-sm font-semibold text-white outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
                >{project.name}</a
              >
              <p class="truncate font-mono text-xs text-fg-subtle">{project.slug}</p>
            </div>
            <div class="relative z-10 -mr-2 -mt-1">
              <DropdownMenu
                align="end"
                label={$_('orgSettings.projects.actionsFor', { values: { name: project.name } })}
              >
                {#snippet trigger(props)}
                  <button
                    {...props}
                    class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                    aria-label={$_('orgSettings.projects.actionsFor', {
                      values: { name: project.name },
                    })}
                  >
                    <MoreHorizontal class="h-4 w-4" />
                  </button>
                {/snippet}
                <MenuItem icon={ArrowUpRight} href={projectHref(project)}>
                  {$_('orgSettings.projects.viewProject')}
                </MenuItem>
                <MenuItem
                  icon={Settings}
                  href={`/org/${orgSlug}/projects/${project.slug}/settings/overview`}
                >
                  {$_('orgSettings.projects.projectSettings')}
                </MenuItem>
                {#if data.canDelete}
                  <MenuItem icon={Trash2} tone="danger" onclick={() => openDelete(project)}>
                    {$_('orgSettings.projects.deleteProject')}
                  </MenuItem>
                {/if}
              </DropdownMenu>
            </div>
          </div>

          <p
            class="mt-3 line-clamp-2 min-h-10 text-sm {project.description
              ? 'text-fg-muted'
              : 'text-fg-subtle italic'}"
          >
            {project.description || $_('orgSettings.projects.noDescription')}
          </p>

          <div class="mt-4 flex min-h-6 flex-wrap gap-1.5">
            {#each activeModules as chip (chip.key)}
              <span class="k-badge h-6 gap-1 px-2 text-[11px]">
                <chip.icon class="h-3 w-3" />{chip.label}
              </span>
            {:else}
              <span class="text-xs text-fg-subtle">{$_('orgSettings.projects.noModules')}</span>
            {/each}
          </div>

          <div
            class="mt-4 flex items-center justify-between gap-2 border-t border-white/8 pt-3 text-xs text-fg-subtle"
          >
            {#if archived}
              <span class="k-badge k-badge-warn h-5 px-2 text-[11px]"
                >{$_('orgSettings.projects.archived')}</span
              >
            {:else}
              <span class="k-badge k-badge-ok h-5 px-2 text-[11px]">{$_('common.active')}</span>
            {/if}
            <span
              >{$_('orgSettings.projects.createdOn', {
                values: { date: formatDate(project.createdAt) },
              })}</span
            >
          </div>
        </li>
      {/each}

      {#if data.canCreate && statusFilter !== 'inactive' && !searchQuery}
        <li>
          <button
            type="button"
            onclick={openCreate}
            class="flex h-full min-h-52 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/12 p-5 text-sm text-fg-muted transition-colors hover:border-brand-500/40 hover:bg-white/2 hover:text-white"
          >
            <span class="grid h-10 w-10 place-items-center rounded-xl bg-white/5">
              <FolderPlus class="h-5 w-5" />
            </span>
            {$_('orgSettings.projects.new')}
          </button>
        </li>
      {/if}
    </ul>
  {/if}
</div>

<Modal
  bind:open={createOpen}
  dismissible={!creating}
  title={$_('orgSettings.projects.createModalTitle')}
  description={$_('orgSettings.projects.createModalDescription')}
>
  {#snippet icon()}
    <span
      class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-400"
      ><FolderPlus class="h-5 w-5" /></span
    >
  {/snippet}
  <form
    id="create-project-form"
    method="POST"
    action="?/createProject"
    use:enhance={createProject}
    class="grid gap-4"
  >
    <input type="hidden" name="organizationId" value={data.organization?.id ?? ''} />
    <Field id="new-project-name" label={$_('common.name')} required error={nameError}>
      {#snippet children(control)}
        <input
          {...control}
          name="name"
          class="k-input"
          placeholder="Platform Core"
          autocomplete="off"
          data-autofocus
          bind:value={newName}
        />
      {/snippet}
    </Field>
    <Field
      id="new-project-slug"
      label={$_('common.slug')}
      help={$_('orgSettings.projects.slugHelp')}
    >
      {#snippet children(control)}
        <input
          {...control}
          name="slug"
          class="k-input font-mono text-[13px]"
          placeholder={slugPreview || 'platform-core'}
          autocomplete="off"
          bind:value={newSlug}
        />
      {/snippet}
    </Field>
    <Field id="new-project-description" label={$_('common.description')}>
      {#snippet children(control)}
        <textarea
          {...control}
          name="description"
          rows="3"
          class="k-input"
          placeholder={$_('orgSettings.projects.descriptionPlaceholder')}
          bind:value={newDescription}></textarea>
      {/snippet}
    </Field>
    <Field id="new-project-status" label={$_('common.status')}>
      {#snippet children(control)}
        <Select
          {...control}
          name="status"
          value={newStatus}
          onchange={(value) => (newStatus = value as 'active' | 'inactive')}
          options={[
            { value: 'active', label: $_('common.active') },
            { value: 'inactive', label: $_('orgSettings.projects.archived') },
          ]}
        />
      {/snippet}
    </Field>
  </form>
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (createOpen = false)}
      >{$_('common.cancel')}</button
    >
    <button form="create-project-form" class="k-btn k-btn-primary" disabled={creating}>
      {#if creating}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Plus
          class="h-4 w-4"
        />{/if}
      {creating ? $_('orgSettings.projects.creating') : $_('orgSettings.projects.createProject')}
    </button>
  {/snippet}
</Modal>

<Modal
  bind:open={deleteOpen}
  role="alertdialog"
  size="sm"
  dismissible={!deleting}
  title={$_('orgSettings.projects.deleteConfirmTitle')}
  description={deleteTarget
    ? `${$_('orgSettings.projects.deleteConfirmStart')}${deleteTarget.name}${$_('orgSettings.projects.deleteConfirmEnd')}`
    : ''}
>
  {#snippet icon()}
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
      ><Trash2 class="h-5 w-5" /></span
    >
  {/snippet}
  {#if deleteTarget}
    <form
      id="delete-org-project-form"
      method="POST"
      action="?/deleteProject"
      use:enhance={confirmDelete}
    >
      <input type="hidden" name="id" value={deleteTarget.id} />
      <Field
        label={$_('projectSettings.overview.typeToConfirm', {
          values: { name: deleteTarget.name },
        })}
      >
        {#snippet children(control)}
          <input
            {...control}
            class="k-input font-mono text-[13px]"
            autocomplete="off"
            data-autofocus
            bind:value={deleteConfirm}
          />
        {/snippet}
      </Field>
    </form>
  {/if}
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (deleteOpen = false)}
      >{$_('common.cancel')}</button
    >
    <button
      form="delete-org-project-form"
      class="k-btn k-btn-danger"
      disabled={deleting || !deleteTarget || deleteConfirm !== deleteTarget.name}
    >
      {#if deleting}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Trash2
          class="h-4 w-4"
        />{/if}
      {deleting ? $_('orgSettings.projects.deleting') : $_('orgSettings.projects.deleteProject')}
    </button>
  {/snippet}
</Modal>
