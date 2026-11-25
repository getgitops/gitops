<script lang="ts">
  import { enhance } from '$app/forms';
  import { createPageStore } from '#lib/page-store';
  import {
    ArrowLeft,
    CircleCheck,
    Pencil,
    RefreshCw,
    ShieldAlert,
    ShieldCheck,
    Trash2,
  } from '@lucide/svelte';
  import {
    describeScope,
    SECURITY_POLICY_ENFORCEMENT_META,
    SECURITY_POLICY_TYPE_META,
    type SecurityPolicy,
  } from '#lib/code-report/security-policy';
  import CodeReportToolBadge from '#lib/components/code-report/CodeReportToolBadge.svelte';
  import SecurityPolicyForm from '#lib/components/code-report/SecurityPolicyForm.svelte';
  import { Field, Modal, Tabs, toast } from '#lib/components/ui';
  import { locale } from '#lib/i18n';

  type EvaluatedService = {
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

  let {
    data,
  }: {
    data: {
      policy: SecurityPolicy;
      affectedServices: EvaluatedService[];
      services: { id: string; slug: string; name: string; tags: string[] }[];
      tags: string[];
      canUpdate: boolean;
      canDelete: boolean;
      project?: { slug?: string; organization?: { slug?: string | null } | null };
    };
  } = $props();

  const page = createPageStore();
  const projectBase = $derived(
    `/org/${data.project?.organization?.slug ?? $page.params.org}/projects/${data.project?.slug ?? $page.params.slug}/code-report`,
  );
  const policy = $derived(data.policy);

  let tab = $state('summary');
  let editOpen = $state(false);
  let saving = $state(false);
  let deleteOpen = $state(false);
  let deleting = $state(false);
  let confirmText = $state('');
  let evaluating = $state(false);

  const failing = $derived(data.affectedServices.filter((service) => !service.passing));
  const scopedServices = $derived(
    policy.scope.mode === 'services'
      ? data.services.filter((service) => policy.scope.services.includes(service.id))
      : [],
  );

  const ruleLabels: Record<string, string> = {
    maxCritical: 'Máx. críticas',
    maxHigh: 'Máx. altas',
    maxMedium: 'Máx. medias',
    maxLow: 'Máx. bajas',
    minCvssScore: 'CVSS mínimo',
    ignoreUnfixed: 'Ignorar sin parche',
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

  const severityRules = [
    { key: 'maxCritical', label: 'Críticas', dot: 'bg-red-500' },
    { key: 'maxHigh', label: 'Altas', dot: 'bg-brand-500' },
    { key: 'maxMedium', label: 'Medias', dot: 'bg-amber-400' },
    { key: 'maxLow', label: 'Bajas', dot: 'bg-white/30' },
  ];

  const rules = $derived((policy.rules ?? {}) as Record<string, unknown>);
  const otherRules = $derived(
    Object.entries(rules).filter(
      ([key]) =>
        policy.type !== 'vulnerabilities' || !severityRules.some((rule) => rule.key === key),
    ),
  );

  function formatRule(value: unknown) {
    if (value === null || value === undefined || value === '') return 'Sin límite';
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'Ninguno';
    if (value === 'denylist') return 'Denegar las indicadas';
    if (value === 'allowlist') return 'Permitir solo las indicadas';
    return String(value);
  }

  function date(iso: string | Date) {
    return new Intl.DateTimeFormat($locale ?? 'es', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  }
</script>

<svelte:head><title>{policy.name} - Políticas de seguridad - GitOps</title></svelte:head>

<div class="space-y-6">
  <a
    href={`${projectBase}/security-policy`}
    class="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-white"
  >
    <ArrowLeft class="h-3.5 w-3.5" />Volver a políticas
  </a>

  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="flex min-w-0 items-start gap-4">
      <span
        class="grid h-12 w-12 shrink-0 place-items-center rounded-xl border {failing.length
          ? 'border-red-500/30 bg-red-500/10 text-red-400'
          : 'border-brand-500/30 bg-brand-500/10 text-brand-400'}"
      >
        {#if failing.length}<ShieldAlert class="h-6 w-6" />{:else}<ShieldCheck
            class="h-6 w-6"
          />{/if}
      </span>
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-semibold tracking-tight text-white">{policy.name}</h1>
          <span class="k-badge {policy.enabled ? 'k-badge-ok' : ''}">
            <span class="h-1.5 w-1.5 rounded-full {policy.enabled ? 'bg-ok' : 'bg-fg-subtle'}"
            ></span>
            {policy.enabled ? 'Activa' : 'Inactiva'}
          </span>
        </div>
        <p class="mt-0.5 font-mono text-xs text-fg-subtle">{policy.slug}</p>
        {#if policy.description}
          <p class="mt-2 max-w-2xl text-sm text-fg-muted">{policy.description}</p>
        {/if}
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      {#if data.canUpdate}
        <form
          method="POST"
          action="?/evaluate"
          use:enhance={() => {
            evaluating = true;
            return async ({ result, update }) => {
              evaluating = false;
              if (result.type === 'success' && result.data?.evaluated) {
                const evaluated = result.data.evaluated as {
                  servicesEvaluated: number;
                  failingServices: number;
                };
                const summary =
                  evaluated.servicesEvaluated === 1
                    ? '1 servicio evaluado'
                    : `${evaluated.servicesEvaluated} servicios evaluados`;
                if (evaluated.failingServices > 0)
                  toast.warning(
                    evaluated.failingServices === 1
                      ? '1 servicio incumple la política'
                      : `${evaluated.failingServices} servicios incumplen la política`,
                    summary,
                  );
                else toast.success('Todos los servicios cumplen', summary);
              } else if (result.type === 'failure') {
                toast.error('No se pudo re-evaluar', String(result.data?.error ?? ''));
              }
              await update({ reset: false });
            };
          }}
        >
          <button type="submit" class="k-btn k-btn-secondary" disabled={evaluating}>
            <RefreshCw class="h-4 w-4 {evaluating ? 'animate-spin' : ''}" />
            {evaluating ? 'Evaluando…' : 'Re-evaluar'}
          </button>
        </form>
        <button type="button" class="k-btn k-btn-primary" onclick={() => (editOpen = true)}>
          <Pencil class="h-4 w-4" />Editar
        </button>
      {/if}
      {#if data.canDelete}
        <button
          type="button"
          class="k-btn k-btn-ghost k-btn-icon hover:text-red-400"
          aria-label="Borrar política"
          title="Borrar política"
          onclick={() => {
            confirmText = '';
            deleteOpen = true;
          }}
        >
          <Trash2 class="h-4 w-4" />
        </button>
      {/if}
    </div>
  </header>

  <Tabs
    label="Secciones de la política"
    idPrefix="policy"
    bind:value={tab}
    items={[
      { value: 'summary', label: 'Resumen' },
      { value: 'services', label: 'Servicios evaluados', count: data.affectedServices.length },
    ]}
  />

  {#if tab === 'summary'}
    <div class="grid gap-4 lg:grid-cols-3">
      <div class="min-w-0 space-y-4 lg:col-span-2">
        <section class="k-card p-5" aria-labelledby="rules-title">
          <h2 id="rules-title" class="font-semibold text-white">Reglas</h2>
          {#if policy.type === 'vulnerabilities'}
            <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {#each severityRules as rule (rule.key)}
                {@const value = rules[rule.key]}
                <div class="rounded-lg border border-white/8 bg-white/2 px-3 py-2.5">
                  <p class="flex items-center gap-2 text-xs text-fg-muted">
                    <span class="h-2 w-2 rounded-full {rule.dot}"></span>Máx. {rule.label.toLowerCase()}
                  </p>
                  <p
                    class="mt-1 text-xl font-semibold tabular-nums {value === null ||
                    value === undefined
                      ? 'text-fg-subtle'
                      : 'text-white'}"
                  >
                    {value === null || value === undefined ? '∞' : value}
                  </p>
                </div>
              {/each}
            </div>
          {/if}
          {#if otherRules.length > 0}
            <dl class="mt-4 divide-y divide-white/6 border-t border-white/8">
              {#each otherRules as [key, value] (key)}
                <div class="flex flex-wrap items-start justify-between gap-3 py-2.5 text-sm">
                  <dt class="text-fg-muted">{ruleLabels[key] ?? key}</dt>
                  <dd
                    class="max-w-md text-right {Array.isArray(value)
                      ? 'font-mono text-xs'
                      : ''} text-fg"
                  >
                    {formatRule(value)}
                  </dd>
                </div>
              {/each}
            </dl>
          {/if}
        </section>

        {#if failing.length > 0}
          <section class="k-card overflow-hidden border-red-500/30" aria-labelledby="failing-title">
            <div class="border-b border-white/8 px-5 py-4">
              <h2 id="failing-title" class="font-semibold text-white">
                {failing.length}
                {failing.length === 1 ? 'servicio la incumple' : 'servicios la incumplen'}
              </h2>
              <p class="text-xs text-fg-subtle">Según su último análisis evaluado</p>
            </div>
            <ul class="divide-y divide-white/6">
              {#each failing as service (service.id)}
                <li class="flex flex-wrap items-center gap-3 px-5 py-3">
                  <a
                    href={`${projectBase}/services/${service.slug}`}
                    class="min-w-0 flex-1 truncate font-medium text-white hover:text-brand-300"
                    >{service.name}</a
                  >
                  <div class="flex flex-wrap gap-1.5">
                    {#each service.violations as violation (violation.label)}
                      <span class="k-badge k-badge-danger tabular-nums">
                        {violation.label}: {violation.actual}{violation.limit !== null
                          ? ` / ${violation.limit}`
                          : ''}
                      </span>
                    {/each}
                  </div>
                </li>
              {/each}
            </ul>
          </section>
        {:else if data.affectedServices.length > 0}
          <section class="k-card flex items-center gap-3 px-5 py-4 text-sm text-fg-muted">
            <CircleCheck class="h-4 w-4 text-ok" />Todos los servicios evaluados cumplen esta
            política.
          </section>
        {/if}
      </div>

      <aside class="min-w-0 space-y-4">
        <section class="k-card divide-y divide-white/6" aria-label="Configuración">
          <div class="px-5 py-4">
            <p class="text-xs text-fg-subtle">Vigila</p>
            <p class="mt-0.5 text-sm font-medium text-white">
              {SECURITY_POLICY_TYPE_META[policy.type].label}
            </p>
            <p class="text-xs text-fg-subtle">
              {SECURITY_POLICY_TYPE_META[policy.type].description}
            </p>
          </div>
          <div class="px-5 py-4">
            <p class="text-xs text-fg-subtle">Si se incumple</p>
            <p class="mt-0.5">
              <span
                class="k-badge {policy.enforcement === 'block' ? 'k-badge-danger' : 'k-badge-warn'}"
                >{SECURITY_POLICY_ENFORCEMENT_META[policy.enforcement].label}</span
              >
            </p>
            <p class="mt-1 text-xs text-fg-subtle">
              {SECURITY_POLICY_ENFORCEMENT_META[policy.enforcement].description}
            </p>
          </div>
          <div class="px-5 py-4">
            <p class="text-xs text-fg-subtle">Alcance</p>
            <p class="mt-0.5 text-sm font-medium text-white">{describeScope(policy.scope)}</p>
            {#if scopedServices.length > 0}
              <div class="mt-2 flex flex-wrap gap-1.5">
                {#each scopedServices as service (service.id)}
                  <a
                    href={`${projectBase}/services/${service.slug}`}
                    class="k-badge hover:text-white">{service.name}</a
                  >
                {/each}
              </div>
            {/if}
          </div>
          <div class="space-y-1 px-5 py-4 text-xs text-fg-subtle">
            <p>Creada el {date(policy.createdAt)}</p>
            <p>Actualizada el {date(policy.updatedAt)}</p>
          </div>
        </section>
      </aside>
    </div>
  {:else}
    <section class="k-card overflow-hidden" aria-label="Servicios evaluados">
      {#if data.affectedServices.length === 0}
        <div class="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p class="text-sm text-fg-muted">Ningún análisis ha evaluado esta política todavía.</p>
          {#if data.canUpdate}
            <p class="text-xs text-fg-subtle">
              Pulsa «Re-evaluar» para aplicarla a los últimos análisis.
            </p>
          {/if}
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full min-w-176 text-left text-sm">
            <thead class="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
              <tr class="border-b border-white/8">
                <th class="px-5 py-3 font-semibold">Servicio</th>
                <th class="px-3 py-3 font-semibold">Estado</th>
                <th class="px-3 py-3 font-semibold">Incumplimientos</th>
                <th class="px-3 py-3 font-semibold">Último análisis</th>
                <th class="px-5 py-3 text-right font-semibold">Análisis que incumplen</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              {#each data.affectedServices as service (service.id)}
                <tr class="transition-colors hover:bg-white/2.5">
                  <td class="px-5 py-3">
                    <a
                      href={`${projectBase}/services/${service.slug}`}
                      class="font-medium text-white hover:text-brand-300">{service.name}</a
                    >
                  </td>
                  <td class="px-3 py-3">
                    <span class="k-badge {service.passing ? 'k-badge-ok' : 'k-badge-danger'}">
                      {service.passing ? 'Cumple' : 'Incumple'}
                    </span>
                  </td>
                  <td class="px-3 py-3 text-xs">
                    {#if service.violations.length}
                      <span class="text-red-300"
                        >{service.violations
                          .map(
                            (v) =>
                              `${v.label}: ${v.actual}${v.limit !== null ? `/${v.limit}` : ''}`,
                          )
                          .join(' · ')}</span
                      >
                    {:else}<span class="text-fg-subtle">—</span>{/if}
                  </td>
                  <td class="px-3 py-3">
                    <a
                      href={`${projectBase}/history/${service.lastAnalysisId}`}
                      class="inline-flex items-center gap-2 text-xs text-fg-muted hover:text-white"
                    >
                      <CodeReportToolBadge tool={service.lastTool} size="sm" />
                      {date(service.lastEvaluatedAt)}
                    </a>
                  </td>
                  <td class="px-5 py-3 text-right tabular-nums text-fg-muted">
                    {service.failingAnalyses} / {service.evaluatedAnalyses}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}
</div>

{#if data.canUpdate}
  <Modal
    bind:open={editOpen}
    size="xl"
    title="Editar política"
    description={policy.name}
    dismissible={!saving}
  >
    {#key policy.updatedAt}
      <SecurityPolicyForm
        action="?/update"
        formId="form-editar-politica"
        services={data.services}
        tags={data.tags}
        {policy}
        showSubmit={false}
        bind:submitting={saving}
        onsuccess={() => (editOpen = false)}
      />
    {/key}
    {#snippet footer()}
      <button type="button" class="k-btn k-btn-secondary" onclick={() => (editOpen = false)}
        >Cancelar</button
      >
      <button
        type="submit"
        form="form-editar-politica"
        class="k-btn k-btn-primary"
        disabled={saving}
      >
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </button>
    {/snippet}
  </Modal>
{/if}

{#if data.canDelete}
  <Modal
    bind:open={deleteOpen}
    role="alertdialog"
    size="sm"
    dismissible={!deleting}
    title="¿Borrar la política?"
    description="Dejará de evaluarse en los análisis. Quedará un commit en GitDB, pero no se puede deshacer desde la interfaz."
  >
    {#snippet icon()}
      <span
        class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
        ><Trash2 class="h-5 w-5" /></span
      >
    {/snippet}
    <form
      id="form-borrar-politica"
      method="POST"
      action="?/delete"
      use:enhance={() => {
        deleting = true;
        const name = policy.name;
        return async ({ result, update }) => {
          deleting = false;
          if (result.type === 'redirect') {
            deleteOpen = false;
            toast.success('Política borrada', name);
          } else if (result.type === 'failure') {
            toast.error('No se pudo borrar la política', String(result.data?.error ?? ''));
            return;
          }
          await update();
        };
      }}
    >
      <Field label="Escribe {policy.slug} para confirmar">
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
        >Cancelar</button
      >
      <button
        type="submit"
        form="form-borrar-politica"
        class="k-btn k-btn-danger"
        disabled={deleting || confirmText !== policy.slug}>Borrar política</button
      >
    {/snippet}
  </Modal>
{/if}
