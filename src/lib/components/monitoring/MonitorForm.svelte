<!--
  Formulario de monitor. Dos usos:
  - página (/monitors/new, /monitors/[id]/edit): acciones de la propia ruta y botones al final;
  - modal (`variant="modal"`, ver NewMonitorModal): `action` apunta a /monitors/new, los botones
    van en el pie del Modal con form={formId} y los resultados se gestionan aquí sin tocar la página.
-->
<script lang="ts">
  import { applyAction, enhance } from '$app/forms';
  import { untrack } from 'svelte';
  import { ChevronDown, FlaskConical, LoaderCircle, Plus, Save, Trash2 } from '@lucide/svelte';
  import { Field } from '#lib/components/ui';
  import { _ } from '#lib/i18n';
  import TestResultPanel from './TestResultPanel.svelte';
  import type { MonitorFormValues, ServiceOption, TestResult } from './types';

  let {
    values,
    errors = {},
    services,
    methods,
    intervals,
    editing = false,
    storedHeaderNames = [],
    hasStoredBody = false,
    test = null,
    canTest = true,
    cancelHref = '',
    action = '',
    formId,
    variant = 'page',
    intent = $bindable(null),
    onsaved,
  }: {
    values: MonitorFormValues;
    errors?: Record<string, string>;
    services: ServiceOption[];
    methods: readonly string[];
    intervals: readonly number[];
    editing?: boolean;
    storedHeaderNames?: string[];
    hasStoredBody?: boolean;
    test?: TestResult | null;
    canTest?: boolean;
    cancelHref?: string;
    /** Ruta de las acciones si no es la página actual (p. ej. `${base}/monitors/new`). */
    action?: string;
    formId?: string;
    variant?: 'page' | 'modal';
    intent?: 'save' | 'test' | null;
    /** Se llama justo antes de navegar al monitor guardado. */
    onsaved?: () => void;
  } = $props();

  // resultados de acciones en otra ruta (modal): no llegan al `form` de la página
  let localErrors = $state<Record<string, string> | null>(null);
  let localTest = $state<TestResult | null | undefined>(undefined);
  let shownErrors = $derived(localErrors ?? errors);
  let shownTest = $derived(localTest === undefined ? test : localTest);

  const sectionClass = $derived(
    variant === 'modal'
      ? 'border-t border-white/8 pt-6 first-of-type:border-t-0 first-of-type:pt-0'
      : 'k-card p-5 sm:p-6',
  );

  // initial state only: after a test the inputs keep what the user typed (no form reset)
  let method = $state(untrack(() => values.method || 'GET'));
  let headers = $state(
    untrack(() =>
      values.headers.length
        ? values.headers.map((header) => ({ ...header }))
        : [{ name: '', value: '' }],
    ),
  );
  // the conditions open by themselves when one of their fields has an error
  let showAdvanced = $derived(
    Boolean(
      shownErrors.timeoutMs ||
      shownErrors.expectedStatus ||
      shownErrors.degradedThresholdMs ||
      shownErrors.confirmations,
    ),
  );

  let sendsBody = $derived(method !== 'GET' && method !== 'HEAD');

  function error(field: string): string | null {
    const code = shownErrors[field];
    return code ? $_(`monitoring.errors.${code}`) : null;
  }

  function isStored(name: string): boolean {
    return (
      editing &&
      storedHeaderNames.some((stored) => stored.toLowerCase() === name.trim().toLowerCase())
    );
  }
</script>

<!-- inputs con defaultValue/defaultChecked: dan el valor inicial sin pisar lo que el usuario ya
     haya escrito si la página hidrata después (navegación completa y escritura rápida) -->
<form
  id={formId}
  method="POST"
  action="{action}?/save"
  class="space-y-6"
  use:enhance={({ submitter }) => {
    intent = submitter?.getAttribute('formaction')?.endsWith('?/test') ? 'test' : 'save';
    return async ({ result, update }) => {
      if (!action) {
        await update({ reset: false });
      } else if (result.type === 'failure') {
        localErrors = (result.data?.errors as Record<string, string>) ?? {};
        localTest = null;
      } else if (result.type === 'success') {
        localErrors = {};
        localTest = (result.data?.test as TestResult) ?? null;
      } else {
        if (result.type === 'redirect') onsaved?.();
        await applyAction(result);
      }
      intent = null;
    };
  }}
