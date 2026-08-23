<script lang="ts">
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import { Boxes, Plus, Search, X } from 'lucide-svelte';

  type ServiceRow = {
    id: string;
    slug: string;
    name: string;
    description?: string | null;
    tags: string[];
  };

  export let data: { services: ServiceRow[] };
  export let form: {
    success?: boolean;
    error?: string;
    name?: string;
    slug?: string;
    description?: string;
    tags?: string[];
  } | null;

  let searchQuery = '';

  $: orgSlug = $page.params.org;
  $: projectSlug = $page.params.slug;
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
  <title>Code Report - Services - GitVault Suite</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center gap-3">
    <div class="relative flex-1">
      <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Buscar servicios por nombre, slug o tag..."
        class="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
      />
    </div>
    <button
      type="button"
      on:click={openModal}
      class="inline-flex shrink-0 items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
    >
      <Plus class="h-4 w-4" />
      Add Service
    </button>
  </div>

  {#if filteredServices.length === 0}
    <div
      class="rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"
    >
      <Boxes class="mx-auto h-8 w-8 text-slate-400" />
      <p class="mt-3 text-sm font-medium text-slate-900">
        {data.services.length === 0
          ? 'Todavía no hay servicios en este proyecto.'
          : 'Sin resultados para tu búsqueda.'}
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
        </a>
      {/each}
    </div>
  {/if}
</div>

{#if modalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
    <div class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
      <div class="flex items-start justify-between">
        <h3 class="text-lg font-semibold text-slate-900">Add Service</h3>
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
          <label for="service-name" class="block text-sm font-medium text-slate-700">Name</label>
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
            Slug <span class="font-normal text-slate-400">(opcional, se genera del nombre)</span>
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
            Description
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
          <label for="service-tags" class="block text-sm font-medium text-slate-700">Tags</label>
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
              placeholder={tags.length === 0 ? 'Añade un tag y pulsa Enter' : ''}
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
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            class="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? 'Creando...' : 'Crear servicio'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
