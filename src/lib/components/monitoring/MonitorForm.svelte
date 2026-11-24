<script lang="ts">
  import { enhance } from '$app/forms';
  import { untrack } from 'svelte';
  import { FlaskConical, LoaderCircle, Plus, Save, Trash2 } from '@lucide/svelte';
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
    cancelHref,
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
    cancelHref: string;
  } = $props();

  // initial state only: after a test the inputs keep what the user typed (no form reset)
  let method = $state(untrack(() => values.method || 'GET'));
  let headers = $state(
    untrack(() =>
      values.headers.length
        ? values.headers.map((header) => ({ ...header }))
        : [{ name: '', value: '' }],
    ),
  );
  let intent = $state<'save' | 'test' | null>(null);
  // the conditions open by themselves when one of their fields has an error
  let showAdvanced = $derived(
    Boolean(
      errors.timeoutMs ||
      errors.expectedStatus ||
      errors.degradedThresholdMs ||
      errors.confirmations,
    ),
  );

  let sendsBody = $derived(method !== 'GET' && method !== 'HEAD');

  function error(field: string): string | null {
    const code = errors[field];
    return code ? $_(`monitoring.errors.${code}`) : null;
  }

  function isStored(name: string): boolean {
    return (
      editing &&
      storedHeaderNames.some((stored) => stored.toLowerCase() === name.trim().toLowerCase())
    );
  }

  const inputClass =
    'field-input w-full rounded-xl border px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none';
  const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-300';
</script>

<form
  method="POST"
  action="?/save"
  class="space-y-6"
  use:enhance={({ submitter }) => {
    intent = submitter?.getAttribute('formaction') === '?/test' ? 'test' : 'save';
    return async ({ update }) => {
      await update({ reset: false });
      intent = null;
    };
  }}
