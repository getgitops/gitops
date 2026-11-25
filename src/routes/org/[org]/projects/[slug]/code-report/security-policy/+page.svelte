<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { createPageStore } from '#lib/page-store';
  import {
    ArrowRight,
    Plus,
    Search,
    ShieldAlert,
    ShieldCheck,
    TriangleAlert,
    X,
  } from '@lucide/svelte';
  import {
    describeScope,
    SECURITY_POLICY_ENFORCEMENT_META,
    SECURITY_POLICY_TYPE_META,
    type SecurityPolicy,
  } from '#lib/code-report/security-policy';
  import SecurityPolicyForm from '#lib/components/code-report/SecurityPolicyForm.svelte';
  import { Modal, Select, Switch, toast } from '#lib/components/ui';

  type PolicyRow = SecurityPolicy & { compliance: { passing: number; failing: number } };

  let {
    data,
  }: {
    data: {
      policies: PolicyRow[];
      services: { id: string; slug: string; name: string; tags: string[] }[];
      tags: string[];
      canCreate: boolean;
      canUpdate: boolean;
      project?: { slug?: string; organization?: { slug?: string | null } | null };
    };
  } = $props();

  const page = createPageStore();
  const base = $derived(
    `/org/${data.project?.organization?.slug ?? $page.params.org}/projects/${data.project?.slug ?? $page.params.slug}/code-report/security-policy`,
  );

  // abre el modal directamente con ?new (enlaces desde otras pantallas)
  let createOpen = $state(untrack(() => $page.url.searchParams.has('new')));
  let creating = $state(false);

  // formulario de activar/desactivar de cada fila, para enviarlo desde el Switch
  let toggleForms = $state<Record<string, HTMLFormElement>>({});

  let query = $state('');
  let type = $state('all');
  let status = $state('all');

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return data.policies.filter(
      (policy) =>
        (type === 'all' || policy.type === type) &&
        (status === 'all' ||
          (status === 'failing' && policy.compliance.failing > 0) ||
          (status === 'enabled' && policy.enabled) ||
          (status === 'disabled' && !policy.enabled)) &&
        (!q ||
          policy.name.toLowerCase().includes(q) ||
          policy.slug.toLowerCase().includes(q) ||
          (policy.description ?? '').toLowerCase().includes(q)),
    );
  });

  const stats = $derived({
    active: data.policies.filter((policy) => policy.enabled).length,
    failing: data.policies.filter((policy) => policy.enabled && policy.compliance.failing > 0)
      .length,
    blocking: data.policies.filter(
      (policy) => policy.enabled && policy.enforcement === 'block' && policy.compliance.failing > 0,
    ).length,
  });

  const hasFilters = $derived(!!query.trim() || type !== 'all' || status !== 'all');
</script>

<svelte:head><title>Políticas de seguridad - Code Report - GitOps</title></svelte:head>

