<script lang="ts">
  import { enhance } from '$app/forms';
  import { X } from '@lucide/svelte';
  import {
    defaultRulesFor,
    defaultScope,
    SECURITY_POLICY_ENFORCEMENT_META,
    SECURITY_POLICY_ENFORCEMENTS,
    SECURITY_POLICY_TYPE_META,
    SECURITY_POLICY_TYPES,
    type SecurityPolicy,
    type SecurityPolicyEnforcement,
    type SecurityPolicyScope,
    type SecurityPolicyType,
  } from '$lib/code-report/security-policy';

  type ServiceOption = { id: string; slug: string; name: string; tags: string[] };

  export let action: string;
  export let submitLabel = 'Guardar';
  export let services: ServiceOption[] = [];
  export let tags: string[] = [];
  export let policy: Partial<SecurityPolicy> | null = null;
  export let errorMessage: string | null = null;

  let name = policy?.name ?? '';
  let slug = policy?.slug ?? '';
  let slugTouched = Boolean(policy?.slug);
  let description = policy?.description ?? '';
  let type: SecurityPolicyType = policy?.type ?? 'vulnerabilities';
  let enabled = policy?.enabled ?? true;
  let enforcement: SecurityPolicyEnforcement = policy?.enforcement ?? 'warn';
  let scope: SecurityPolicyScope = { ...defaultScope(), ...(policy?.scope ?? {}) };
  let rulesByType: Record<string, any> = SECURITY_POLICY_TYPES.reduce(
    (acc, key) => ({ ...acc, [key]: defaultRulesFor(key) }),
    {} as Record<string, any>,
  );
  if (policy?.type && policy?.rules) {
    rulesByType[policy.type] = { ...rulesByType[policy.type], ...policy.rules };
  }

  let submitting = false;
  let ignoredCveInput = '';
  let licenseInput = '';
  let ignoredRuleInput = '';

  function slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  $: if (!slugTouched) slug = slugify(name);
  $: rules = rulesByType[type];

  function toggleInList(list: string[], value: string) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function addToRuleList(field: string, value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    const current: string[] = rulesByType[type][field] ?? [];
    if (!current.includes(trimmed)) {
      rulesByType[type] = { ...rulesByType[type], [field]: [...current, trimmed] };
      rulesByType = { ...rulesByType };
    }
  }

  function removeFromRuleList(field: string, value: string) {
    const current: string[] = rulesByType[type][field] ?? [];
    rulesByType[type] = { ...rulesByType[type], [field]: current.filter((item) => item !== value) };
    rulesByType = { ...rulesByType };
  }

  function numberOrNull(value: unknown) {
    return value === '' || value === null || value === undefined ? null : Number(value);
  }

  $: payload = JSON.stringify({
    name,
    slug,
    description,
    type,
    enabled,
    enforcement,
    scope,
    rules:
      type === 'vulnerabilities'
        ? {
            ...rules,
            maxCritical: numberOrNull(rules.maxCritical),
            maxHigh: numberOrNull(rules.maxHigh),
            maxMedium: numberOrNull(rules.maxMedium),
            maxLow: numberOrNull(rules.maxLow),
            minCvssScore: numberOrNull(rules.minCvssScore),
            maxAgeDays: numberOrNull(rules.maxAgeDays),
          }
        : rules,
  });

  const severityFields = [
    { key: 'maxCritical', label: 'Críticas', hint: 'Máximo permitido' },
    { key: 'maxHigh', label: 'Altas', hint: 'Máximo permitido' },
    { key: 'maxMedium', label: 'Medias', hint: 'Máximo permitido' },
    { key: 'maxLow', label: 'Bajas', hint: 'Máximo permitido' },
  ];

  const scopeModes: { value: SecurityPolicyScope['mode']; label: string }[] = [
    { value: 'all', label: 'Todos los servicios' },
    { value: 'services', label: 'Servicios concretos' },
    { value: 'tags', label: 'Por tags' },
  ];

  const licenseModes: { value: 'denylist' | 'allowlist'; label: string }[] = [
    { value: 'denylist', label: 'Lista de denegadas' },
    { value: 'allowlist', label: 'Lista de permitidas' },
  ];
