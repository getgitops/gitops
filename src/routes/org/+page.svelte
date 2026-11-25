<!-- Selector de organización: entrar en una de las tuyas o, con permiso, crear una nueva. -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { ArrowRight, Building2, LoaderCircle, Plus, Search } from '@lucide/svelte';
  import { Field, Modal, toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';

  type OrganizationRow = { id: string; name: string; slug: string; description?: string | null };

  let { data }: { data: { organizations: OrganizationRow[]; canCreateOrganization: boolean } } =
    $props();

  const currentId = $derived(
    (page.data as { organization?: { id?: string } | null }).organization?.id ?? null,
  );
  const notFound = $derived(page.url.searchParams.get('error') === 'organization-not-found');

  let query = $state('');
  const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // la actual primero; el resto por nombre
  const organizations = $derived(
    data.organizations
      .filter((organization) => {
        const q = normalize(query.trim());
        return (
          !q ||
          normalize(
            `${organization.name} ${organization.slug} ${organization.description ?? ''}`,
          ).includes(q)
        );
      })
      .sort(
        (a, b) =>
          Number(b.id === currentId) - Number(a.id === currentId) || a.name.localeCompare(b.name),
      ),
  );

  function initials(name: string) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  // ---------- crear ----------
  let createOpen = $state(false);
  let creating = $state(false);
  let createError = $state('');
  let newName = $state('');
  let newSlug = $state('');
  let slugTouched = $state(false);
  let newDescription = $state('');

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const effectiveSlug = $derived(slugTouched ? newSlug : slugify(newName));

  function openCreate() {
    createError = '';
    newName = '';
    newSlug = '';
    slugTouched = false;
    newDescription = '';
    createOpen = true;
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
      creating = false;
      if (result.type === 'success') {
        const created = result.data?.organization as OrganizationRow | undefined;
        createOpen = false;
        toast.success($_('org.created'), created?.name ?? newName);
        if (created?.slug) await goto(`/org/${created.slug}/overview`, { invalidateAll: true });
        else await update();
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

<div class="mx-auto w-full max-w-5xl space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-white">{$_('org.selectorTitle')}</h1>
      <p class="mt-1 text-sm text-fg-muted">{$_('org.selectorDescription')}</p>
    </div>
    {#if data.canCreateOrganization}
      <button type="button" class="k-btn k-btn-primary" onclick={openCreate}>
        <Plus class="h-4 w-4" />{$_('clusterSettings.organizations.new')}
      </button>
    {/if}
  </header>

  {#if notFound}
    <p
      class="rounded-xl border border-danger/30 bg-danger/8 px-4 py-3 text-sm text-red-200"
      role="alert"
    >
      {$_('org.notFound')}
    </p>
  {/if}

  {#if data.organizations.length === 0}
    <div class="k-card flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
      <span class="grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-fg-subtle">
        <Building2 class="h-6 w-6" />
      </span>
      <p class="text-sm font-medium text-white">{$_('org.noMembershipTitle')}</p>
      <p class="max-w-sm text-sm text-fg-muted">{$_('org.noMembershipDescription')}</p>
      {#if data.canCreateOrganization}
        <button type="button" class="k-btn k-btn-secondary k-btn-sm mt-1" onclick={openCreate}>
          <Plus class="h-3.5 w-3.5" />{$_('clusterSettings.organizations.new')}
        </button>
      {/if}
    </div>
  {:else}
    {#if data.organizations.length > 6}
      <label class="relative block sm:max-w-sm">
        <span class="sr-only">{$_('org.search')}</span>
        <Search
          class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
        />
        <input class="k-input pl-9" placeholder={$_('org.search')} bind:value={query} />
      </label>
    {/if}

    {#if organizations.length === 0}
      <p class="k-card px-5 py-10 text-center text-sm text-fg-subtle">{$_('org.noMatches')}</p>
    {:else}
      <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each organizations as organization (organization.id)}
          {@const current = organization.id === currentId}
          <li>
            <a
              href={`/org/${organization.slug}/overview`}
              class="k-card k-card-hover group flex h-full flex-col gap-4 p-5 {current
                ? 'border-brand-500/40! bg-brand-500/4'
                : ''}"
              aria-current={current ? 'true' : undefined}
            >
              <div class="flex items-start justify-between gap-3">
                <span
                  class="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-semibold {current
                    ? 'bg-brand-500/15 text-brand-300'
                    : 'bg-white/6 text-fg'}">{initials(organization.name)}</span
                >
                {#if current}
                  <span class="k-badge k-badge-brand">{$_('org.current')}</span>
                {:else}
                  <ArrowRight
                    class="h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand-400"
                  />
                {/if}
              </div>
              <div class="min-w-0">
                <p class="truncate font-medium text-white">{organization.name}</p>
                <p class="truncate font-mono text-xs text-fg-subtle">{organization.slug}</p>
                {#if organization.description}
                  <p class="mt-2 line-clamp-2 text-sm text-fg-muted">{organization.description}</p>
                {/if}
              </div>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<Modal
  bind:open={createOpen}
  dismissible={!creating}
  title={$_('clusterSettings.organizations.createModalTitle')}
  description={$_('org.createDescription')}
>
  {#snippet icon()}
    <span
      class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-400"
      ><Building2 class="h-5 w-5" /></span
    >
  {/snippet}
  <form
    id="create-org-form"
    method="POST"
    action="?/createOrganization"
    class="space-y-5"
    use:enhance={createOrganization}
  >
    {#if createError}
      <p
        class="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-red-200"
        role="alert"
      >
        {createError}
      </p>
    {/if}
    <Field id="new-org-name" label={$_('common.name')}>
      {#snippet children(control)}
        <input
          {...control}
          name="name"
          class="k-input"
          placeholder="Acme"
          data-autofocus
          bind:value={newName}
        />
      {/snippet}
    </Field>
    <Field id="new-org-slug" label={$_('common.slug')} help={$_('org.slugHelp')}>
      {#snippet children(control)}
        <input
          {...control}
          name="slug"
          class="k-input font-mono text-[13px]"
          placeholder={$_('clusterSettings.organizations.slugPlaceholder')}
          value={effectiveSlug}
          oninput={(event) => {
            slugTouched = true;
            newSlug = event.currentTarget.value;
          }}
        />
      {/snippet}
    </Field>
    <Field id="new-org-description" label={$_('common.description')}>
      {#snippet children(control)}
        <textarea
          {...control}
          name="description"
          rows="3"
          class="k-input"
          placeholder={$_('clusterSettings.organizations.descriptionPlaceholder')}
          bind:value={newDescription}></textarea>
      {/snippet}
    </Field>
  </form>
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (createOpen = false)}
      >{$_('common.cancel')}</button
    >
    <button form="create-org-form" class="k-btn k-btn-primary" disabled={creating}>
      {#if creating}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Plus
          class="h-4 w-4"
        />{/if}
      {creating ? $_('common.creating') : $_('clusterSettings.organizations.new')}
    </button>
  {/snippet}
</Modal>