<div class="space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="max-w-2xl">
      <h1 class="text-2xl font-semibold tracking-tight text-white">Políticas de seguridad</h1>
      <p class="mt-1 text-sm text-fg-muted">
        Reglas que se evalúan en cada análisis: umbrales de vulnerabilidades, licencias o secretos.
        Cada servicio cumple o incumple según su último análisis.
      </p>
    </div>
    {#if data.canCreate}
      <button type="button" class="k-btn k-btn-primary" onclick={() => (createOpen = true)}>
        <Plus class="h-4 w-4" />Nueva política
      </button>
    {/if}
  </header>

  {#if data.policies.length === 0}
    <div
      class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/16 px-6 py-14 text-center"
    >
      <span class="grid h-12 w-12 place-items-center rounded-full bg-white/4 text-2xl">🦊</span>
      <p class="mt-3 text-sm font-medium text-white">Aún no hay políticas de seguridad</p>
      <p class="mt-1 max-w-md text-sm text-fg-muted">
        Por ejemplo: "ninguna vulnerabilidad crítica en producción". Se comprueba sola en cada
        análisis y la verás en el informe de cada servicio.
      </p>
      {#if data.canCreate}
        <button
          type="button"
          class="k-btn k-btn-secondary k-btn-sm mt-4"
          onclick={() => (createOpen = true)}
        >
          <Plus class="h-3.5 w-3.5" />Crear la primera
        </button>
      {/if}
    </div>
  {:else}
    <section class="grid gap-4 sm:grid-cols-3" aria-label="Resumen">
      <div class="k-card p-5">
        <p class="flex items-center gap-2 text-sm text-fg-muted">
          <ShieldCheck class="h-4 w-4 text-brand-400" />Activas
        </p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-white">
          {stats.active}<span class="text-lg text-fg-subtle">/{data.policies.length}</span>
        </p>
      </div>
      <button
        type="button"
        class="k-card k-card-hover p-5 text-left"
        aria-pressed={status === 'failing'}
        onclick={() => (status = status === 'failing' ? 'all' : 'failing')}
      >
        <p class="flex items-center gap-2 text-sm text-fg-muted">
          <ShieldAlert class="h-4 w-4 {stats.failing ? 'text-red-400' : 'text-fg-subtle'}" />Con
          incumplimientos
        </p>
        <p
          class="mt-2 text-3xl font-semibold tabular-nums {stats.failing
            ? 'text-red-300'
            : 'text-white'}"
        >
          {stats.failing}
        </p>
      </button>
      <div class="k-card p-5">
        <p class="flex items-center gap-2 text-sm text-fg-muted">
          <TriangleAlert
            class="h-4 w-4 {stats.blocking ? 'text-red-400' : 'text-fg-subtle'}"
          />Bloqueando pipelines
        </p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-white">{stats.blocking}</p>
      </div>
    </section>

    <div class="k-card overflow-hidden">
      <div class="flex flex-wrap items-center gap-3 border-b border-white/8 p-4">
        <label class="relative w-full sm:w-72">
          <Search
            class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
          />
          <input
            type="search"
            class="k-input h-9 pl-9"
            placeholder="Buscar por nombre o slug…"
            aria-label="Buscar políticas"
            bind:value={query}
          />
        </label>
        <div class="w-full sm:w-48 **:[[role=combobox]]:h-9">
          <label for="policy-type" class="sr-only">Tipo</label>
          <Select
            id="policy-type"
            bind:value={type}
            options={[
              { value: 'all', label: 'Todos los tipos' },
              ...Object.entries(SECURITY_POLICY_TYPE_META).map(([value, meta]) => ({
                value,
                label: meta.label,
              })),
            ]}
          />
        </div>
        <div class="w-full sm:w-44 **:[[role=combobox]]:h-9">
          <label for="policy-status" class="sr-only">Estado</label>
          <Select
            id="policy-status"
            bind:value={status}
            options={[
              { value: 'all', label: 'Todos los estados' },
              { value: 'enabled', label: 'Activas' },
              { value: 'disabled', label: 'Inactivas' },
              { value: 'failing', label: 'Con incumplimientos' },
            ]}
          />
        </div>
        {#if hasFilters}
          <button
            type="button"
            class="k-btn k-btn-ghost k-btn-sm"
            onclick={() => {
              query = '';
              type = 'all';
              status = 'all';
            }}><X class="h-3.5 w-3.5" />Limpiar</button
          >
        {/if}
        <span class="ml-auto text-xs tabular-nums text-fg-subtle">
          {filtered.length} de {data.policies.length}
        </span>
      </div>

      {#if filtered.length === 0}
        <p class="px-5 py-10 text-center text-sm text-fg-subtle">
          Ninguna política coincide con los filtros.
        </p>
      {:else}
        <ul class="divide-y divide-white/6">
          {#each filtered as policy (policy.id)}
            {@const evaluated = policy.compliance.passing + policy.compliance.failing}
            <li
              class="group flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4 {policy.enabled
                ? ''
                : 'opacity-60'}"
            >
              <a href={`${base}/${policy.id}`} class="min-w-0 flex-1 basis-72">
                <p class="flex flex-wrap items-center gap-2">
                  <span class="font-medium text-white group-hover:text-brand-300"
                    >{policy.name}</span
                  >
                  <span class="k-badge">{SECURITY_POLICY_TYPE_META[policy.type].label}</span>
                  <span
                    class="k-badge {policy.enforcement === 'block'
                      ? 'k-badge-danger'
                      : 'k-badge-warn'}"
                  >
                    {SECURITY_POLICY_ENFORCEMENT_META[policy.enforcement].label}
                  </span>
                </p>
                <p class="mt-0.5 truncate text-xs text-fg-subtle">
                  {policy.description || policy.slug} · {describeScope(policy.scope)}
                </p>
              </a>

              <div class="w-44">
                {#if !policy.enabled}
                  <p class="text-xs text-fg-subtle">No se evalúa</p>
                {:else if evaluated === 0}
                  <p class="text-xs text-fg-subtle">Sin evaluar todavía</p>
                {:else}
                  <p class="flex items-center justify-between text-xs">
                    <span class={policy.compliance.failing ? 'text-red-300' : 'text-ok'}>
                      {policy.compliance.failing
                        ? `${policy.compliance.failing} ${policy.compliance.failing === 1 ? 'incumple' : 'incumplen'}`
                        : 'Todos cumplen'}
                    </span>
                    <span class="tabular-nums text-fg-subtle"
                      >{policy.compliance.passing}/{evaluated}</span
                    >
                  </p>
                  <div class="mt-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-white/6">
                    <div
                      class="bg-ok"
                      style="width:{(policy.compliance.passing / evaluated) * 100}%"
                    ></div>
                    <div
                      class="bg-red-500"
                      style="width:{(policy.compliance.failing / evaluated) * 100}%"
                    ></div>
                  </div>
                {/if}
              </div>

              <form
                bind:this={toggleForms[policy.id]}
                method="POST"
                action="?/toggle"
                class="flex items-center"
                use:enhance={() => {
                  const next = !policy.enabled;
                  return async ({ result, update }) => {
                    if (result.type === 'success') {
                      toast.success(
                        next ? 'Política activada' : 'Política desactivada',
                        policy.name,
                      );
                    } else if (result.type === 'failure') {
                      toast.error(
                        'No se pudo cambiar la política',
                        String(result.data?.error ?? ''),
                      );
                    }
                    await update();
                  };
                }}
              >
                <input type="hidden" name="id" value={policy.id} />
                <input type="hidden" name="enabled" value={String(!policy.enabled)} />
                <Switch
                  checked={policy.enabled}
                  label={policy.enabled ? `Desactivar ${policy.name}` : `Activar ${policy.name}`}
                  disabled={!data.canUpdate}
                  size="sm"
                  onchange={() => toggleForms[policy.id]?.requestSubmit()}
                />
              </form>

              <a
                href={`${base}/${policy.id}`}
                class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
                aria-label="Ver {policy.name}"
              >
                <ArrowRight class="h-4 w-4" />
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

{#if data.canCreate}
  <Modal
    bind:open={createOpen}
    size="xl"
    title="Nueva política"
    description="Se evaluará en los próximos análisis de los servicios a los que aplique."
    dismissible={!creating}
  >
    <SecurityPolicyForm
      action={`${base}/new?/create`}
      formId="form-nueva-politica"
      services={data.services}
      tags={data.tags}
      showSubmit={false}
      bind:submitting={creating}
    />
    {#snippet footer()}
      <span class="mr-auto hidden items-center gap-1 text-xs text-fg-subtle sm:flex"
        ><span class="k-kbd">Esc</span> para cerrar</span
      >
      <button type="button" class="k-btn k-btn-secondary" onclick={() => (createOpen = false)}
        >Cancelar</button
      >
      <button
        type="submit"
        form="form-nueva-politica"
        class="k-btn k-btn-primary"
        disabled={creating}
      >
        <Plus class="h-4 w-4" />{creating ? 'Creando…' : 'Crear política'}
      </button>
    {/snippet}
  </Modal>
{/if}
