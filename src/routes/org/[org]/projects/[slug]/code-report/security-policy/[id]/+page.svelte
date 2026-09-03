<script lang="ts">
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import { ArrowLeft, Pencil, RefreshCw, Trash2, X } from '@lucide/svelte';
  import SecurityPolicyForm from '$lib/components/code-report/SecurityPolicyForm.svelte';
  import { _ } from '$lib/i18n';
  import {
    describeScope,
    SECURITY_POLICY_ENFORCEMENT_META,
    SECURITY_POLICY_TYPE_META,
    type SecurityPolicy,
  } from '$lib/code-report/security-policy';

  type AffectedService = {
    id: string;
    slug: string;
    name: string;
    evaluatedAnalyses: number;
    failingAnalyses: number;
    lastEvaluatedAt: string;
    lastAnalysisId: string;
    lastTool: string;
    passing: boolean;
    violations: { label: string; actual: number; limit: number | null }[];
  };

  export let data: {
    policy: SecurityPolicy;
    affectedServices: AffectedService[];
    services: { id: string; slug: string; name: string; tags: string[] }[];
    tags: string[];
    project?: { slug?: string; organization?: { slug?: string | null } | null };
  };
  export let form: {
    error?: string;
    success?: boolean;
    evaluated?: { servicesEvaluated: number; analysesUpdated: number; failingServices: number };
  } | null;

  let editing = false;
  let deleteModalOpen = false;
  let deleting = false;
  let evaluating = false;
  let activeTab: 'detail' | 'services' = 'detail';

  $: policy = data.policy;
  $: orgSlug = data.project?.organization?.slug ?? $page?.params?.org ?? '';
  $: projectSlug = data.project?.slug ?? $page?.params?.slug ?? '';
  $: baseHref = `/org/${orgSlug}/projects/${projectSlug}/code-report/security-policy`;
  $: servicesHref = `/org/${orgSlug}/projects/${projectSlug}/code-report/services`;
  $: failingServicesCount = data.affectedServices.filter((service) => !service.passing).length;
  $: if (form?.success) editing = false;

  $: scopedServices =
    policy.scope.mode === 'services'
      ? data.services.filter((service) => policy.scope.services.includes(service.id))
      : [];

  function ruleEntries(rules: Record<string, unknown>) {
    return Object.entries(rules ?? {});
  }

  const ruleLabels: Record<string, string> = {
    maxCritical: 'Máx. críticas',
    maxHigh: 'Máx. altas',
    maxMedium: 'Máx. medias',
    maxLow: 'Máx. bajas',
    minCvssScore: 'CVSS mínimo',
    ignoreUnfixed: 'Ignorar sin fix',
    maxAgeDays: 'Antigüedad máx. (días)',
    ignoredCves: 'CVEs ignorados',
    mode: 'Modo',
    licenses: 'Licencias',
    allowUnknown: 'Permitir desconocidas',
    minTotalCoverage: 'Cobertura total mínima',
    minPatchCoverage: 'Cobertura de cambios mínima',
    allowCoverageDrop: 'Permitir bajada',
    maxSecrets: 'Máx. secretos',
    blockVerifiedOnly: 'Solo verificados',
    ignoredRules: 'Reglas ignoradas',
  };

  function formatRuleValue(value: unknown) {
    if (value === null || value === undefined || value === '') return 'Sin límite';
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'Ninguno';
    return String(value);
  }
</script>

<svelte:head><title>{policy.name} - Security Policies - GitOps</title></svelte:head>