>
  <input type="hidden" name="enabledPresent" value="1" />

  <!-- petición -->
  <section class={sectionClass}>
    <h2 class="text-sm font-semibold text-white">{$_('monitoring.form.requestTitle')}</h2>
    <p class="mt-1 text-xs text-fg-subtle">{$_('monitoring.form.requestHelp')}</p>

    <div class="mt-5 grid gap-5 sm:grid-cols-2">
      <Field
        class="sm:col-span-2"
        id="monitor-name"
        label={$_('monitoring.form.name')}
        error={error('name')}
      >
        {#snippet children(control)}
          <input
            {...control}
            name="name"
            class="k-input"
            defaultValue={values.name}
            maxlength="120"
            placeholder={$_('monitoring.form.namePlaceholder')}
          />
        {/snippet}
      </Field>

      <Field
        class="sm:col-span-2"
        id="monitor-url"
        label={$_('monitoring.form.url')}
        error={error('method') ?? error('url')}
      >
        {#snippet children(control)}
          <div class="flex gap-2">
            <select
              name="method"
              bind:value={method}
              class="k-input w-28 shrink-0 font-mono font-semibold"
              aria-label={$_('monitoring.form.method')}
            >
              {#each methods as option (option)}
                <option value={option}>{option}</option>
              {/each}
            </select>
            <input
              {...control}
              name="url"
              type="url"
              class="k-input font-mono"
              defaultValue={values.url}
              placeholder="https://api.example.com/health"
              required
            />
          </div>
        {/snippet}
      </Field>

      <Field
        id="monitor-service"
        label={$_('monitoring.form.service')}
        help={$_('monitoring.form.serviceHelp')}
        error={error('serviceId')}
      >
        {#snippet children(control)}
          <select {...control} name="serviceId" class="k-input" value={values.serviceId}>
            <option value="">{$_('monitoring.form.noService')}</option>
            {#each services as service (service.id)}
              <option value={service.id}>{service.name}</option>
            {/each}
          </select>
        {/snippet}
      </Field>

      <Field
        id="monitor-interval"
        label={$_('monitoring.form.interval')}
        error={error('intervalSeconds')}
      >
        {#snippet children(control)}
          <select
            {...control}
            name="intervalSeconds"
            class="k-input"
            value={values.intervalSeconds || '60'}
          >
            {#each intervals as seconds (seconds)}
              <option value={String(seconds)}>
                {seconds < 60
                  ? $_('monitoring.form.everySeconds', { values: { count: seconds } })
                  : $_('monitoring.form.everyMinutes', { values: { count: seconds / 60 } })}
              </option>
            {/each}
          </select>
        {/snippet}
      </Field>
    </div>
  </section>

  <!-- cabeceras y cuerpo -->
  <section class={sectionClass}>
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold text-white">{$_('monitoring.form.headersTitle')}</h2>
        <p class="mt-1 text-xs text-fg-subtle">{$_('monitoring.form.headersHelp')}</p>
      </div>
      <button
        type="button"
        class="k-btn k-btn-secondary k-btn-sm"
        onclick={() => (headers = [...headers, { name: '', value: '' }])}
      >
        <Plus class="h-3.5 w-3.5" />{$_('monitoring.form.addHeader')}
      </button>
    </div>
    {#if error('headers')}<p class="mt-2 text-xs text-red-300">{error('headers')}</p>{/if}

    <div class="mt-4 space-y-2">
      {#each headers as header, index (index)}
        {@const nameError = error(`headers.${index}.name`)}
        {@const valueError = error(`headers.${index}.value`)}
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] gap-2">
          <div>
            <input
              name="headerName"
              class="k-input font-mono"
              bind:value={header.name}
              placeholder="Authorization"
              aria-label={$_('monitoring.form.headerName')}
              aria-invalid={nameError ? true : undefined}
            />
            {#if nameError}<p class="mt-1 text-xs text-red-300">{nameError}</p>{/if}
          </div>
          <div>
            <input
              name="headerValue"
              type={isStored(header.name) || /auth|token|key|secret|cookie/i.test(header.name)
                ? 'password'
                : 'text'}
              autocomplete="off"
              class="k-input font-mono"
              bind:value={header.value}
              placeholder={isStored(header.name) ? $_('monitoring.form.keepValue') : 'Bearer …'}
              aria-label={$_('monitoring.form.headerValue')}
              aria-invalid={valueError ? true : undefined}
            />
            {#if valueError}<p class="mt-1 text-xs text-red-300">{valueError}</p>{/if}
          </div>
          <button
            type="button"
            class="k-btn k-btn-ghost k-btn-icon hover:text-red-400"
            aria-label={$_('monitoring.form.removeHeader')}
            onclick={() =>
              (headers =
                headers.length > 1
                  ? headers.filter((_, i) => i !== index)
                  : [{ name: '', value: '' }])}
          >
            <Trash2 class="h-4 w-4" />
          </button>
        </div>
      {/each}
    </div>
    <p class="k-help mt-3">{$_('monitoring.form.secretsNote')}</p>

    {#if sendsBody}
      <div class="mt-6 space-y-2">
        <Field id="monitor-body" label={$_('monitoring.form.body')} error={error('body')}>
          {#snippet children(control)}
            <textarea
              {...control}
              name="body"
              rows="5"
              class="k-input font-mono text-xs"
              placeholder={editing && hasStoredBody
                ? $_('monitoring.form.keepBody')
                : '{"ping": true}'}>{values.body}</textarea
            >
          {/snippet}
        </Field>
        {#if editing && hasStoredBody}
          <label class="inline-flex items-center gap-2 text-xs text-fg-muted">
            <input type="checkbox" name="clearBody" class="k-checkbox" />
            {$_('monitoring.form.clearBody')}
          </label>
        {/if}
      </div>
    {/if}
  </section>

  <!-- condiciones: <details> nativo, se abre antes de hidratar (o sin JavaScript) -->
  <details class="group {sectionClass}" open={showAdvanced}>
    <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
      <span>
        <span class="block text-sm font-semibold text-white"
          >{$_('monitoring.form.conditionsTitle')}</span
        >
        <span class="mt-1 block text-xs text-fg-subtle">{$_('monitoring.form.conditionsHelp')}</span
        >
      </span>
      <span class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-400">
        <span class="group-open:hidden">{$_('monitoring.form.show')}</span>
        <span class="hidden group-open:inline">{$_('monitoring.form.hide')}</span>
        <ChevronDown class="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </span>
    </summary>

    <div class="mt-5 grid gap-5 sm:grid-cols-2">
      <Field
        id="monitor-expected"
        label={$_('monitoring.form.expectedStatus')}
        help={$_('monitoring.form.expectedStatusHelp')}
        error={error('expectedStatus')}
      >
        {#snippet children(control)}
          <input
            {...control}
            name="expectedStatus"
            class="k-input font-mono"
            defaultValue={values.expectedStatus || '200-299'}
            placeholder="200-299"
          />
        {/snippet}
      </Field>
      <Field id="monitor-timeout" label={$_('monitoring.form.timeout')} error={error('timeoutMs')}>
        {#snippet children(control)}
          <input
            {...control}
            name="timeoutMs"
            type="number"
            min="1000"
            max="30000"
            step="500"
            class="k-input"
            defaultValue={values.timeoutMs || '10000'}
          />
        {/snippet}
      </Field>
      <Field
        id="monitor-degraded"
        label={$_('monitoring.form.degradedThreshold')}
        help={$_('monitoring.form.degradedThresholdHelp')}
        error={error('degradedThresholdMs')}
      >
        {#snippet children(control)}
          <input
            {...control}
            name="degradedThresholdMs"
            type="number"
            min="0"
            max="60000"
            step="100"
            class="k-input"
            defaultValue={values.degradedThresholdMs || '2000'}
          />
        {/snippet}
      </Field>
      <Field
        id="monitor-confirmations"
        label={$_('monitoring.form.confirmations')}
        help={$_('monitoring.form.confirmationsHelp')}
        error={error('confirmations')}
      >
        {#snippet children(control)}
          <input
            {...control}
            name="confirmations"
            type="number"
            min="1"
            max="10"
            class="k-input"
            defaultValue={values.confirmations || '2'}
          />
        {/snippet}
      </Field>
      <label class="inline-flex items-center gap-2.5 text-sm text-fg">
        <input
          type="checkbox"
          name="followRedirects"
          defaultChecked={values.followRedirects}
          class="k-checkbox"
        />
        {$_('monitoring.form.followRedirects')}
      </label>
      <label class="inline-flex items-center gap-2.5 text-sm text-fg">
        <input type="checkbox" name="enabled" defaultChecked={values.enabled} class="k-checkbox" />
        {$_('monitoring.form.enabled')}
      </label>
    </div>
  </details>

  {#if shownTest}
    <TestResultPanel result={shownTest} />
  {/if}

  {#if variant === 'page'}
    <div class="flex flex-wrap items-center justify-end gap-2">
      <a href={cancelHref} class="k-btn k-btn-ghost">{$_('common.cancel')}</a>
      {#if canTest}
        <button
          type="submit"
          formaction="?/test"
          class="k-btn k-btn-secondary"
          disabled={intent !== null}
        >
          {#if intent === 'test'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<FlaskConical
              class="h-4 w-4"
            />{/if}
          {$_('monitoring.form.test')}
        </button>
      {/if}
      <button type="submit" class="k-btn k-btn-primary" disabled={intent !== null}>
        {#if intent === 'save'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Save
            class="h-4 w-4"
          />{/if}
        {editing ? $_('monitoring.form.saveChanges') : $_('monitoring.form.create')}
      </button>
    </div>
  {/if}
</form>
