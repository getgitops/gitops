<script lang="ts">
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import { Plus, Search, ShieldCheck, ShieldOff } from '@lucide/svelte';
  import {
    describeScope,
    SECURITY_POLICY_ENFORCEMENT_META,
    SECURITY_POLICY_TYPE_META,
    type SecurityPolicy,
  } from '$lib/code-report/security-policy';

  export let data: {
    policies: SecurityPolicy[];
    project?: { slug?: string; organization?: { slug?: string | null } | null };
  };
  export let form: { error?: string } | null;

  let searchQuery = '';
  let typeFilter: 'all' | SecurityPolicy['type'] = 'all';

  $: orgSlug = data.project?.organization?.slug ?? $page?.params?.org ?? '';
  $: projectSlug = data.project?.slug ?? $page?.params?.slug ?? '';
  $: baseHref = `/org/${orgSlug}/projects/${projectSlug}/code-report/security-policy`;

  $: filteredPolicies = data.policies.filter((policy) => {
    if (typeFilter !== 'all' && policy.type !== typeFilter) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      policy.name.toLowerCase().includes(query) ||
      policy.slug.toLowerCase().includes(query) ||
      (policy.description ?? '').toLowerCase().includes(query)
    );
  });
</script>

<svelte:head><title>Security Policies - Code Report - GitVault Suite</title></svelte:head>

<div class="space-y-6">
  <div class="flex flex-wrap items-center gap-3">
    <div class="relative min-w-[220px] flex-1">
      <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Buscar políticas por nombre o slug..."
        class="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
      />
    </div>
    <select
      bind:value={typeFilter}
      class="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
    >
      <option value="all">Todos los tipos</option>
      {#each Object.entries(SECURITY_POLICY_TYPE_META) as [value, meta]}
        <option {value}>{meta.label}</option>
      {/each}
    </select>
    <a
      href={`${baseHref}/new`}
      class="inline-flex shrink-0 items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
    >
      <Plus class="h-4 w-4" />Nueva política
    </a>
  </div>

  {#if form?.error}
    <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{form.error}</p>
  {/if}

  {#if filteredPolicies.length === 0}
    <div
      class="rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"
    >
      <ShieldCheck class="mx-auto h-8 w-8 text-slate-400" />
      <p class="mt-3 text-sm font-medium text-slate-900">
        {data.policies.length === 0
          ? 'Todavía no hay políticas de seguridad en este proyecto.'
          : 'Sin resultados para tu búsqueda.'}
      </p>
      {#if data.policies.length === 0}
        <a href={`${baseHref}/new`} class="mt-4 inline-flex text-sm font-semibold text-slate-900 underline">
          Crear la primera política
        </a>
      {/if}
    </div>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each filteredPolicies as policy (policy.id)}
        <div
          class="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
        >
          <a href={`${baseHref}/${policy.id}`} class="flex-1">
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="text-sm font-semibold text-slate-900">{policy.name}</p>
                <p class="mt-1 text-xs text-slate-500">{policy.slug}</p>
              </div>
              <span
                class={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  policy.enabled
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {policy.enabled ? 'Activa' : 'Inactiva'}
              </span>
            </div>

            {#if policy.description}
              <p class="mt-2 line-clamp-2 text-sm text-slate-600">{policy.description}</p>
            {/if}

            <div class="mt-3 flex flex-wrap gap-1.5">
              <span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {SECURITY_POLICY_TYPE_META[policy.type].label}
              </span>
              <span
                class={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  policy.enforcement === 'block'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {SECURITY_POLICY_ENFORCEMENT_META[policy.enforcement].label}
              </span>
            </div>

            <p class="mt-3 text-[11px] text-slate-400">Alcance: {describeScope(policy.scope)}</p>
          </a>

          <form
            method="POST"
            action="?/toggle"
            use:enhance
            class="mt-4 border-t border-slate-100 pt-3"
          >
            <input type="hidden" name="id" value={policy.id} />
            <input type="hidden" name="enabled" value={String(!policy.enabled)} />
            <button
              type="submit"
              class={`inline-flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                policy.enabled
                  ? 'border-slate-200 bg-slate-50 text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              {#if policy.enabled}
                <ShieldOff class="h-4 w-4" />Desactivar política
              {:else}
                <ShieldCheck class="h-4 w-4" />Activar política
              {/if}
            </button>
          </form>
        </div>
      {/each}
    </div>
  {/if}
</div>