</script>

<form
  method="POST"
  {action}
  use:enhance={() => {
    submitting = true;
    return async ({ update }) => {
      await update();
      submitting = false;
    };
  }}
  class="space-y-4"
>
  <input type="hidden" name="payload" value={payload} />

  {#if errorMessage}
    <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
  {/if}

  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 class="text-sm font-semibold text-slate-900">1. Información general</h2>
    <p class="mt-1 text-xs text-slate-500">Identifica la política dentro del proyecto.</p>

    <div class="mt-4 grid gap-4 sm:grid-cols-2">
      <label class="block">
        <span class="text-xs font-medium text-slate-600">Nombre</span>
        <input
          type="text"
          bind:value={name}
          required
          placeholder="Sin vulnerabilidades críticas"
          class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
      </label>
      <label class="block">
        <span class="text-xs font-medium text-slate-600">Slug</span>
        <input
          type="text"
          bind:value={slug}
          on:input={() => (slugTouched = true)}
          placeholder="sin-criticas"
          class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
      </label>
    </div>

    <label class="mt-4 block">
      <span class="text-xs font-medium text-slate-600">Descripción</span>
      <textarea
        bind:value={description}
        rows="2"
        placeholder="Qué comprueba esta política y por qué."
        class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
      ></textarea>
    </label>
  </section>

  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 class="text-sm font-semibold text-slate-900">2. Tipo de política</h2>
    <p class="mt-1 text-xs text-slate-500">Determina qué reglas puedes configurar.</p>

    <div class="mt-4 grid gap-3 sm:grid-cols-2">
      {#each SECURITY_POLICY_TYPES as value}
        <button
          type="button"
          disabled={!SECURITY_POLICY_TYPE_META[value].available}
          on:click={() => (type = value)}
          class={`rounded-xl border p-4 text-left transition ${
            type === value ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
          } ${SECURITY_POLICY_TYPE_META[value].available ? '' : 'cursor-not-allowed opacity-50'}`}
        >
          <p class="text-sm font-semibold text-slate-900">
            {SECURITY_POLICY_TYPE_META[value].label}
          </p>
          <p class="mt-1 text-xs text-slate-500">{SECURITY_POLICY_TYPE_META[value].description}</p>
          {#if !SECURITY_POLICY_TYPE_META[value].available}
            <p class="mt-2 text-[11px] font-semibold uppercase text-slate-400">Próximamente</p>
          {/if}
        </button>
      {/each}
    </div>
  </section>

  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 class="text-sm font-semibold text-slate-900">3. Alcance</h2>
    <p class="mt-1 text-xs text-slate-500">A qué servicios del proyecto se aplica.</p>

    <div class="mt-4 flex flex-wrap gap-2">
      {#each scopeModes as option}
        <button
          type="button"
          on:click={() => (scope = { ...scope, mode: option.value })}
          class={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
            scope.mode === option.value
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-200 text-slate-600 hover:border-slate-300'
          }`}
        >
          {option.label}
        </button>
      {/each}
    </div>

    {#if scope.mode === 'services'}
      <div class="mt-4 grid gap-2 sm:grid-cols-2">
        {#each services as service (service.id)}
          <label class="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={scope.services.includes(service.id)}
              on:change={() => (scope = { ...scope, services: toggleInList(scope.services, service.id) })}
            />
            <span class="text-slate-700">{service.name}</span>
            <span class="text-xs text-slate-400">{service.slug}</span>
          </label>
        {:else}
          <p class="text-sm text-slate-500">No hay servicios en este proyecto.</p>
        {/each}
      </div>
    {:else if scope.mode === 'tags'}
      <div class="mt-4 flex flex-wrap gap-2">
        {#each tags as tag}
          <button
            type="button"
            on:click={() => (scope = { ...scope, tags: toggleInList(scope.tags, tag) })}
            class={`rounded-full border px-3 py-1 text-xs font-medium ${
              scope.tags.includes(tag)
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 text-slate-600'
            }`}
          >
            {tag}
          </button>
        {:else}
          <p class="text-sm text-slate-500">No hay tags definidos en los servicios.</p>
        {/each}
      </div>
    {/if}
  </section>

  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 class="text-sm font-semibold text-slate-900">4. Reglas</h2>
    <p class="mt-1 text-xs text-slate-500">
      Deja un campo vacío para no aplicar ese límite.
    </p>

    {#if type === 'vulnerabilities'}
      <div class="mt-4 grid gap-4 sm:grid-cols-4">
        {#each severityFields as field}
          <label class="block">
            <span class="text-xs font-medium text-slate-600">{field.label}</span>
            <input
              type="number"
              min="0"
              bind:value={rulesByType.vulnerabilities[field.key]}
              placeholder="Sin límite"
              class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            />
            <span class="mt-1 block text-[11px] text-slate-400">{field.hint}</span>
          </label>
        {/each}
      </div>

      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="text-xs font-medium text-slate-600">CVSS mínimo a considerar</span>
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            bind:value={rulesByType.vulnerabilities.minCvssScore}
            placeholder="Sin filtro"
            class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>
        <label class="block">
          <span class="text-xs font-medium text-slate-600">Antigüedad máxima del hallazgo (días)</span>
          <input
            type="number"
            min="0"
            bind:value={rulesByType.vulnerabilities.maxAgeDays}
            placeholder="Sin límite"
            class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>
      </div>

      <label class="mt-4 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" bind:checked={rulesByType.vulnerabilities.ignoreUnfixed} />
        Ignorar vulnerabilidades sin fix disponible
      </label>

      <div class="mt-4">
        <span class="text-xs font-medium text-slate-600">CVEs ignorados</span>
        <div class="mt-1 flex gap-2">
          <input
            type="text"
            bind:value={ignoredCveInput}
            placeholder="CVE-2024-1234"
            on:keydown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addToRuleList('ignoredCves', ignoredCveInput);
                ignoredCveInput = '';
              }
            }}
            class="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
          <button
            type="button"
            on:click={() => {
              addToRuleList('ignoredCves', ignoredCveInput);
              ignoredCveInput = '';
            }}
            class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Añadir
          </button>
        </div>
        <div class="mt-2 flex flex-wrap gap-1.5">
          {#each rulesByType.vulnerabilities.ignoredCves as cve}
            <span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
              {cve}
              <button type="button" on:click={() => removeFromRuleList('ignoredCves', cve)}>
                <X class="h-3 w-3" />
              </button>
            </span>
          {/each}
        </div>
      </div>
    {:else if type === 'license'}
      <div class="mt-4 flex gap-2">
        {#each licenseModes as option}
          <button
            type="button"
            on:click={() =>
              (rulesByType.license = { ...rulesByType.license, mode: option.value })}
            class={`rounded-full border px-4 py-1.5 text-xs font-semibold ${
              rulesByType.license.mode === option.value
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 text-slate-600'
            }`}
          >
            {option.label}
          </button>
        {/each}
      </div>
      <div class="mt-4 flex gap-2">
        <input
          type="text"
          bind:value={licenseInput}
          placeholder="GPL-3.0"
          class="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
        <button
          type="button"
          on:click={() => {
            addToRuleList('licenses', licenseInput);
            licenseInput = '';
          }}
          class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
        >
          Añadir
        </button>
      </div>
      <div class="mt-2 flex flex-wrap gap-1.5">
        {#each rulesByType.license.licenses as license}
          <span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
            {license}
            <button type="button" on:click={() => removeFromRuleList('licenses', license)}>
              <X class="h-3 w-3" />
            </button>
          </span>
        {/each}
      </div>
      <label class="mt-4 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" bind:checked={rulesByType.license.allowUnknown} />
        Permitir dependencias con licencia desconocida
      </label>
    {:else if type === 'code_coverage'}
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="text-xs font-medium text-slate-600">Cobertura total mínima (%)</span>
          <input
            type="number"
            min="0"
            max="100"
            bind:value={rulesByType.code_coverage.minTotalCoverage}
            class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>
        <label class="block">
          <span class="text-xs font-medium text-slate-600">Cobertura mínima de los cambios (%)</span>
          <input
            type="number"
            min="0"
            max="100"
            bind:value={rulesByType.code_coverage.minPatchCoverage}
            class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </label>
      </div>
      <label class="mt-4 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" bind:checked={rulesByType.code_coverage.allowCoverageDrop} />
        Permitir que la cobertura baje respecto al análisis anterior
      </label>
    {:else if type === 'secrets'}
      <label class="mt-4 block sm:w-1/2">
        <span class="text-xs font-medium text-slate-600">Máximo de secretos expuestos</span>
        <input
          type="number"
          min="0"
          bind:value={rulesByType.secrets.maxSecrets}
          class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
      </label>
      <label class="mt-4 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" bind:checked={rulesByType.secrets.blockVerifiedOnly} />
        Considerar solo secretos verificados
      </label>
      <div class="mt-4 flex gap-2">
        <input
          type="text"
          bind:value={ignoredRuleInput}
          placeholder="generic-api-key"
          class="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
        <button
          type="button"
          on:click={() => {
            addToRuleList('ignoredRules', ignoredRuleInput);
            ignoredRuleInput = '';
          }}
          class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
        >
          Añadir regla ignorada
        </button>
      </div>
      <div class="mt-2 flex flex-wrap gap-1.5">
        {#each rulesByType.secrets.ignoredRules as rule}
          <span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
            {rule}
            <button type="button" on:click={() => removeFromRuleList('ignoredRules', rule)}>
              <X class="h-3 w-3" />
            </button>
          </span>
        {/each}
      </div>
    {/if}
  </section>

  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 class="text-sm font-semibold text-slate-900">5. Aplicación</h2>
    <p class="mt-1 text-xs text-slate-500">Qué ocurre cuando un análisis incumple la política.</p>

    <div class="mt-4 grid gap-3 sm:grid-cols-2">
      {#each SECURITY_POLICY_ENFORCEMENTS as value}
        <button
          type="button"
          disabled={!SECURITY_POLICY_ENFORCEMENT_META[value].available}
          on:click={() => (enforcement = value)}
          class={`rounded-xl border p-4 text-left transition ${
            enforcement === value
              ? 'border-slate-900 bg-slate-50'
              : 'border-slate-200 hover:border-slate-300'
          } ${SECURITY_POLICY_ENFORCEMENT_META[value].available ? '' : 'cursor-not-allowed opacity-50'}`}
        >
          <p class="text-sm font-semibold text-slate-900">
            {SECURITY_POLICY_ENFORCEMENT_META[value].label}
          </p>
          <p class="mt-1 text-xs text-slate-500">
            {SECURITY_POLICY_ENFORCEMENT_META[value].description}
          </p>
          {#if !SECURITY_POLICY_ENFORCEMENT_META[value].available}
            <p class="mt-2 text-[11px] font-semibold uppercase text-slate-400">Próximamente</p>
          {/if}
        </button>
      {/each}
    </div>

    <label class="mt-4 flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" bind:checked={enabled} />
      Política activa
    </label>
  </section>

  <div class="flex justify-end gap-2">
    <slot name="secondary-actions" />
    <button
      type="submit"
      disabled={submitting || !name.trim()}
      class="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
    >
      {submitting ? 'Guardando...' : submitLabel}
    </button>
  </div>
</form>
