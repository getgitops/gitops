<script lang="ts">
  import { page } from '$app/stores';
  import { ArrowRight, Building2 } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

  type OrganizationRow = {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
  };

  export let data: { organizations: OrganizationRow[] };

  $: errorMessage =
    $page?.url?.searchParams?.get('error') === 'organization-not-found' ? $_('org.notFound') : '';
</script>

<svelte:head>
  <title>{$_('sidebar.items.organizations')} - GitOps</title>
</svelte:head>

<div class="mx-auto w-full max-w-5xl px-4 py-10">
  <div class="mb-6">
    <h1 class="text-xl font-semibold text-slate-900">{$_('org.selectorTitle')}</h1>
    <p class="mt-2 text-sm text-slate-600">{$_('org.selectorDescription')}</p>
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
