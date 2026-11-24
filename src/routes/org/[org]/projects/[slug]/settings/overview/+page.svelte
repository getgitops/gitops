<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import {
    Activity,
    Archive,
    ArchiveRestore,
    ArrowUpRight,
    BarChart3,
    Bot,
    Building2,
    Check,
    Copy,
    GitBranch,
    LoaderCircle,
    Save,
    Shield,
    Terminal,
    Trash2,
    TriangleAlert,
  } from '@lucide/svelte';
  import { Field, Modal, Switch, toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';

  type ProjectModules = {
    vault: boolean;
    codereport: boolean;
    stateiac: boolean;
    monitoring?: boolean;
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

  let { data }: { data: { project: ProjectRow; canUpdate: boolean; canDelete: boolean } } =
    $props();

  const project = $derived(data.project);
  const canUpdate = $derived(data.canUpdate);
  const orgSlug = $derived(page.params.org ?? '');
  const isArchived = $derived(project.status === 'inactive');
  const projectBase = $derived(`/org/${orgSlug}/projects/${project.slug}`);

  // borrador editable; se reinicia cuando cambia el proyecto guardado
  // (valores iniciales también en SSR; el efecto los resincroniza tras guardar)
  let editName = $state(untrack(() => data.project.name));
  let editSlug = $state(untrack(() => data.project.slug));
  let editDescription = $state(untrack(() => data.project.description ?? ''));
  let editModules = $state<ProjectModules>(untrack(() => ({ ...data.project.modules })));
  $effect.pre(() => {
    editName = project.name;
    editSlug = project.slug;
    editDescription = project.description ?? '';
    editModules = { ...project.modules };
  });

  const dirty = $derived(
    editName !== project.name ||
      editSlug !== project.slug ||
      editDescription !== (project.description ?? '') ||
      Boolean(editModules.vault) !== Boolean(project.modules.vault) ||
      Boolean(editModules.codereport) !== Boolean(project.modules.codereport) ||
      Boolean(editModules.monitoring) !== Boolean(project.modules.monitoring),
  );

  let saving = $state(false);
  let slugCopied = $state(false);
  let archiveOpen = $state(false);
  let archiving = $state(false);
  let deleteOpen = $state(false);
  let deleting = $state(false);
  let deleteConfirm = $state('');

  type ModuleOption = {
    key: 'vault' | 'codereport' | 'monitoring' | 'stateiac';
    label: string;
    description: string;
    icon: typeof Shield;
    href: string;
    soon?: boolean;
  };

  const moduleOptions: ModuleOption[] = $derived([
    {
      key: 'codereport',
      label: 'Code Report',
      description: $_('projectSettings.overview.moduleCodeReport'),
      icon: BarChart3,
      href: `${projectBase}/code-report/dashboard`,
    },
    {
      key: 'vault',
      label: 'Vault',
      description: $_('projectSettings.overview.moduleVault'),
      icon: Shield,
      href: `${projectBase}/vault`,
    },
    {
      key: 'monitoring',
      label: 'Monitoring',
      description: $_('projectSettings.overview.moduleMonitoring'),
      icon: Activity,
      href: `${projectBase}/monitoring/dashboard`,
    },
    {
      key: 'stateiac',
      label: 'State IaC',
      description: $_('projectSettings.overview.moduleStateIac'),
      icon: GitBranch,
      href: `${projectBase}/state-iac`,
      soon: true,
    },
  ]);

  async function copySlug() {
    try {
      await navigator.clipboard.writeText(project.slug);
      slugCopied = true;
      setTimeout(() => (slugCopied = false), 2000);
    } catch {
      toast.error($_('projectSettings.overview.copyFailed'));
    }
  }

  function failureMessage(
    result: { type: string; data?: Record<string, unknown> },
    fallback: string,
  ) {
    return result.type === 'failure' && result.data?.error ? String(result.data.error) : fallback;
  }

  const saveProject: SubmitFunction = ({ cancel }) => {
    if (!editName.trim()) {
      toast.error($_('projectSettings.overview.nameRequired'));
      cancel();
      return;
    }
    saving = true;
    return async ({ result, update }) => {
      await update({ reset: false });
      saving = false;
      if (result.type === 'success' || result.type === 'redirect') {
        toast.success($_('projectSettings.overview.updated'));
      } else {
        toast.error(failureMessage(result, $_('projectSettings.overview.updateFailed')));
      }
    };
  };

  const confirmArchive: SubmitFunction = () => {
    archiving = true;
    const wasArchived = isArchived;
    return async ({ result, update }) => {
      await update();
      archiving = false;
      if (result.type === 'success') {
        archiveOpen = false;
        toast.success(
          wasArchived
            ? $_('projectSettings.overview.reactivated')
            : $_('projectSettings.overview.archived'),
        );
      } else {
        toast.error(failureMessage(result, $_('projectSettings.overview.statusUpdateFailed')));
      }
    };
  };

  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (deleteConfirm !== project.name) {
      cancel();
      return;
    }
    deleting = true;
    return async ({ result, update }) => {
      await update();
      if (result.type === 'failure' || result.type === 'error') {
        deleting = false;
        toast.error(failureMessage(result, $_('projectSettings.overview.deleteFailed')));
      }
    };
  };
</script>

<svelte:head>
  <title>{$_('projectSettings.overview.title')} - {project.name}</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="truncate text-2xl font-semibold tracking-tight text-white">{project.name}</h1>
        {#if isArchived}
          <span class="k-badge k-badge-warn">{$_('projectSettings.overview.archivedBadge')}</span>
        {/if}
      </div>
      <p class="mt-1 text-sm text-fg-muted">{$_('projectSettings.overview.subtitle')}</p>
    </div>
    <button type="button" class="k-btn k-btn-secondary k-btn-sm" onclick={copySlug}>
      {#if slugCopied}<Check class="h-3.5 w-3.5 text-ok" />{:else}<Copy class="h-3.5 w-3.5" />{/if}
      <span class="font-mono text-xs">{project.slug}</span>
    </button>
  </header>

  <form method="POST" action="?/updateProject" use:enhance={saveProject} class="space-y-6">
    <input type="hidden" name="id" value={project.id} />
    <input type="hidden" name="moduleVault" value={editModules.vault ? 'on' : ''} />
    <input type="hidden" name="moduleCodeReport" value={editModules.codereport ? 'on' : ''} />
    <input type="hidden" name="moduleStateIac" value="" />
    <input type="hidden" name="moduleMonitoring" value={editModules.monitoring ? 'on' : ''} />

    <!-- General -->
    <section class="k-card">
      <div class="border-b border-white/8 px-5 py-4">
        <h2 class="text-sm font-semibold text-white">{$_('projectSettings.overview.general')}</h2>
        <p class="mt-0.5 text-xs text-fg-subtle">
          {$_('projectSettings.overview.generalDescription')}
        </p>
      </div>
      <div class="grid gap-5 p-5 sm:grid-cols-2">
        {#if canUpdate}
          <Field id="edit-project-name" label={$_('common.name')} required>
            {#snippet children(control)}
              <input {...control} name="name" class="k-input" bind:value={editName} />
            {/snippet}
          </Field>
          <Field
            id="edit-project-slug"
            label={$_('common.slug')}
            help={$_('projectSettings.overview.slugHelp')}
          >
            {#snippet children(control)}
              <input {...control} name="slug" class="k-input font-mono" bind:value={editSlug} />
            {/snippet}
          </Field>
          <Field
            class="sm:col-span-2"
            id="edit-project-description"
            label={$_('common.description')}
          >
            {#snippet children(control)}
              <textarea
                {...control}
                name="description"
                rows="3"
                class="k-input"
                placeholder={$_('projectSettings.overview.optionalDescription')}
                bind:value={editDescription}></textarea>
            {/snippet}
          </Field>
        {:else}
          <dl class="contents text-sm">
            <div>
              <dt class="k-label">{$_('common.name')}</dt>
              <dd class="text-fg">{project.name}</dd>
            </div>
            <div>
              <dt class="k-label">{$_('common.slug')}</dt>
              <dd class="font-mono text-fg">{project.slug}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="k-label">{$_('common.description')}</dt>
              <dd class="whitespace-pre-wrap {project.description ? 'text-fg' : 'text-fg-subtle'}">
                {project.description || $_('projectSettings.overview.noDescription')}
              </dd>
            </div>
          </dl>
        {/if}
      </div>
    </section>

    <!-- Módulos -->
    <section class="k-card">
      <div class="border-b border-white/8 px-5 py-4">
        <h2 class="text-sm font-semibold text-white">{$_('projectSettings.overview.modules')}</h2>
        <p class="mt-0.5 text-xs text-fg-subtle">
          {$_('projectSettings.overview.modulesDescription')}
        </p>
      </div>
      <ul class="divide-y divide-white/5">
        {#each moduleOptions as option (option.key)}
          {@const enabled = Boolean(editModules[option.key]) && !option.soon}
          {@const saved = Boolean(project.modules[option.key]) && !option.soon}
          <li class="flex items-center gap-4 px-5 py-4">
            <span
              class="grid h-9 w-9 shrink-0 place-items-center rounded-lg {enabled
                ? 'bg-brand-500/12 text-brand-400'
                : 'bg-white/5 text-fg-subtle'}"
            >
              <option.icon class="h-4 w-4" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
                {option.label}
                {#if option.soon}
                  <span class="k-badge h-5 px-2 text-[11px]">{$_('common.comingSoon')}</span>
                {/if}
              </p>
              <p class="mt-0.5 text-xs text-fg-subtle">{option.description}</p>
            </div>
            {#if saved}
              <a
                href={option.href}
                class="k-btn k-btn-ghost k-btn-sm hidden sm:inline-flex"
                aria-label="{$_('projectSettings.overview.open')} {option.label}"
              >
                {$_('projectSettings.overview.open')}<ArrowUpRight class="h-3.5 w-3.5" />
              </a>
            {/if}
            <Switch
              label={option.label}
              checked={enabled}
              disabled={!canUpdate || option.soon}
              onchange={(value) => (editModules = { ...editModules, [option.key]: value })}
            />
          </li>
        {/each}
      </ul>
    </section>

    {#if canUpdate}
      <div
        class="flex items-center justify-end gap-3 {dirty
          ? 'sticky bottom-4 z-10 rounded-xl border border-brand-500/30 bg-ink-800/95 px-4 py-3 shadow-2xl backdrop-blur'
          : ''}"
      >
        {#if dirty}
          <p class="mr-auto text-sm text-fg-muted">{$_('projectSettings.overview.unsaved')}</p>
          <button
            type="button"
            class="k-btn k-btn-ghost"
            onclick={() => {
              editName = project.name;
              editSlug = project.slug;
              editDescription = project.description ?? '';
              editModules = { ...project.modules };
            }}>{$_('projectSettings.overview.discard')}</button
          >
        {/if}
        <button type="submit" class="k-btn k-btn-primary" disabled={saving || !dirty}>
          {#if saving}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Save
              class="h-4 w-4"
            />{/if}
          {$_('projectSettings.overview.saveChanges')}
        </button>
      </div>
    {/if}
  </form>

  <!-- Integraciones -->
  <section class="k-card">
    <div class="border-b border-white/8 px-5 py-4">
      <h2 class="text-sm font-semibold text-white">
        {$_('projectSettings.overview.integrations')}
      </h2>
      <p class="mt-0.5 text-xs text-fg-subtle">
        {$_('projectSettings.overview.integrationsDescription')}
      </p>
    </div>
    <div class="grid gap-3 p-5 sm:grid-cols-2">
      <a
        href="https://getgitops.com/docs/cli"
        target="_blank"
        rel="noopener noreferrer"
        class="k-card k-card-hover group flex items-start gap-3 p-4"
      >
        <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 text-fg">
          <Terminal class="h-4 w-4" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-white">GitOps CLI</span>
          <span class="mt-0.5 block text-xs text-fg-subtle"
            >{$_('projectSettings.overview.gitopsCliDescription', {
              values: { slug: project.slug },
            })}</span
          >
        </span>
        <ArrowUpRight class="h-4 w-4 shrink-0 text-fg-subtle group-hover:text-white" />
      </a>
      <div class="flex items-start gap-3 rounded-2xl border border-dashed border-white/10 p-4">
        <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 text-fg-subtle">
          <Bot class="h-4 w-4" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-2 text-sm font-medium text-fg">
            GitOps Bot
            <span class="k-badge h-5 px-2 text-[11px]">{$_('common.comingSoon')}</span>
          </span>
          <span class="mt-0.5 block text-xs text-fg-subtle"
            >{$_('projectSettings.overview.gitopsBotDescription')}</span
          >
        </span>
      </div>
    </div>
  </section>

  <!-- Zona de peligro -->
  {#if canUpdate || data.canDelete}
    <section class="overflow-hidden rounded-2xl border border-danger/25">
      <div class="flex items-center gap-2 border-b border-danger/20 bg-danger/6 px-5 py-4">
        <TriangleAlert class="h-4 w-4 text-red-400" />
        <h2 class="text-sm font-semibold text-red-200">
          {$_('projectSettings.overview.dangerZone')}
        </h2>
      </div>
      <ul class="divide-y divide-white/5">
        {#if canUpdate}
          <li class="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div>
              <p class="text-sm font-medium text-white">
                {$_('projectSettings.overview.transferToOrganization')}
              </p>
              <p class="mt-0.5 text-xs text-fg-subtle">
                {$_('projectSettings.overview.transferDescription')}
              </p>
            </div>
            <button
              type="button"
              class="k-btn k-btn-secondary k-btn-sm"
              disabled
              title={$_('projectSettings.overview.transferSoon')}
            >
              <Building2 class="h-3.5 w-3.5" />{$_('projectSettings.overview.transfer')}
            </button>
          </li>
          <li class="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div>
              <p class="text-sm font-medium text-white">
                {isArchived
                  ? $_('projectSettings.overview.activateProject')
                  : $_('projectSettings.overview.archiveProject')}
              </p>
              <p class="mt-0.5 text-xs text-fg-subtle">
                {isArchived
                  ? $_('projectSettings.overview.activateDescription')
                  : $_('projectSettings.overview.archiveDescription')}
              </p>
            </div>
            <button
              type="button"
              class="k-btn k-btn-secondary k-btn-sm"
              onclick={() => (archiveOpen = true)}
            >
              {#if isArchived}
                <ArchiveRestore class="h-3.5 w-3.5" />{$_('projectSettings.overview.activate')}
              {:else}
                <Archive class="h-3.5 w-3.5" />{$_('projectSettings.overview.archive')}
              {/if}
            </button>
          </li>
        {/if}
        {#if data.canDelete}
          <li class="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div>
              <p class="text-sm font-medium text-white">
                {$_('projectSettings.overview.deleteProject')}
              </p>
              <p class="mt-0.5 text-xs text-fg-subtle">
                {$_('projectSettings.overview.deleteDescription')}
              </p>
            </div>
            <button
              type="button"
              class="k-btn k-btn-danger k-btn-sm"
              onclick={() => {
                deleteConfirm = '';
                deleteOpen = true;
              }}
            >
              <Trash2 class="h-3.5 w-3.5" />{$_('common.delete')}
            </button>
          </li>
        {/if}
      </ul>
    </section>
  {/if}
</div>

<form
  id="archive-project-form"
  method="POST"
  action="?/updateProjectStatus"
  hidden
  use:enhance={confirmArchive}
>
  <input type="hidden" name="id" value={project.id} />
  <input type="hidden" name="status" value={isArchived ? 'active' : 'inactive'} />
</form>

<Modal
  bind:open={archiveOpen}
  size="sm"
  dismissible={!archiving}
  title={isArchived
    ? $_('projectSettings.overview.activateProjectModal')
    : $_('projectSettings.overview.archiveProjectModal')}
  description={isArchived
    ? `${$_('projectSettings.overview.activateConfirmationStart')} ${project.name}${$_('projectSettings.overview.activateConfirmationEnd')}`
    : `${$_('projectSettings.overview.archiveConfirmationStart')} ${project.name}${$_('projectSettings.overview.archiveConfirmationEnd')}`}
>
  {#snippet icon()}
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warn/10 text-warn"
      >{#if isArchived}<ArchiveRestore class="h-5 w-5" />{:else}<Archive
          class="h-5 w-5"
        />{/if}</span
    >
  {/snippet}
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (archiveOpen = false)}
      >{$_('common.cancel')}</button
    >
    <button
      form="archive-project-form"
      class="k-btn k-btn-primary"
      disabled={archiving}
      data-autofocus
    >
      {#if archiving}<LoaderCircle class="h-4 w-4 animate-spin" />{/if}
      {isArchived
        ? $_('projectSettings.overview.activateProject')
        : $_('projectSettings.overview.archiveProject')}
    </button>
  {/snippet}
</Modal>

<Modal
  bind:open={deleteOpen}
  role="alertdialog"
  size="sm"
  dismissible={!deleting}
  title={$_('projectSettings.overview.deleteProject')}
  description={`${$_('projectSettings.overview.deleteConfirmationStart')} ${project.name}${$_('projectSettings.overview.deleteConfirmationEnd')}`}
>
  {#snippet icon()}
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
      ><Trash2 class="h-5 w-5" /></span
    >
  {/snippet}
  <form id="delete-project-form" method="POST" action="?/deleteProject" use:enhance={confirmDelete}>
    <input type="hidden" name="id" value={project.id} />
    <Field label={$_('projectSettings.overview.typeToConfirm', { values: { name: project.name } })}>
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
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (deleteOpen = false)}
      >{$_('common.cancel')}</button
    >
    <button
      form="delete-project-form"
      class="k-btn k-btn-danger"
      disabled={deleting || deleteConfirm !== project.name}
    >
      {#if deleting}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Trash2
          class="h-4 w-4"
        />{/if}
      {$_('projectSettings.overview.deleteProject')}
    </button>
  {/snippet}
</Modal>
