<script lang="ts">
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import { Boxes, Plus, Search, X } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

  type SeverityCounts = {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown: number;
  };

  type ServiceRow = {
    id: string;
    slug: string;
    name: string;
    description?: string | null;
    tags: string[];
    lastScanAt?: string | null;
    severity?: SeverityCounts | null;
  };

  const severityStyles: { key: keyof SeverityCounts; label: string; className: string }[] = [
    { key: 'critical', label: 'critical', className: 'border-red-200 bg-red-50 text-red-700' },
    { key: 'high', label: 'high', className: 'border-orange-200 bg-orange-50 text-orange-700' },
    { key: 'medium', label: 'medium', className: 'border-amber-200 bg-amber-50 text-amber-700' },
    { key: 'low', label: 'low', className: 'border-slate-200 bg-slate-50 text-slate-600' },
  ];

  export let data: {
    services: ServiceRow[];
    project?: { slug?: string; organization?: { slug?: string | null } | null };
    canCreate: boolean;
  };
  export let form: {
    success?: boolean;
    error?: string;
    name?: string;
    slug?: string;
    description?: string;
    tags?: string[];
  } | null;

  let searchQuery = '';

  $: orgSlug = data.project?.organization?.slug ?? $page?.params?.org ?? '';
  $: projectSlug = data.project?.slug ?? $page?.params?.slug ?? '';
  $: baseHref = `/org/${orgSlug}/projects/${projectSlug}/code-report/services`;

  $: filteredServices = data.services.filter((service) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      service.name.toLowerCase().includes(query) ||
      service.slug.toLowerCase().includes(query) ||
      (service.description ?? '').toLowerCase().includes(query) ||
      service.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  let modalOpen = false;
  let submitting = false;
  let tags: string[] = [];
  let tagInput = '';

  function openModal() {
    tags = [];
    tagInput = '';
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
  }

  function addTag() {
    const value = tagInput.trim();
    if (value && !tags.includes(value)) {
      tags = [...tags, value];
    }
    tagInput = '';
  }

  function removeTag(tag: string) {
    tags = tags.filter((t) => t !== tag);
  }

  function handleTagKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag();
    }
  }

  $: if (form?.success) {
    modalOpen = false;
  }
</script>

<svelte:head>
  <title>{$_('codeReport.servicesTitle')} - GitOps</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center gap-3">
    <div class="relative flex-1">
      <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder={$_('codeReport.services.searchPlaceholder')}
        class="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
      />
    </div>
    {#if data.canCreate}
      <button
        type="button"
        on:click={openModal}
        class="inline-flex shrink-0 items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
      >
        <Plus class="h-4 w-4" />
        {$_('codeReport.services.addService')}
      </button>
    {/if}
  </div>

  {#if filteredServices.length === 0}
    <div
      class="rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"
    >
      <Boxes class="mx-auto h-8 w-8 text-slate-400" />
      <p class="mt-3 text-sm font-medium text-slate-900">
        {data.services.length === 0
          ? $_('codeReport.services.empty')
          : $_('codeReport.services.emptySearch')}
      </p>
    </div>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each filteredServices as service (service.id)}
        <a
          href={`${baseHref}/${service.slug}`}
          class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
        >
          <p class="text-sm font-semibold text-slate-900">{service.name}</p>
          <p class="mt-1 text-xs text-slate-500">{service.slug}</p>
          {#if service.description}
            <p class="mt-2 line-clamp-2 text-sm text-slate-600">{service.description}</p>
          {/if}
          {#if service.tags.length > 0}
            <div class="mt-3 flex flex-wrap gap-1.5">
              {#each service.tags as tag}
                <span
                  class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
                >
                  {tag}
                </span>
              {/each}
            </div>
          {/if}
          <div class="mt-4 border-t border-slate-100 pt-4">
            {#if service.severity}
              <div class="grid grid-cols-4 gap-2">
                {#each severityStyles as severity}
                  <div
                    class={`rounded-xl border p-2 text-center ${severity.className} ${service.severity[severity.key] === 0 ? 'opacity-40' : ''}`}
                  >
                    <p class="text-2xl font-black leading-none">
                      {service.severity[severity.key]}
                    </p>
                    <p class="mt-1 text-[10px] font-bold uppercase tracking-wide">
                      {$_(`codeReport.services.severity.${severity.label}`)}
                    </p>
                  </div>
                {/each}
              </div>
              {#if service.lastScanAt}
                <p class="mt-2 text-[11px] text-slate-400">
                  {$_('codeReport.services.lastScan')}: {new Date(service.lastScanAt).toLocaleString()}
                </p>
              {/if}
            {:else}
              <p class="text-[11px] text-slate-400">{$_('codeReport.services.noAnalysis')}</p>
            {/if}
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>

{#if modalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
    <div class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
      <div class="flex items-start justify-between">
        <h3 class="text-lg font-semibold text-slate-900">{$_('codeReport.services.addService')}</h3>
        <button type="button" on:click={closeModal} class="text-slate-400 hover:text-slate-600">
          <X class="h-5 w-5" />
        </button>
      </div>

      <form
        method="POST"
        action="?/create"
        use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            await update();
            submitting = false;
          };
        }}
        class="mt-4 space-y-4"
      >
        {#if form?.error}
          <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{form.error}</p>
        {/if}

        <div>
          <label for="service-name" class="block text-sm font-medium text-slate-700">{$_('codeReport.services.name')}</label>
          <input
            id="service-name"
            name="name"
            type="text"
            required
            value={form?.name ?? ''}
            class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
          />
        </div>

        <div>
          <label for="service-slug" class="block text-sm font-medium text-slate-700">
            Slug <span class="font-normal text-slate-400">{$_('codeReport.services.slugHelp')}</span>
          </label>
          <input
            id="service-slug"
            name="slug"
            type="text"
            value={form?.slug ?? ''}
            class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
          />
        </div>

        <div>
          <label for="service-description" class="block text-sm font-medium text-slate-700">
            {$_('codeReport.services.description')}
          </label>
          <textarea
            id="service-description"
            name="description"
            rows="2"
            value={form?.description ?? ''}
            class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
          ></textarea>
        </div>

        <div>
          <label for="service-tags" class="block text-sm font-medium text-slate-700">{$_('codeReport.services.tags')}</label>
          <div
            class="mt-1 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 focus-within:border-slate-400"
          >
            {#each tags as tag (tag)}
              <span
                class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                {tag}
                <button
                  type="button"
                  on:click={() => removeTag(tag)}
                  class="text-slate-400 hover:text-slate-600"
                >
                  <X class="h-3 w-3" />
                </button>
              </span>
            {/each}
            <input
              id="service-tags"
              type="text"
              bind:value={tagInput}
              on:keydown={handleTagKeydown}
              on:blur={addTag}
              placeholder={tags.length === 0 ? $_('codeReport.services.tagPlaceholder') : ''}
              class="min-w-[8rem] flex-1 border-none px-1 py-1 text-sm text-slate-900 focus:outline-none"
            />
          </div>
          {#each tags as tag (tag)}
            <input type="hidden" name="tags" value={tag} />
          {/each}
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            on:click={closeModal}
            class="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {$_('codeReport.services.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            class="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? $_('codeReport.services.creating') : $_('codeReport.services.createService')}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