<div class="space-y-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <a href={baseHref} class="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
      <ArrowLeft class="h-3.5 w-3.5" />{$_('codeReport.securityPolicy.backToPolicies')}
    </a>
    <div class="flex flex-wrap items-center gap-2">
      <form
        method="POST"
        action="?/evaluate"
        use:enhance={() => {
          evaluating = true;
          return async ({ update }) => {
            await update({ reset: false });
            evaluating = false;
          };
        }}
      >
        <button
          type="submit"
          disabled={evaluating}
          class="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw class={`h-4 w-4 ${evaluating ? 'animate-spin' : ''}`} />
          {evaluating ? $_('codeReport.securityPolicy.evaluating') : $_('codeReport.securityPolicy.evaluateServices')}
        </button>
      </form>
      <button
        type="button"
        on:click={() => (editing = !editing)}
        class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Pencil class="h-4 w-4" />{editing
          ? $_('codeReport.securityPolicy.cancelEditing')
          : $_('codeReport.securityPolicy.editing')}
      </button>
      <button
        type="button"
        on:click={() => (deleteModalOpen = true)}
        class="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
      >
        <Trash2 class="h-4 w-4" />{$_('codeReport.securityPolicy.delete')}
      </button>
    </div>
  </div>

  {#if form?.evaluated}
    <p
      class={`rounded-xl border px-4 py-3 text-sm ${
        form.evaluated.failingServices > 0
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}
    >
      {form.evaluated.servicesEvaluated} {$_('codeReport.securityPolicy.servicesReevaluated')} ({form.evaluated.analysesUpdated}
      {$_('codeReport.securityPolicy.analysesUpdated')}).
      {#if form.evaluated.failingServices > 0}
        <strong>{form.evaluated.failingServices}</strong> {$_('codeReport.securityPolicy.failingPolicy')}
      {:else}
        {$_('codeReport.securityPolicy.noneFailPolicy')}
      {/if}
    </p>
  {/if}

  {#if editing}
    {#key policy.updatedAt}
      <SecurityPolicyForm
        action="?/update"
        submitLabel={$_('projectSettings.overview.saveChanges')}
        services={data.services}
        tags={data.tags}
        {policy}
        errorMessage={form?.error ?? null}
      />
    {/key}
  {:else}
    <div class="flex gap-1 border-b border-slate-200" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'detail'}
        on:click={() => (activeTab = 'detail')}
        class={`border-b-2 px-4 py-3 text-sm font-semibold ${activeTab === 'detail' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
      >
        {$_('codeReport.securityPolicy.detailTab')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'services'}
        on:click={() => (activeTab = 'services')}
        class={`border-b-2 px-4 py-3 text-sm font-semibold ${activeTab === 'services' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
      >
        {$_('codeReport.securityPolicy.affectedServicesTab')}
        <span class="ml-1 text-xs font-normal text-slate-400">{data.affectedServices.length}</span>
      </button>
    </div>

    {#if activeTab === 'services'}
    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-sm font-semibold text-slate-900">{$_('codeReport.securityPolicy.affectedServices')}</h2>
          <p class="mt-1 text-xs text-slate-500">
            {$_('codeReport.securityPolicy.affectedServicesDescription')}
          </p>
        </div>
        {#if failingServicesCount > 0}
          <span class="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
            {failingServicesCount} {$_('codeReport.securityPolicy.failing')}
          </span>
        {/if}
      </div>

      {#if data.affectedServices.length === 0}
        <p class="mt-6 text-sm text-slate-500">
          {$_('codeReport.securityPolicy.noEvaluations')}
        </p>
      {:else}
        <ul class="mt-4 space-y-2">
          {#each data.affectedServices as service (service.id)}
            <li
              class={`rounded-xl border p-4 ${service.passing ? 'border-slate-200' : 'border-red-200 bg-red-50/50'}`}
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <a
                    href={`${servicesHref}/${service.slug}`}
                    class="text-sm font-semibold text-slate-900 hover:underline"
                  >
                    {service.name}
                  </a>
                  <p class="mt-0.5 text-xs text-slate-500">
                    {service.evaluatedAnalyses} {$_('codeReport.securityPolicy.analysesEvaluated')} · {$_('codeReport.securityPolicy.lastWith')} {service.lastTool} {$_('codeReport.securityPolicy.onDate')}
                    {new Date(service.lastEvaluatedAt).toLocaleString()}
                  </p>
                  {#if service.violations.length > 0}
                    <ul class="mt-2 flex flex-wrap gap-1.5">
                      {#each service.violations as violation}
                        <li
                          class="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-700"
                        >
                          {violation.label}: {violation.actual}{violation.limit !== null
                            ? ` / ${violation.limit}`
                            : ''}
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <span
                    class={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${service.passing ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
                  >
                    {service.passing ? $_('codeReport.securityPolicy.compliant') : $_('codeReport.securityPolicy.nonCompliant')}
                  </span>
                  <span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                    {service.failingAnalyses} {$_('codeReport.securityPolicy.analysesAffected')}
                  </span>
                </div>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {:else}
    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-lg font-semibold text-slate-900">{policy.name}</h1>
          <p class="mt-1 text-xs text-slate-500">{policy.slug}</p>
          {#if policy.description}
            <p class="mt-3 max-w-2xl text-sm text-slate-600">{policy.description}</p>
          {/if}
        </div>
        <span
          class={`rounded-full px-3 py-1 text-xs font-semibold ${
            policy.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {policy.enabled ? $_('codeReport.securityPolicy.active') : $_('codeReport.securityPolicy.inactive')}
        </span>
      </div>

      <div class="mt-5 grid gap-4 sm:grid-cols-3">
        <div class="rounded-xl border border-slate-200 p-4">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{$_('codeReport.securityPolicy.type')}</p>
          <p class="mt-1 text-sm font-semibold text-slate-900">
            {SECURITY_POLICY_TYPE_META[policy.type].label}
          </p>
        </div>
        <div class="rounded-xl border border-slate-200 p-4">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{$_('codeReport.securityPolicy.application')}</p>
          <p class="mt-1 text-sm font-semibold text-slate-900">
            {SECURITY_POLICY_ENFORCEMENT_META[policy.enforcement].label}
          </p>
          <p class="mt-1 text-xs text-slate-500">
            {SECURITY_POLICY_ENFORCEMENT_META[policy.enforcement].description}
          </p>
        </div>
        <div class="rounded-xl border border-slate-200 p-4">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{$_('codeReport.securityPolicy.scope')}</p>
          <p class="mt-1 text-sm font-semibold text-slate-900">{describeScope(policy.scope)}</p>
          {#if scopedServices.length > 0}
            <div class="mt-2 flex flex-wrap gap-1.5">
              {#each scopedServices as service}
                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  {service.name}
                </span>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 class="text-sm font-semibold text-slate-900">{$_('codeReport.securityPolicy.rules')}</h2>
      <dl class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each ruleEntries(policy.rules) as [key, value]}
          <div class="rounded-xl border border-slate-200 p-3">
            <dt class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {ruleLabels[key] ?? key}
            </dt>
            <dd class="mt-1 text-sm text-slate-800">{formatRuleValue(value)}</dd>
          </div>
        {/each}
      </dl>
    </section>

    <p class="text-xs text-slate-400">
      {$_('codeReport.securityPolicy.createdOn')} {new Date(policy.createdAt).toLocaleString()} · {$_('codeReport.securityPolicy.updatedOn')}
      {new Date(policy.updatedAt).toLocaleString()}
    </p>
    {/if}
  {/if}
</div>

{#if deleteModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
    <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <div class="flex items-start justify-between">
        <h3 class="text-lg font-semibold">{$_('codeReport.securityPolicy.deletePolicy')}</h3>
        <button type="button" on:click={() => (deleteModalOpen = false)}>
          <X class="h-5 w-5" />
        </button>
      </div>
      <p class="mt-3 text-sm text-slate-600">
        {$_('codeReport.securityPolicy.deleteDescriptionStart')} <strong>{policy.name}</strong>{$_('codeReport.securityPolicy.deleteDescriptionEnd')}
      </p>
      <form
        method="POST"
        action="?/delete"
        use:enhance={() => {
          deleting = true;
          return async ({ update }) => {
            await update();
            deleting = false;
          };
        }}
        class="mt-5 flex justify-end gap-2"
      >
        <button
          type="button"
          on:click={() => (deleteModalOpen = false)}
          class="rounded-full border px-4 py-2 text-sm">{$_('codeReport.services.cancel')}</button
        >
        <button
          type="submit"
          disabled={deleting}
          class="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white"
        >
          {deleting ? $_('codeReport.securityPolicy.deleting') : $_('codeReport.securityPolicy.deletePolicy')}
        </button>
      </form>
    </div>
  </div>
{/if}