>
  <input type="hidden" name="enabledPresent" value="1" />

  <!-- request -->
  <section class="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
    <h2 class="text-sm font-semibold text-slate-100">{$_('monitoring.form.requestTitle')}</h2>
    <p class="mt-1 text-xs text-slate-500">{$_('monitoring.form.requestHelp')}</p>

    <div class="mt-5 grid gap-4 sm:grid-cols-2">
      <div class="sm:col-span-2">
        <label class={labelClass} for="monitor-name">{$_('monitoring.form.name')}</label>
        <input
          id="monitor-name"
          name="name"
          class={inputClass}
          value={values.name}
          maxlength="120"
          placeholder={$_('monitoring.form.namePlaceholder')}
        />
        {#if error('name')}<p class="mt-1 text-xs text-rose-400">{error('name')}</p>{/if}
      </div>

      <div class="sm:col-span-2">
        <label class={labelClass} for="monitor-url">{$_('monitoring.form.url')}</label>
        <div class="flex gap-2">
          <select
            name="method"
            bind:value={method}
            class="field-input w-28 shrink-0 rounded-xl border px-3 py-2.5 font-mono text-sm font-semibold"
            aria-label={$_('monitoring.form.method')}
          >
            {#each methods as option (option)}
              <option value={option}>{option}</option>
            {/each}
          </select>
          <input
            id="monitor-url"
            name="url"
            type="url"
            class="{inputClass} font-mono"
            value={values.url}
            placeholder="https://api.example.com/health"
            required
          />
        </div>
        {#if error('method')}<p class="mt-1 text-xs text-rose-400">{error('method')}</p>{/if}
        {#if error('url')}<p class="mt-1 text-xs text-rose-400">{error('url')}</p>{/if}
      </div>

      <div>
        <label class={labelClass} for="monitor-service">{$_('monitoring.form.service')}</label>
        <select id="monitor-service" name="serviceId" class={inputClass} value={values.serviceId}>
          <option value="">{$_('monitoring.form.noService')}</option>
          {#each services as service (service.id)}
            <option value={service.id}>{service.name}</option>
          {/each}
        </select>
        <p class="mt-1 text-[11px] text-slate-500">{$_('monitoring.form.serviceHelp')}</p>
        {#if error('serviceId')}<p class="mt-1 text-xs text-rose-400">{error('serviceId')}</p>{/if}
      </div>

      <div>
        <label class={labelClass} for="monitor-interval">{$_('monitoring.form.interval')}</label>
        <select
          id="monitor-interval"
          name="intervalSeconds"
          class={inputClass}
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
        {#if error('intervalSeconds')}<p class="mt-1 text-xs text-rose-400">
            {error('intervalSeconds')}
          </p>{/if}
      </div>
    </div>
  </section>

  <!-- headers & body -->
  <section class="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold text-slate-100">{$_('monitoring.form.headersTitle')}</h2>
        <p class="mt-1 text-xs text-slate-500">{$_('monitoring.form.headersHelp')}</p>
      </div>
      <button
        type="button"
        class="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
        onclick={() => (headers = [...headers, { name: '', value: '' }])}
      >
        <Plus class="h-3.5 w-3.5" />{$_('monitoring.form.addHeader')}
      </button>
    </div>
    {#if error('headers')}<p class="mt-2 text-xs text-rose-400">{error('headers')}</p>{/if}

    <div class="mt-4 space-y-2">
      {#each headers as header, index (index)}
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] gap-2">
          <div>
            <input
              name="headerName"
              class="{inputClass} font-mono"
              bind:value={header.name}
              placeholder="Authorization"
              aria-label={$_('monitoring.form.headerName')}
            />
            {#if error(`headers.${index}.name`)}<p class="mt-1 text-xs text-rose-400">
                {error(`headers.${index}.name`)}
              </p>{/if}
          </div>
          <div>
            <input
              name="headerValue"
              type={isStored(header.name) || /auth|token|key|secret|cookie/i.test(header.name)
                ? 'password'
                : 'text'}
              autocomplete="off"
              class="{inputClass} font-mono"
              bind:value={header.value}
              placeholder={isStored(header.name) ? $_('monitoring.form.keepValue') : 'Bearer …'}
              aria-label={$_('monitoring.form.headerValue')}
            />
            {#if error(`headers.${index}.value`)}<p class="mt-1 text-xs text-rose-400">
                {error(`headers.${index}.value`)}
              </p>{/if}
          </div>
          <button
            type="button"
            class="btn-ghost h-[42px] rounded-xl px-3 text-slate-500 hover:text-rose-400"
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
    <p class="mt-3 text-[11px] text-slate-500">{$_('monitoring.form.secretsNote')}</p>

    {#if sendsBody}
      <div class="mt-6">
        <label class={labelClass} for="monitor-body">{$_('monitoring.form.body')}</label>
        <textarea
          id="monitor-body"
          name="body"
          rows="5"
          class="{inputClass} font-mono text-xs"
          placeholder={editing && hasStoredBody ? $_('monitoring.form.keepBody') : '{"ping": true}'}
          >{values.body}</textarea
        >
        {#if editing && hasStoredBody}
          <label class="mt-2 inline-flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" name="clearBody" class="rounded" />
            {$_('monitoring.form.clearBody')}
          </label>
        {/if}
        {#if error('body')}<p class="mt-1 text-xs text-rose-400">{error('body')}</p>{/if}
      </div>
    {/if}
  </section>

  <!-- conditions: a native <details>, so it opens before (or without) JavaScript -->
  <details
    class="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
    open={showAdvanced}
  >
    <summary class="flex cursor-pointer list-none items-center justify-between text-left">
      <span>
        <span class="block text-sm font-semibold text-slate-100"
          >{$_('monitoring.form.conditionsTitle')}</span
        >
        <span class="mt-1 block text-xs text-slate-500">{$_('monitoring.form.conditionsHelp')}</span
        >
      </span>
      <span class="text-xs font-semibold text-sky-400 group-open:hidden"
        >{$_('monitoring.form.show')}</span
      >
      <span class="hidden text-xs font-semibold text-sky-400 group-open:inline"
        >{$_('monitoring.form.hide')}</span
      >
    </summary>

    <div class="mt-5 grid gap-4 sm:grid-cols-2">
      <div>
        <label class={labelClass} for="monitor-expected"
          >{$_('monitoring.form.expectedStatus')}</label
        >
        <input
          id="monitor-expected"
          name="expectedStatus"
          class="{inputClass} font-mono"
          value={values.expectedStatus || '200-299'}
          placeholder="200-299"
        />
        <p class="mt-1 text-[11px] text-slate-500">{$_('monitoring.form.expectedStatusHelp')}</p>
        {#if error('expectedStatus')}<p class="mt-1 text-xs text-rose-400">
            {error('expectedStatus')}
          </p>{/if}
      </div>
      <div>
        <label class={labelClass} for="monitor-timeout">{$_('monitoring.form.timeout')}</label>
        <input
          id="monitor-timeout"
          name="timeoutMs"
          type="number"
          min="1000"
          max="30000"
          step="500"
          class={inputClass}
          value={values.timeoutMs || '10000'}
        />
        {#if error('timeoutMs')}<p class="mt-1 text-xs text-rose-400">{error('timeoutMs')}</p>{/if}
      </div>
      <div>
        <label class={labelClass} for="monitor-degraded"
          >{$_('monitoring.form.degradedThreshold')}</label
        >
        <input
          id="monitor-degraded"
          name="degradedThresholdMs"
          type="number"
          min="0"
          max="60000"
          step="100"
          class={inputClass}
          value={values.degradedThresholdMs || '2000'}
        />
        <p class="mt-1 text-[11px] text-slate-500">{$_('monitoring.form.degradedThresholdHelp')}</p>
        {#if error('degradedThresholdMs')}<p class="mt-1 text-xs text-rose-400">
            {error('degradedThresholdMs')}
          </p>{/if}
      </div>
      <div>
        <label class={labelClass} for="monitor-confirmations"
          >{$_('monitoring.form.confirmations')}</label
        >
        <input
          id="monitor-confirmations"
          name="confirmations"
          type="number"
          min="1"
          max="10"
          class={inputClass}
          value={values.confirmations || '2'}
        />
        <p class="mt-1 text-[11px] text-slate-500">{$_('monitoring.form.confirmationsHelp')}</p>
        {#if error('confirmations')}<p class="mt-1 text-xs text-rose-400">
            {error('confirmations')}
          </p>{/if}
      </div>
      <label class="inline-flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          name="followRedirects"
          checked={values.followRedirects}
          class="rounded"
        />
        {$_('monitoring.form.followRedirects')}
      </label>
      <label class="inline-flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" name="enabled" checked={values.enabled} class="rounded" />
        {$_('monitoring.form.enabled')}
      </label>
    </div>
  </details>

  {#if test}
    <TestResultPanel result={test} />
  {/if}

  <div class="flex flex-wrap items-center justify-end gap-3">
    <a href={cancelHref} class="btn-ghost rounded-xl px-4 py-2.5 text-sm font-semibold"
      >{$_('common.cancel')}</a
    >
    {#if canTest}
      <button
        type="submit"
        formaction="?/test"
        class="btn-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
        disabled={intent !== null}
      >
        {#if intent === 'test'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<FlaskConical
            class="h-4 w-4"
          />{/if}
        {$_('monitoring.form.test')}
      </button>
    {/if}
    <button
      type="submit"
      class="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
      disabled={intent !== null}
    >
      {#if intent === 'save'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Save
          class="h-4 w-4"
        />{/if}
      {editing ? $_('monitoring.form.saveChanges') : $_('monitoring.form.create')}
    </button>
  </div>
</form>
