<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import {
    ArrowRight,
    Building2,
    FolderGit2,
    Plus,
    Search,
    Trash2,
    Users,
    X,
  } from '@lucide/svelte';
  import { Field, Modal, toast } from '#lib/components/ui';
  import { _, locale } from '#lib/i18n';

  type OrganizationRow = {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    createdAt: string;
    projectCount: number | null;
    memberCount: number | null;
  };

  let { data }: { data: { organizations: OrganizationRow[] } } = $props();

  let query = $state('');
  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return data.organizations.filter(
      (organization) =>
        !q ||
        organization.name.toLowerCase().includes(q) ||
        organization.slug.toLowerCase().includes(q) ||
        (organization.description ?? '').toLowerCase().includes(q),
    );
  });

  const totals = $derived({
    projects: data.organizations.reduce((sum, org) => sum + (org.projectCount ?? 0), 0),
    members: data.organizations.reduce((sum, org) => sum + (org.memberCount ?? 0), 0),
  });

  function date(value: string) {
    if (!value) return '—';
    return new Intl.DateTimeFormat($locale ?? 'es', { dateStyle: 'medium' }).format(
      new Date(value),
    );
  }

  function slugify(value: string) {
    return value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // ---------- crear ----------

  let createOpen = $state(false);
  let creating = $state(false);
  let name = $state('');
  let slug = $state('');
  let description = $state('');

  function openCreate() {
    name = '';
    slug = '';
    description = '';
    createOpen = true;
  }

  const submitCreate: SubmitFunction = () => {
    creating = true;
    const created = name.trim();
    return async ({ result, update }) => {
      creating = false;
      if (result.type === 'success') {
        createOpen = false;
        toast.success($_('clusterSettings.organizations.created'), created);
        await update();
      } else if (result.type === 'failure') {
        toast.error(
          $_('clusterSettings.organizations.createFailed'),
          result.data?.error ? String(result.data.error) : undefined,
        );
      } else {
        await update();
      }
    };
  };

  // ---------- borrar ----------

  let target = $state<OrganizationRow | null>(null);
  let deleteOpen = $state(false);
  let deleting = $state(false);
  let confirmText = $state('');

  function openDelete(organization: OrganizationRow) {
    target = organization;
    confirmText = '';
    deleteOpen = true;
  }

  const submitDelete: SubmitFunction = () => {
    deleting = true;
    const deleted = target?.name;
    return async ({ result, update }) => {
      deleting = false;
      if (result.type === 'success') {
        deleteOpen = false;
        toast.success($_('clusterSettings.organizations.deleteSuccess'), deleted);
        await update();
      } else if (result.type === 'failure') {
        toast.error(
          $_('clusterSettings.organizations.deleteFailed'),
          result.data?.error ? String(result.data.error) : undefined,
        );
      } else {
        await update();
      }
    };
  };
</script>

<svelte:head>
  <title>{$_('clusterSettings.organizations.title')} - {$_('clusterSettings.title')}</title>
</svelte:head>

<div class="space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="max-w-2xl">
      <h1 class="text-2xl font-semibold tracking-tight text-white">
        {$_('clusterSettings.organizations.title')}
      </h1>
      <p class="mt-1 text-sm text-fg-muted">{$_('clusterSettings.organizations.description')}</p>
    </div>
    <button type="button" class="k-btn k-btn-primary" onclick={openCreate}>
      <Plus class="h-4 w-4" />{$_('clusterSettings.organizations.new')}
    </button>
  </header>

  <section class="grid gap-4 sm:grid-cols-3" aria-label="Resumen">
    <div class="k-card p-5">
      <p class="flex items-center gap-2 text-sm text-fg-muted">
        <Building2 class="h-4 w-4 text-brand-400" />Organizaciones
      </p>
      <p class="mt-2 text-3xl font-semibold tabular-nums text-white">
        {data.organizations.length}
      </p>
    </div>
    <div class="k-card p-5">
      <p class="flex items-center gap-2 text-sm text-fg-muted">
        <FolderGit2 class="h-4 w-4 text-brand-400" />Proyectos
      </p>
      <p class="mt-2 text-3xl font-semibold tabular-nums text-white">{totals.projects}</p>
    </div>
    <div class="k-card p-5">
      <p class="flex items-center gap-2 text-sm text-fg-muted">
        <Users class="h-4 w-4 text-brand-400" />Accesos a organizaciones
      </p>
      <p class="mt-2 text-3xl font-semibold tabular-nums text-white">{totals.members}</p>
      <p class="mt-1 text-xs text-fg-subtle">Una persona en dos organizaciones cuenta dos veces</p>
    </div>
  </section>

  <div class="k-card overflow-hidden">
    <div class="flex flex-wrap items-center gap-3 border-b border-white/8 p-4">
      <label class="relative w-full sm:w-80">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
        />
        <input
          type="search"
          class="k-input h-9 pl-9"
          placeholder={$_('clusterSettings.organizations.searchPlaceholder')}
          aria-label={$_('clusterSettings.organizations.searchPlaceholder')}
          bind:value={query}
        />
      </label>
      {#if query}
        <button type="button" class="k-btn k-btn-ghost k-btn-sm" onclick={() => (query = '')}>
          <X class="h-3.5 w-3.5" />Limpiar
        </button>
      {/if}
      <span class="ml-auto text-xs tabular-nums text-fg-subtle">
        {filtered.length} de {data.organizations.length}
      </span>
    </div>

    {#if filtered.length === 0}
      <div class="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span class="grid h-12 w-12 place-items-center rounded-full bg-white/4 text-2xl">🦊</span>
        <p class="text-sm text-fg-muted">
          {data.organizations.length === 0
            ? $_('clusterSettings.organizations.empty')
            : $_('clusterSettings.organizations.emptySearch')}
        </p>
        {#if data.organizations.length === 0}
          <button type="button" class="k-btn k-btn-secondary k-btn-sm" onclick={openCreate}>
            <Plus class="h-3.5 w-3.5" />{$_('clusterSettings.organizations.new')}
          </button>
        {/if}
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full min-w-176 text-left text-sm">
          <thead class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
            <tr class="border-b border-white/8">
              <th class="px-5 py-3 font-semibold">{$_('common.name')}</th>
              <th class="px-3 py-3 text-right font-semibold">Proyectos</th>
              <th class="px-3 py-3 text-right font-semibold">Miembros</th>
              <th class="px-3 py-3 font-semibold">
                {$_('clusterSettings.organizations.createdColumn')}
              </th>
              <th class="px-5 py-3"><span class="sr-only">{$_('common.actions')}</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            {#each filtered as organization (organization.id)}
              <tr class="group transition-colors hover:bg-white/2.5">
                <td class="px-5 py-3">
                  <a
                    href={`/gitops-settings/orgs/${organization.slug}`}
                    class="flex min-w-0 items-center gap-3"
                  >
                    <span
                      class="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-brand-500/30 bg-brand-500/10 text-sm font-semibold text-brand-300"
                      >{organization.name.slice(0, 1).toUpperCase()}</span
                    >
                    <span class="min-w-0">
                      <span class="block truncate font-medium text-white group-hover:text-brand-300"
                        >{organization.name}</span
                      >
                      <span class="block truncate font-mono text-xs text-fg-subtle"
                        >{organization.slug}</span
                      >
                    </span>
                  </a>
                </td>
                <td class="px-3 py-3 text-right tabular-nums text-fg">
                  {organization.projectCount ?? '—'}
                </td>
                <td class="px-3 py-3 text-right tabular-nums text-fg">
                  {organization.memberCount ?? '—'}
                </td>
                <td class="whitespace-nowrap px-3 py-3 text-xs text-fg-muted">
                  {date(organization.createdAt)}
                </td>
                <td class="px-5 py-3">
                  <div class="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      class="k-btn k-btn-ghost k-btn-icon k-btn-sm hover:text-red-400"
                      aria-label="{$_('common.delete')} {organization.name}"
                      title={$_('common.delete')}
                      onclick={() => openDelete(organization)}
                    >
                      <Trash2 class="h-3.5 w-3.5" />
                    </button>
                    <a
                      href={`/gitops-settings/orgs/${organization.slug}`}
                      class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                      aria-label="{$_('common.view')} {organization.name}"
                    >
                      <ArrowRight class="h-4 w-4" />
                    </a>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<Modal
  bind:open={createOpen}
  title={$_('clusterSettings.organizations.createModalTitle')}
  description="Se crean también sus roles por defecto. Después, invita a su administrador."
  dismissible={!creating}
>
  <form
    id="form-nueva-org"
    method="POST"
    action="?/createOrganization"
    class="space-y-5"
    use:enhance={submitCreate}
  >
    <Field label={$_('common.name')} required>
      {#snippet children(control)}
        <input
          class="k-input"
          name="name"
          placeholder="Kettu Studio"
          autocomplete="off"
          data-autofocus
          bind:value={name}
          {...control}
        />
      {/snippet}
    </Field>
    <Field label={$_('common.slug')} help="Se usa en las URLs: /org/<slug>">
      {#snippet children(control)}
        <input
          class="k-input font-mono text-[13px]"
          name="slug"
          placeholder={slugify(name) || $_('clusterSettings.organizations.slugPlaceholder')}
          autocomplete="off"
          spellcheck="false"
          bind:value={slug}
          {...control}
        />
      {/snippet}
    </Field>
    <Field label={$_('common.description')}>
      {#snippet aside()}Opcional{/snippet}
      {#snippet children(control)}
        <textarea
          class="k-input"
          name="description"
          rows="3"
          placeholder={$_('clusterSettings.organizations.descriptionPlaceholder')}
          bind:value={description}
          {...control}></textarea>
      {/snippet}
    </Field>
  </form>
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (createOpen = false)}
      >{$_('common.cancel')}</button
    >
    <button
      type="submit"
      form="form-nueva-org"
      class="k-btn k-btn-primary"
      disabled={creating || !name.trim()}
    >
      <Plus class="h-4 w-4" />{creating
        ? $_('common.creating')
        : $_('clusterSettings.organizations.new')}
    </button>
  {/snippet}
</Modal>

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
    <input type="hidden" name="id" value={target?.id ?? ''} />
    <Field label="Escribe {target?.slug ?? ''} para confirmar">
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
      disabled={deleting || confirmText !== target?.slug}
    >
      {deleting
        ? $_('clusterSettings.organizationDetail.deleting')
        : $_('clusterSettings.organizationDetail.deleteTitle')}
    </button>
  {/snippet}
</Modal>
