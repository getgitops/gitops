<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import {
    ArrowLeft,
    ArrowRight,
    Check,
    Copy,
    ExternalLink,
    FolderGit2,
    Save,
    Trash2,
    Users,
  } from '@lucide/svelte';
  import { Field, Modal, toast } from '#lib/components/ui';
  import { _, locale } from '#lib/i18n';

  type OrganizationRow = {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    createdAt: string;
    updatedAt: string;
  };

  type ProjectRow = {
    id: string;
    slug: string;
    name: string;
    status: string;
    modules: {
      vault?: boolean;
      codereport?: boolean;
      stateiac?: boolean;
      monitoring?: boolean;
    } | null;
  };

  let {
    data,
  }: { data: { organization: OrganizationRow; projects: ProjectRow[]; memberCount: number } } =
    $props();

  const organization = $derived(data.organization);

  let name = $state(untrack(() => data.organization.name));
  let slug = $state(untrack(() => data.organization.slug));
  let description = $state(untrack(() => data.organization.description ?? ''));
  let saving = $state(false);
  let copied = $state(false);

  const dirty = $derived(
    name !== organization.name ||
      slug !== organization.slug ||
      description !== (organization.description ?? ''),
  );

  const moduleLabels: [keyof NonNullable<ProjectRow['modules']>, string][] = [
    ['codereport', 'Code Report'],
    ['vault', 'Vault'],
    ['monitoring', 'Monitoring'],
    ['stateiac', 'State IaC'],
  ];

  function date(value: string) {
    return new Intl.DateTimeFormat($locale ?? 'es', { dateStyle: 'medium' }).format(
      new Date(value),
    );
  }

  async function copySlug() {
    try {
      await navigator.clipboard.writeText(organization.slug);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      toast.error($_('clusterSettings.organizationDetail.copySlugFailed'));
    }
  }

  const submitSave: SubmitFunction = ({ cancel }) => {
    if (!name.trim()) {
      toast.error($_('clusterSettings.organizationDetail.nameRequired'));
      cancel();
      return;
    }
    saving = true;
    return async ({ result, update }) => {
      saving = false;
      if (result.type === 'success' || result.type === 'redirect') {
        toast.success($_('clusterSettings.organizationDetail.updated'), name);
      } else if (result.type === 'failure') {
        toast.error(
          $_('clusterSettings.organizationDetail.updateFailed'),
          result.data?.error ? String(result.data.error) : undefined,
        );
        return;
      }
      await update({ reset: false });
    };
  };

  // ---------- borrar ----------

  let deleteOpen = $state(false);
  let deleting = $state(false);
  let confirmText = $state('');

  const submitDelete: SubmitFunction = () => {
    deleting = true;
    const deleted = organization.name;
    return async ({ result, update }) => {
      deleting = false;
      if (result.type === 'redirect') {
        deleteOpen = false;
        toast.success($_('clusterSettings.organizations.deleteSuccess'), deleted);
      } else if (result.type === 'failure') {
        toast.error(
          $_('clusterSettings.organizationDetail.deleteFailed'),
          result.data?.error ? String(result.data.error) : undefined,
        );
        return;
      }
      await update();
    };
  };
</script>

<svelte:head>
  <title>{organization.name} - {$_('clusterSettings.organizationDetail.titleSuffix')}</title>
</svelte:head>

