<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { createPageStore } from '#lib/page-store';
  import { ArrowRight, Boxes, Clock, Plus, Search, X } from '@lucide/svelte';
  import { Field, Modal, toast } from '#lib/components/ui';
  import { _, locale } from '#lib/i18n';

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

  // mismo código de color que /brand: critical = danger, high = brand, medium = warn, low = neutro
  const severityStyles: { key: keyof SeverityCounts; className: string }[] = [
    { key: 'critical', className: 'border-red-500/25 bg-red-500/10 text-red-300' },
    { key: 'high', className: 'border-brand-500/30 bg-brand-500/10 text-brand-300' },
    { key: 'medium', className: 'border-amber-500/25 bg-amber-500/10 text-amber-300' },
    { key: 'low', className: 'border-white/10 bg-white/4 text-fg-muted' },
  ];

  let {
    data,
    form,
  }: {
    data: {
      services: ServiceRow[];
      project?: { slug?: string; organization?: { slug?: string | null } | null };
      canCreate: boolean;
    };
    form: {
      success?: boolean;
      error?: string;
      name?: string;
      slug?: string;
      description?: string;
      tags?: string[];
    } | null;
  } = $props();

  const page = createPageStore();
  const orgSlug = $derived(data.project?.organization?.slug ?? $page.params.org ?? '');
  const projectSlug = $derived(data.project?.slug ?? $page.params.slug ?? '');
  const baseHref = $derived(`/org/${orgSlug}/projects/${projectSlug}/code-report/services`);

  let searchQuery = $state('');
  const filteredServices = $derived.by(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return data.services;
    return data.services.filter(
      (service) =>
        service.name.toLowerCase().includes(query) ||
        service.slug.toLowerCase().includes(query) ||
        (service.description ?? '').toLowerCase().includes(query) ||
        service.tags.some((tag) => tag.toLowerCase().includes(query)),
    );
  });

  function formatDate(value: string) {
    return new Intl.DateTimeFormat($locale ?? 'es', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  // ---------- creación ----------

  let modalOpen = $state(false);
  let submitting = $state(false);
  let name = $state('');
  let slug = $state('');
  let description = $state('');
  let tags = $state<string[]>([]);
  let tagInput = $state('');

  function slugify(value: string) {
    return value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function openModal() {
    name = '';
    slug = '';
    description = '';
    tags = [];
    tagInput = '';
    modalOpen = true;
  }

  function addTag() {
    const value = tagInput.trim().replace(/,$/, '');
    if (value && !tags.includes(value)) tags = [...tags, value];
    tagInput = '';
  }

  function removeTag(tag: string) {
    tags = tags.filter((candidate) => candidate !== tag);
  }

  function handleTagKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag();
    } else if (event.key === 'Backspace' && !tagInput && tags.length > 0) {
      tags = tags.slice(0, -1);
    }
  }

  const submitCreate: SubmitFunction = () => {
    submitting = true;
    const created = name.trim();
    return async ({ result, update }) => {
      submitting = false;
      if (result.type === 'success') {
        modalOpen = false;
        toast.success('Servicio creado', created);
        await update();
      } else if (result.type === 'failure') {
        toast.error(
          'No se pudo crear el servicio',
          result.data?.error ? String(result.data.error) : undefined,
        );
      } else {
        await update();
      }
    };
  };
</script>

<svelte:head>
  <title>{$_('codeReport.servicesTitle')} - GitOps</title>
</svelte:head>

<div class="space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="max-w-2xl">
      <h1 class="text-2xl font-semibold tracking-tight text-white">
        {$_('codeReport.servicesTitle')}
      </h1>
      <p class="mt-1 text-sm text-fg-muted">
        Vulnerabilidades, dependencias y secretos expuestos del último análisis de cada servicio.
      </p>
    </div>
    {#if data.canCreate}
      <button type="button" class="k-btn k-btn-primary" onclick={openModal}>
        <Plus class="h-4 w-4" />{$_('codeReport.services.addService')}
      </button>
    {/if}
  </header>

  {#if data.services.length > 0}
    <div class="flex flex-wrap items-center gap-3">
      <label class="relative w-full sm:w-96">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
        />
        <input
          type="search"
          bind:value={searchQuery}
          placeholder={$_('codeReport.services.searchPlaceholder')}
          aria-label={$_('codeReport.services.searchPlaceholder')}
          class="k-input h-9 pl-9"
        />
      </label>
      <span class="ml-auto text-xs text-fg-subtle tabular-nums">
        {filteredServices.length} / {data.services.length}
      </span>
    </div>
  {/if}

  {#if data.services.length === 0}
    <div
      class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/16 px-6 py-14 text-center"
    >
      <span class="grid h-12 w-12 place-items-center rounded-full bg-white/4 text-2xl">🦊</span>
      <p class="mt-3 text-sm font-medium text-white">{$_('codeReport.services.empty')}</p>
      <p class="mt-1 max-w-sm text-sm text-fg-muted">
        Crea un servicio y envía su primer análisis desde tu pipeline de CI.
      </p>
      {#if data.canCreate}
        <button type="button" class="k-btn k-btn-secondary k-btn-sm mt-4" onclick={openModal}>
          <Plus class="h-3.5 w-3.5" />{$_('codeReport.services.addService')}
        </button>
      {/if}
    </div>
  {:else if filteredServices.length === 0}
    <div class="k-card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span class="grid h-12 w-12 place-items-center rounded-xl bg-white/4 text-fg-subtle">
        <Boxes class="h-6 w-6" />
      </span>
      <p class="text-sm font-medium text-white">{$_('codeReport.services.emptySearch')}</p>
    </div>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {#each filteredServices as service (service.id)}
        <a href={`${baseHref}/${service.slug}`} class="k-card k-card-hover group flex flex-col p-5">
          <div class="flex items-start gap-3">
            <span
              class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-400"
              ><Boxes class="h-5 w-5" /></span
            >
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold text-white">{service.name}</p>
              <p class="truncate font-mono text-xs text-fg-subtle">{service.slug}</p>
            </div>
            <ArrowRight
              class="mt-1 h-4 w-4 shrink-0 text-fg-subtle transition group-hover:translate-x-0.5 group-hover:text-brand-400"
            />
          </div>

          {#if service.description}
            <p class="mt-3 line-clamp-2 text-sm text-fg-muted">{service.description}</p>
          {/if}

          {#if service.tags.length > 0}
            <div class="mt-3 flex flex-wrap gap-1.5">
              {#each service.tags as tag (tag)}
                <span class="k-badge">{tag}</span>
              {/each}
            </div>
          {/if}

          <div class="mt-auto pt-4">
            <div class="border-t border-white/8 pt-4">
              {#if service.severity}
                <div class="grid grid-cols-4 gap-2">
                  {#each severityStyles as severity (severity.key)}
                    {@const count = service.severity[severity.key]}
                    <div
                      class="rounded-lg border px-2 py-1.5 text-center {severity.className} {count ===
                      0
                        ? 'opacity-40'
                        : ''}"
                    >
                      <p class="text-lg font-semibold leading-tight tabular-nums">{count}</p>
                      <p class="text-[10px] font-semibold uppercase tracking-[0.06em]">
                        {$_(`codeReport.services.severity.${severity.key}`)}
                      </p>
                    </div>
                  {/each}
                </div>
                {#if service.lastScanAt}
                  <p class="mt-3 flex items-center gap-1.5 text-xs text-fg-subtle">
                    <Clock class="h-3.5 w-3.5" />{$_('codeReport.services.lastScan')}:
                    {formatDate(service.lastScanAt)}
                  </p>
                {/if}
              {:else}
                <p class="text-xs text-fg-subtle">{$_('codeReport.services.noAnalysis')}</p>
              {/if}
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>

<Modal
  bind:open={modalOpen}
  title={$_('codeReport.services.addService')}
  description="Agrupa los análisis de un repositorio o componente desplegable."
  dismissible={!submitting}
>
  <form
    id="form-nuevo-servicio"
    method="POST"
    action="?/create"
    class="space-y-5"
    use:enhance={submitCreate}
  >
    <Field label={$_('codeReport.services.name')} required>
      {#snippet children(control)}
        <input
          class="k-input"
          name="name"
          placeholder="billing-api"
          autocomplete="off"
          data-autofocus
          bind:value={name}
          {...control}
        />
      {/snippet}
    </Field>
    <Field label="Slug" help={$_('codeReport.services.slugHelp')}>
      {#snippet children(control)}
        <input
          class="k-input font-mono text-[13px]"
          name="slug"
          placeholder={slugify(name) || 'billing-api'}
          autocomplete="off"
          spellcheck="false"
          bind:value={slug}
          {...control}
        />
      {/snippet}
    </Field>
    <Field label={$_('codeReport.services.description')}>
      {#snippet children(control)}
        <textarea class="k-input" name="description" rows="2" bind:value={description} {...control}
        ></textarea>
      {/snippet}
    </Field>
    <Field label={$_('codeReport.services.tags')} help={$_('codeReport.services.tagPlaceholder')}>
      {#snippet children(control)}
        <div
          class="k-input flex h-auto min-h-10 flex-wrap items-center gap-1.5 py-1.5 focus-within:border-brand-500/60"
        >
          {#each tags as tag (tag)}
            <span class="k-badge gap-1 pr-1">
              {tag}
              <button
                type="button"
                class="grid h-4 w-4 place-items-center rounded text-fg-subtle hover:bg-white/10 hover:text-white"
                aria-label="Quitar {tag}"
                onclick={() => removeTag(tag)}><X class="h-3 w-3" /></button
              >
            </span>
          {/each}
          <input
            type="text"
            class="k-input-bare min-w-32 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
            placeholder={tags.length === 0 ? 'backend, pagos…' : ''}
            autocomplete="off"
            bind:value={tagInput}
            onkeydown={handleTagKeydown}
            onblur={addTag}
            {...control}
          />
        </div>
      {/snippet}
    </Field>
    {#each tags as tag (tag)}
      <input type="hidden" name="tags" value={tag} />
    {/each}
    {#if form?.error}
      <p
        class="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-red-200"
        role="alert"
      >
        {form.error}
      </p>
    {/if}
  </form>
  {#snippet footer()}
    <button type="button" class="k-btn k-btn-secondary" onclick={() => (modalOpen = false)}
      >{$_('codeReport.services.cancel')}</button
    >
    <button
      type="submit"
      form="form-nuevo-servicio"
      class="k-btn k-btn-primary"
      disabled={submitting || !name.trim()}
      >{submitting
        ? $_('codeReport.services.creating')
        : $_('codeReport.services.createService')}</button
    >
  {/snippet}
</Modal>
