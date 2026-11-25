<!--
  Formulario de política de seguridad (crear y editar).
  Envía todo como JSON en `payload` a `action`. En un Modal/Drawer, pon `showSubmit={false}` y un
  botón con `form={formId}` en el pie; `onsuccess` se llama cuando la acción devuelve éxito.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { Plus, Save, X } from '@lucide/svelte';
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
  } from '#lib/code-report/security-policy';
  import { Field, Switch, Tabs, toast } from '#lib/components/ui';

  type ServiceOption = { id: string; slug: string; name: string; tags: string[] };

  let {
    action,
    formId = 'security-policy-form',
    submitLabel = 'Guardar',
    services = [],
    tags = [],
    policy = null,
    showSubmit = true,
    submitting = $bindable(false),
    onsuccess,
  }: {
    action: string;
    formId?: string;
    submitLabel?: string;
    services?: ServiceOption[];
    tags?: string[];
    policy?: Partial<SecurityPolicy> | null;
    showSubmit?: boolean;
    submitting?: boolean;
    onsuccess?: () => void;
  } = $props();

  const initial = untrack(() => policy);

  let name = $state(initial?.name ?? '');
  let slug = $state(initial?.slug ?? '');
  let slugTouched = $state(Boolean(initial?.slug));
  let description = $state(initial?.description ?? '');
  let type = $state<SecurityPolicyType>(initial?.type ?? 'vulnerabilities');
  let enabled = $state(initial?.enabled ?? true);
  let enforcement = $state<SecurityPolicyEnforcement>(initial?.enforcement ?? 'warn');
  let scope = $state<SecurityPolicyScope>({ ...defaultScope(), ...(initial?.scope ?? {}) });
  let rulesByType = $state<Record<string, any>>(
    Object.fromEntries(
      SECURITY_POLICY_TYPES.map((key) => [
        key,
        initial?.type === key && initial.rules
          ? { ...defaultRulesFor(key), ...initial.rules }
          : defaultRulesFor(key),
      ]),
    ),
  );
  let error = $state<string | null>(null);
  let listInputs = $state<Record<string, string>>({
    ignoredCves: '',
    licenses: '',
    ignoredRules: '',
  });

  function slugify(value: string) {
    return value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  const effectiveSlug = $derived(slugTouched ? slug : slugify(name));
  const rules = $derived(rulesByType[type]);

  function toggle(list: string[], value: string) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function addToList(field: string) {
    const value = listInputs[field]?.trim();
    if (!value) return;
    const current: string[] = rulesByType[type][field] ?? [];
    if (!current.includes(value)) rulesByType[type][field] = [...current, value];
    listInputs[field] = '';
  }

  function removeFromList(field: string, value: string) {
    rulesByType[type][field] = (rulesByType[type][field] ?? []).filter(
      (item: string) => item !== value,
    );
  }

  function numberOrNull(value: unknown) {
    return value === '' || value === null || value === undefined ? null : Number(value);
  }

  const payload = $derived(
    JSON.stringify({
      name,
      slug: effectiveSlug,
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
    }),
  );

  const severityFields = [
    { key: 'maxCritical', label: 'Críticas', dot: 'bg-red-500' },
    { key: 'maxHigh', label: 'Altas', dot: 'bg-brand-500' },
    { key: 'maxMedium', label: 'Medias', dot: 'bg-amber-400' },
    { key: 'maxLow', label: 'Bajas', dot: 'bg-white/30' },
  ];

  const scopeItems = [
    { value: 'all', label: 'Todos los servicios' },
    { value: 'services', label: 'Servicios concretos' },
    { value: 'tags', label: 'Por tags' },
  ];
</script>

<form
  id={formId}
  method="POST"
  {action}
  class="space-y-6"
  use:enhance={() => {
    submitting = true;
    error = null;
    return async ({ result, update }) => {
      submitting = false;
      if (result.type === 'redirect') {
        toast.success('Política creada', name);
        await goto(result.location, { invalidateAll: true });
      } else if (result.type === 'success') {
        toast.success('Política guardada', name);
        await update({ reset: false });
        onsuccess?.();
      } else if (result.type === 'failure') {
        error = result.data?.error ? String(result.data.error) : 'No se pudo guardar la política';
        toast.error('No se pudo guardar la política', error);
      } else {
        await update();
      }
    };
  }}
>
  <input type="hidden" name="payload" value={payload} />

  {#if error}
    <p
      class="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-red-200"
      role="alert"
    >
      {error}
    </p>
  {/if}

  <!-- General -->
  <fieldset class="space-y-4">
    <legend class="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle"
      >General</legend
    >
    <div class="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre" required>
        {#snippet children(control)}
          <input
            class="k-input"
            placeholder="Sin vulnerabilidades críticas"
            autocomplete="off"
            data-autofocus
            bind:value={name}
            {...control}
          />
        {/snippet}
      </Field>
      <Field label="Slug" help="Identificador para la API y la CLI.">
        {#snippet children(control)}
          <input
            class="k-input font-mono text-[13px]"
            placeholder="sin-criticas"
            autocomplete="off"
            spellcheck="false"
            value={effectiveSlug}
            oninput={(event) => {
              slugTouched = true;
              slug = event.currentTarget.value;
            }}
            {...control}
          />
        {/snippet}
      </Field>
    </div>
    <Field label="Descripción">
      {#snippet aside()}Opcional{/snippet}
      {#snippet children(control)}
        <textarea
          class="k-input"
          rows="2"
          placeholder="Qué comprueba y por qué."
          bind:value={description}
          {...control}></textarea>
      {/snippet}
    </Field>
  </fieldset>

  <!-- Tipo -->
  <fieldset>
    <legend class="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle"
      >Qué vigila</legend
    >
    <div class="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tipo de política">
      {#each SECURITY_POLICY_TYPES as value (value)}
        {@const meta = SECURITY_POLICY_TYPE_META[value]}
        <button
          type="button"
          role="radio"
          aria-checked={type === value}
          disabled={!meta.available}
          onclick={() => (type = value)}
          class="rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 {type ===
          value
            ? 'border-brand-500/60 bg-brand-500/10'
            : 'border-white/10 bg-white/2 hover:border-white/20'}"
        >
          <span class="flex items-center gap-2 text-sm font-medium text-white">
            {meta.label}
            {#if !meta.available}<span class="k-badge text-[10px]">Próximamente</span>{/if}
          </span>
          <span class="mt-0.5 block text-xs text-fg-subtle">{meta.description}</span>
        </button>
      {/each}
    </div>
  </fieldset>

  <!-- Reglas -->
  <fieldset class="space-y-4">
    <legend class="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle"
      >Reglas</legend
    >
    <p class="-mt-2 text-xs text-fg-subtle">Deja un campo vacío para no aplicar ese límite.</p>

    {#if type === 'vulnerabilities'}
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {#each severityFields as field (field.key)}
          <div>
            <label class="k-label flex items-center gap-2" for="rule-{field.key}">
              <span class="h-2 w-2 rounded-full {field.dot}"></span>Máx. {field.label.toLowerCase()}
            </label>
            <input
              id="rule-{field.key}"
              type="number"
              min="0"
              class="k-input tabular-nums"
              placeholder="Sin límite"
              bind:value={rulesByType.vulnerabilities[field.key]}
            />
          </div>
        {/each}
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <Field label="CVSS mínimo a considerar" help="Las de menor puntuación no cuentan.">
          {#snippet children(control)}
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              class="k-input tabular-nums"
              placeholder="Sin filtro"
              bind:value={rulesByType.vulnerabilities.minCvssScore}
              {...control}
            />
          {/snippet}
        </Field>
        <Field label="Antigüedad máxima (días)" help="Desde que se publicó el CVE.">
          {#snippet children(control)}
            <input
              type="number"
              min="0"
              class="k-input tabular-nums"
              placeholder="Sin límite"
              bind:value={rulesByType.vulnerabilities.maxAgeDays}
              {...control}
            />
          {/snippet}
        </Field>
      </div>
      <label class="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          class="k-checkbox"
          bind:checked={rulesByType.vulnerabilities.ignoreUnfixed}
        />
        Ignorar vulnerabilidades sin parche disponible
      </label>
      {@render listEditor(
        'ignoredCves',
        'CVEs ignorados',
        'CVE-2024-1234',
        'Excepciones aceptadas: no cuentan para los límites.',
      )}
    {:else if type === 'license'}
      <Tabs
        variant="segmented"
        size="sm"
        label="Modo de licencias"
        items={[
          { value: 'denylist', label: 'Denegar estas' },
          { value: 'allowlist', label: 'Permitir solo estas' },
        ]}
        bind:value={rulesByType.license.mode}
      />
      {@render listEditor('licenses', 'Licencias', 'GPL-3.0', '')}
      <label class="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" class="k-checkbox" bind:checked={rulesByType.license.allowUnknown} />
        Permitir dependencias con licencia desconocida
      </label>
    {:else if type === 'code_coverage'}
      <div class="grid gap-3 sm:grid-cols-2">
        <Field label="Cobertura total mínima (%)">
          {#snippet children(control)}
            <input
              type="number"
              min="0"
              max="100"
              class="k-input"
              bind:value={rulesByType.code_coverage.minTotalCoverage}
              {...control}
            />
          {/snippet}
        </Field>
        <Field label="Cobertura mínima de los cambios (%)">
          {#snippet children(control)}
            <input
              type="number"
              min="0"
              max="100"
              class="k-input"
              bind:value={rulesByType.code_coverage.minPatchCoverage}
              {...control}
            />
          {/snippet}
        </Field>
      </div>
      <label class="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          class="k-checkbox"
          bind:checked={rulesByType.code_coverage.allowCoverageDrop}
        />
        Permitir que la cobertura baje respecto al análisis anterior
      </label>
    {:else if type === 'secrets'}
      <div class="sm:w-1/2">
        <Field label="Máximo de secretos expuestos">
          {#snippet children(control)}
            <input
              type="number"
              min="0"
              class="k-input"
              bind:value={rulesByType.secrets.maxSecrets}
              {...control}
            />
          {/snippet}
        </Field>
      </div>
      <label class="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          class="k-checkbox"
          bind:checked={rulesByType.secrets.blockVerifiedOnly}
        />
        Considerar solo secretos verificados
      </label>
      {@render listEditor('ignoredRules', 'Reglas ignoradas', 'generic-api-key', '')}
    {/if}
  </fieldset>

  <!-- Alcance -->
  <fieldset class="space-y-3">
    <legend class="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle"
      >Alcance</legend
    >
    <Tabs
      variant="segmented"
      size="sm"
      label="Alcance"
      items={scopeItems}
      value={scope.mode}
      onchange={(mode) => (scope = { ...scope, mode: mode as SecurityPolicyScope['mode'] })}
    />
    {#if scope.mode === 'services'}
      {#if services.length === 0}
        <p class="text-sm text-fg-subtle">No hay servicios en este proyecto.</p>
      {:else}
        <div class="grid gap-1.5 sm:grid-cols-2">
          {#each services as service (service.id)}
            <label
              class="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors {scope.services.includes(
                service.id,
              )
                ? 'border-brand-500/50 bg-brand-500/8'
                : 'border-white/10 bg-white/2 hover:border-white/20'}"
            >
              <input
                type="checkbox"
                class="k-checkbox"
                checked={scope.services.includes(service.id)}
                onchange={() =>
                  (scope = { ...scope, services: toggle(scope.services, service.id) })}
              />
              <span class="min-w-0 flex-1 truncate text-white">{service.name}</span>
              <span class="truncate font-mono text-[11px] text-fg-subtle">{service.slug}</span>
            </label>
          {/each}
        </div>
      {/if}
    {:else if scope.mode === 'tags'}
      {#if tags.length === 0}
        <p class="text-sm text-fg-subtle">Ningún servicio tiene tags todavía.</p>
      {:else}
        <div class="flex flex-wrap gap-1.5">
          {#each tags as tag (tag)}
            <button
              type="button"
              aria-pressed={scope.tags.includes(tag)}
              onclick={() => (scope = { ...scope, tags: toggle(scope.tags, tag) })}
              class="k-badge cursor-pointer {scope.tags.includes(tag)
                ? 'k-badge-brand'
                : 'hover:text-white'}">{tag}</button
            >
          {/each}
        </div>
      {/if}
    {/if}
  </fieldset>

  <!-- Aplicación -->
  <fieldset class="space-y-3">
    <legend class="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle"
      >Si se incumple</legend
    >
    <div class="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Aplicación">
      {#each SECURITY_POLICY_ENFORCEMENTS as value (value)}
        {@const meta = SECURITY_POLICY_ENFORCEMENT_META[value]}
        <button
          type="button"
          role="radio"
          aria-checked={enforcement === value}
          disabled={!meta.available}
          onclick={() => (enforcement = value)}
          class="rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 {enforcement ===
          value
            ? 'border-brand-500/60 bg-brand-500/10'
            : 'border-white/10 bg-white/2 hover:border-white/20'}"
        >
          <span class="flex items-center gap-2 text-sm font-medium text-white">
            {meta.label}
            {#if !meta.available}<span class="k-badge text-[10px]">Próximamente</span>{/if}
          </span>
          <span class="mt-0.5 block text-xs text-fg-subtle">{meta.description}</span>
        </button>
      {/each}
    </div>
    <div
      class="flex items-center justify-between gap-4 rounded-lg border border-white/8 bg-white/2 px-3 py-2.5"
    >
      <div>
        <p class="text-sm text-white" id="policy-enabled-label">Política activa</p>
        <p class="text-xs text-fg-subtle">Si está inactiva no se evalúa en los análisis.</p>
      </div>
      <Switch bind:checked={enabled} label="Política activa" />
    </div>
  </fieldset>

  {#if showSubmit}
    <div class="flex justify-end border-t border-white/8 pt-5">
      <button type="submit" class="k-btn k-btn-primary" disabled={submitting || !name.trim()}>
        <Save class="h-4 w-4" />{submitting ? 'Guardando…' : submitLabel}
      </button>
    </div>
  {/if}
</form>

{#snippet listEditor(field: string, label: string, placeholder: string, help: string)}
  <div>
    <label class="k-label" for="list-{field}">{label}</label>
    <div class="flex gap-2">
      <input
        id="list-{field}"
        class="k-input font-mono text-[13px]"
        {placeholder}
        autocomplete="off"
        bind:value={listInputs[field]}
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            addToList(field);
          }
        }}
      />
      <button type="button" class="k-btn k-btn-secondary shrink-0" onclick={() => addToList(field)}>
        <Plus class="h-4 w-4" />Añadir
      </button>
    </div>
    {#if help}<p class="k-help">{help}</p>{/if}
    {#if (rulesByType[type][field] ?? []).length > 0}
      <div class="mt-2 flex flex-wrap gap-1.5">
        {#each rulesByType[type][field] as item (item)}
          <span class="k-badge gap-1 pr-1 font-mono">
            {item}
            <button
              type="button"
              class="grid h-4 w-4 place-items-center rounded text-fg-subtle hover:bg-white/10 hover:text-white"
              aria-label="Quitar {item}"
              onclick={() => removeFromList(field, item)}><X class="h-3 w-3" /></button
            >
          </span>
        {/each}
      </div>
    {/if}
  </div>
{/snippet}