<div class="space-y-6">
  <a
    href="/gitops-settings/orgs"
    class="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-white"
  >
    <ArrowLeft class="h-3.5 w-3.5" />Volver a organizaciones
  </a>

  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="flex min-w-0 items-start gap-4">
      <span
        class="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-lg font-semibold text-brand-300"
        >{organization.name.slice(0, 1).toUpperCase()}</span
      >
      <div class="min-w-0">
        <h1 class="truncate text-2xl font-semibold tracking-tight text-white">
          {organization.name}
        </h1>
        <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
          <button
            type="button"
            class="k-badge font-mono hover:text-white"
            onclick={copySlug}
            title={$_('clusterSettings.organizationDetail.copySlug')}
          >
            {#if copied}<Check class="h-3 w-3 text-ok" />{:else}<Copy class="h-3 w-3" />{/if}
            {organization.slug}
          </button>
          <span>Creada el {date(organization.createdAt)}</span>
        </div>
      </div>
    </div>
    <a href={`/org/${organization.slug}/overview`} class="k-btn k-btn-secondary">
      <ExternalLink class="h-4 w-4" />Abrir organización
    </a>
  </header>

  <div class="grid gap-4 lg:grid-cols-3">
    <div class="min-w-0 space-y-4 lg:col-span-2">
      <form method="POST" action="?/updateOrganization" class="k-card" use:enhance={submitSave}>
        <input type="hidden" name="id" value={organization.id} />
        <div class="border-b border-white/8 px-6 py-4">
          <h2 class="font-semibold text-white">
            {$_('clusterSettings.organizationDetail.information')}
          </h2>
        </div>
        <div class="space-y-5 px-6 py-5">
          <div class="grid gap-4 sm:grid-cols-2">
            <Field label={$_('common.name')} required>
              {#snippet children(control)}
                <input class="k-input" name="name" bind:value={name} {...control} />
              {/snippet}
            </Field>
            <Field label={$_('common.slug')} help="Cambiarlo cambia las URLs de la organización.">
              {#snippet children(control)}
                <input
                  class="k-input font-mono text-[13px]"
                  name="slug"
                  spellcheck="false"
                  bind:value={slug}
                  {...control}
                />
              {/snippet}
            </Field>
          </div>
          <Field label={$_('common.description')}>
            {#snippet aside()}Opcional{/snippet}
            {#snippet children(control)}
              <textarea
                class="k-input"
                name="description"
                rows="3"
                placeholder={$_('clusterSettings.organizationDetail.optionalDescription')}
                bind:value={description}
                {...control}></textarea>
            {/snippet}
          </Field>
        </div>
        <div
          class="flex items-center justify-end gap-3 rounded-b-2xl border-t border-white/8 bg-ink-900/60 px-6 py-4"
        >
          {#if dirty}<span class="text-xs text-fg-subtle">Cambios sin guardar</span>{/if}
          <button type="submit" class="k-btn k-btn-primary" disabled={saving || !dirty}>
            <Save class="h-4 w-4" />{saving
              ? $_('common.saving')
              : $_('clusterSettings.organizationDetail.saveChanges')}
          </button>
        </div>
      </form>

      <section class="k-card overflow-hidden" aria-labelledby="org-projects">
        <div class="flex items-center justify-between border-b border-white/8 px-6 py-4">
          <h2 id="org-projects" class="font-semibold text-white">
            Proyectos <span class="font-normal text-fg-subtle">{data.projects.length}</span>
          </h2>
        </div>
        {#if data.projects.length === 0}
          <p class="px-6 py-8 text-sm text-fg-subtle">Esta organización no tiene proyectos.</p>
        {:else}
          <ul class="divide-y divide-white/6">
            {#each data.projects as project (project.id)}
              <li>
                <a
                  href={`/org/${organization.slug}/projects/${project.slug}/overview`}
                  class="group flex flex-wrap items-center gap-3 px-6 py-3 transition-colors hover:bg-white/2.5"
                >
                  <FolderGit2 class="h-4 w-4 shrink-0 text-fg-subtle" />
                  <span class="min-w-0 flex-1">
                    <span
                      class="block truncate text-sm font-medium text-white group-hover:text-brand-300"
                      >{project.name}</span
                    >
                    <span class="block truncate font-mono text-xs text-fg-subtle"
                      >{project.slug}</span
                    >
                  </span>
                  <span class="flex flex-wrap gap-1">
                    {#each moduleLabels as [key, label] (key)}
                      {#if project.modules?.[key]}<span class="k-badge">{label}</span>{/if}
                    {/each}
                  </span>
                  {#if project.status !== 'active'}
                    <span class="k-badge">{$_('common.inactive')}</span>
                  {/if}
                  <ArrowRight
                    class="h-4 w-4 text-fg-subtle transition group-hover:translate-x-0.5 group-hover:text-brand-400"
                  />
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>

    <aside class="min-w-0 space-y-4">
      <section class="k-card divide-y divide-white/6" aria-label="Resumen">
        <div class="flex items-center gap-3 px-5 py-4">
          <FolderGit2 class="h-4 w-4 text-brand-400" />
          <span class="flex-1 text-sm text-fg-muted">Proyectos</span>
          <span class="font-semibold tabular-nums text-white">{data.projects.length}</span>
        </div>
        <a
          href={`/org/${organization.slug}/settings/access-control`}
          class="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-white/2.5"
        >
          <Users class="h-4 w-4 text-brand-400" />
          <span class="flex-1 text-sm text-fg-muted">Miembros</span>
          <span class="font-semibold tabular-nums text-white">{data.memberCount}</span>
          <ArrowRight class="h-3.5 w-3.5 text-fg-subtle" />
        </a>
        <div class="space-y-1 px-5 py-4 text-xs text-fg-subtle">
          <p>Creada el {date(organization.createdAt)}</p>
          <p>Actualizada el {date(organization.updatedAt)}</p>
        </div>
      </section>

      <section class="k-card border-red-500/30" aria-labelledby="danger-zone">
        <div class="px-5 py-4">
          <h2 id="danger-zone" class="text-sm font-semibold text-red-300">
            {$_('clusterSettings.organizationDetail.dangerZone')}
          </h2>
          <p class="mt-1 text-xs text-fg-subtle">
            {$_('clusterSettings.organizationDetail.deleteDescription')}
          </p>
          <button
            type="button"
            class="k-btn k-btn-danger k-btn-sm mt-3"
            onclick={() => {
              confirmText = '';
              deleteOpen = true;
            }}
          >
            <Trash2 class="h-3.5 w-3.5" />{$_('clusterSettings.organizationDetail.deleteTitle')}
          </button>
        </div>
      </section>
    </aside>
  </div>
</div>

<Modal
  bind:open={deleteOpen}
  role="alertdialog"
  size="sm"
  dismissible={!deleting}
  title="¿Borrar la organización?"
  description="Se borra la organización, pero sus proyectos, roles y accesos se quedan en GitDB sin organización. Quedará un commit, pero no se puede deshacer desde la interfaz."
>
  {#snippet icon()}
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
      ><Trash2 class="h-5 w-5" /></span
    >
  {/snippet}
  <form id="form-borrar-org" method="POST" action="?/deleteOrganization" use:enhance={submitDelete}>
    <input type="hidden" name="id" value={organization.id} />
    <Field label="Escribe {organization.slug} para confirmar">
      {#snippet children(control)}
        <input
          class="k-input font-mono text-[13px]"
          autocomplete="off"
          spellcheck="false"
          data-autofocus
          bind:value={confirmText}
          {...control}
        />
      {/snippet}
    </Field>
  </form>
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (deleteOpen = false)}
      >{$_('common.cancel')}</button
    >
    <button
      type="submit"
      form="form-borrar-org"
      class="k-btn k-btn-danger"
      disabled={deleting || confirmText !== organization.slug}
    >
      {deleting
        ? $_('clusterSettings.organizationDetail.deleting')
        : $_('clusterSettings.organizationDetail.deleteTitle')}
    </button>
  {/snippet}
</Modal>
