<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { ArrowLeft, FlaskConical, Info, MailWarning, Save, Trash2 } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import type {
    AlertEditorData,
    AlertFormResult,
    CatalogEntry,
    DraftCondition,
  } from '#lib/alerts/types';
  import ConditionBuilder from './ConditionBuilder.svelte';
  import OptionPicker from './OptionPicker.svelte';

  type Props = { data: AlertEditorData; form: AlertFormResult };
  let { data, form }: Props = $props();

  // the editor is keyed by alert in its page: it starts from the draft echoed by a failed save or
  // a no-JS draft action, else from the stored alert, and owns its state from then on
  const initial = untrack(() => ({
    draft: structuredClone(form?.draft ?? data.draft),
    errors: form?.errors ?? {},
    message: form?.error && !form?.errors ? form.error : '',
    test: form?.test ?? null,
  }));
  let draft = $state(initial.draft);
  let errors = $state<Record<string, string>>(initial.errors);
  let message = $state(initial.message);
  let test = $state(initial.test);
  let droppedConditions = $state(0);
  let busy = $state<'save' | 'test' | null>(null);
  let sampleProjectId = $state('');

  let definition = $derived(data.catalog.find((entry) => entry.type === draft.eventType));
  let groups = $derived(
    Object.entries(
      data.catalog.reduce<Record<string, CatalogEntry[]>>((acc, entry) => {
        (acc[entry.module] ??= []).push(entry);
        return acc;
      }, {}),
    ),
  );
  let needsSampleProject = $derived(
    data.scope === 'organization' && definition?.scope === 'project',
  );
  let projects = $derived(data.referenceOptions.project ?? []);

  function compatible(entry: CatalogEntry | undefined, condition: DraftCondition) {
    const field = entry?.fields.find((candidate) => candidate.key === condition.field);
    return Boolean(field && (!condition.operator || field.operators.includes(condition.operator)));
  }

  function changeEvent(type: string) {
    const next = data.catalog.find((entry) => entry.type === type);
    const kept = draft.conditions.filter((condition) => compatible(next, condition));
    droppedConditions = draft.conditions.length - kept.length;
    draft.eventType = type;
    draft.conditions = kept;
    test = null;
  }

  function errorFor(key: string) {
    return errors[key] ? $_(`alerts.errors.${errors[key]}`) : '';
  }

  const submit: SubmitFunction = ({ action }) => {
    const intent = action.search.includes('test') ? 'test' : 'save';
    busy = intent;
    message = '';
    return async ({ result, update }) => {
      busy = null;
      if (result.type === 'failure') {
        errors = (result.data?.errors as Record<string, string>) ?? {};
        message = result.data?.errors
          ? $_('alerts.editor.fixErrors')
          : String(result.data?.error ?? '');
        if (intent === 'test') test = null;
        return;
      }
      if (result.type === 'success') {
        errors = {};
        test = (result.data?.test as typeof test) ?? null;
        return;
      }
      await update();
    };
  };
</script>

<form method="POST" action="?/save" class="space-y-8" use:enhance={submit} novalidate>
  <input type="hidden" name="alertId" value={data.alertId ?? ''} />
  <!-- pressing Enter submits the first submit button: make it "save", not a condition button -->
  {#if data.canSave}
    <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true">
      {$_('alerts.editor.create')}
    </button>
  {/if}

  <div class="flex flex-wrap items-center justify-between gap-3">
    <a
      href={data.basePath}
      class="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
    >
      <ArrowLeft class="h-4 w-4" />
      {$_('alerts.editor.back')}
    </a>
    {#if message}
      <p
        class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        role="alert"
      >
        {message}
      </p>
    {/if}
  </div>

  {#if !data.mailConfigured}
    <p
      class="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
      role="status"
      data-testid="mail-disabled"
    >
      <MailWarning class="mt-0.5 h-4 w-4 shrink-0" />
      {$_('alerts.mailDisabled')}
    </p>
  {/if}

  <!-- step 1: event -->
  <section class="space-y-4" aria-labelledby="step-event">
    <h4 id="step-event" class="text-base font-semibold text-slate-900">
      1. {$_('alerts.editor.stepEvent')}
    </h4>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-1">
        <label for="alert-name" class="text-sm font-medium text-slate-700"
          >{$_('alerts.editor.name')}</label
        >
        <input
          id="alert-name"
          name="name"
          class="field-input rounded-md border px-3 py-2 text-sm"
          bind:value={draft.name}
          maxlength="120"
          required
          disabled={!data.canSave}
          aria-invalid={Boolean(errors.name) || undefined}
          aria-describedby={errors.name ? 'alert-name-error' : undefined}
        />
        {#if errors.name}
          <p id="alert-name-error" class="text-xs text-red-600" role="alert">{errorFor('name')}</p>
        {/if}
      </div>
      <div class="flex flex-col gap-1">
        <label for="alert-event" class="text-sm font-medium text-slate-700"
          >{$_('alerts.editor.event')}</label
        >
        <select
          id="alert-event"
          name="eventType"
          class="field-input rounded-md border px-3 py-2 text-sm"
          value={draft.eventType}
          disabled={!data.canSave}
          aria-invalid={Boolean(errors.eventType) || undefined}
          aria-describedby="alert-event-help{errors.eventType ? ' alert-event-error' : ''}"
          onchange={(event) => changeEvent(event.currentTarget.value)}
        >
          <option value="" disabled>{$_('alerts.editor.chooseEvent')}</option>
          {#each groups as [module, entries] (module)}
            <optgroup label={$_(`org.events.modules.${module}`)}>
              {#each entries as entry (entry.type)}
                <option value={entry.type}>{$_(entry.label)}</option>
              {/each}
            </optgroup>
          {/each}
        </select>
        <p id="alert-event-help" class="text-xs text-slate-500">
          {definition ? $_(definition.description) : $_('alerts.editor.eventHelp')}
        </p>
        {#if errors.eventType}
          <p id="alert-event-error" class="text-xs text-red-600" role="alert">
            {errorFor('eventType')}
          </p>
        {/if}
        <noscript>
          <button
            type="submit"
            formaction="?/draft"
            name="intent"
            value="change_event"
            class="mt-1 rounded-md border border-slate-200 px-3 py-1 text-xs"
          >
            {$_('alerts.editor.applyEvent')}
          </button>
        </noscript>
      </div>
    </div>

    <div class="flex flex-col gap-1">
      <label for="alert-description" class="text-sm font-medium text-slate-700">
        {$_('alerts.editor.description')}
      </label>
      <textarea
        id="alert-description"
        name="description"
        rows="2"
        maxlength="1000"
        class="field-input rounded-md border px-3 py-2 text-sm"
        bind:value={draft.description}
        disabled={!data.canSave}></textarea>
    </div>

    <label class="inline-flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" name="enabled" bind:checked={draft.enabled} disabled={!data.canSave} />
      {$_('alerts.editor.enabled')}
    </label>
  </section>

  <!-- step 2: conditions -->
  <section class="space-y-3" aria-labelledby="step-conditions">
    <h4 id="step-conditions" class="text-base font-semibold text-slate-900">
      2. {$_('alerts.editor.stepConditions')}
    </h4>
    {#if droppedConditions > 0}
      <p
        class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        role="status"
      >
        {$_('alerts.editor.droppedConditions', { values: { count: droppedConditions } })}
      </p>
    {/if}
    {#if definition}
      <ConditionBuilder
        {definition}
        bind:conditions={draft.conditions}
        bind:match={draft.match}
        referenceOptions={data.referenceOptions}
        {errors}
        disabled={!data.canSave}
      />
    {:else}
      <p class="text-sm text-slate-500">{$_('alerts.editor.chooseEventFirst')}</p>
      <input type="hidden" name="match" value={draft.match} />
    {/if}
  </section>

  <!-- step 3: recipients and delivery -->
  <section class="space-y-4" aria-labelledby="step-recipients">
    <h4 id="step-recipients" class="text-base font-semibold text-slate-900">
      3. {$_('alerts.editor.stepRecipients')}
    </h4>
    <p
      class="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800"
    >
      <Info class="mt-0.5 h-4 w-4 shrink-0" />
      {$_('alerts.editor.recipientsNotice')}
    </p>
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium text-slate-700" id="recipients-roles-label">
          {$_('alerts.editor.roles')}
        </span>
        <OptionPicker
          id="recipients-roles"
          name="roleIds"
          label={$_('alerts.editor.roles')}
          multiple
          options={data.roles}
          selected={draft.recipients.roleIds}
          invalid={Boolean(errors['recipients.roleIds'] || errors.recipients)}
          describedBy={errors['recipients.roleIds'] || errors.recipients
            ? 'recipients-error'
            : undefined}
          onchange={(selected) => {
            draft.recipients.roleIds = selected;
          }}
        />
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium text-slate-700">{$_('alerts.editor.users')}</span>
        <OptionPicker
          id="recipients-users"
          name="userIds"
          label={$_('alerts.editor.users')}
          multiple
          options={data.users}
          selected={draft.recipients.userIds}
          invalid={Boolean(errors['recipients.userIds'] || errors.recipients)}
          describedBy={errors['recipients.userIds'] || errors.recipients
            ? 'recipients-error'
            : undefined}
          onchange={(selected) => {
            draft.recipients.userIds = selected;
          }}
        />
      </div>
    </div>
    {#if errors.recipients || errors['recipients.userIds'] || errors['recipients.roleIds']}
      <p id="recipients-error" class="text-xs text-red-600" role="alert">
        {errorFor('recipients') || errorFor('recipients.roleIds') || errorFor('recipients.userIds')}
      </p>
    {/if}

    <fieldset class="space-y-2">
      <legend class="text-sm font-medium text-slate-700">{$_('alerts.editor.channels')}</legend>
      <label class="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked disabled />
        <input type="hidden" name="channels" value="mail" />
        {$_('alerts.channels.mail')}
      </label>
      {#each ['in_app', 'slack'] as channel (channel)}
        <label class="flex items-center gap-2 text-sm text-slate-400">
          <input type="checkbox" disabled />
          {$_(`alerts.channels.${channel}`)}
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase">
            {$_('alerts.channels.soon')}
          </span>
        </label>
      {/each}
    </fieldset>

    <div class="flex flex-col gap-1 sm:max-w-sm">
      <label for="alert-throttle" class="text-sm font-medium text-slate-700">
        {$_('alerts.editor.throttle')}
      </label>
      <input
        id="alert-throttle"
        name="throttleMinutes"
        type="number"
        min="0"
        max="1440"
        class="field-input rounded-md border px-3 py-2 text-sm"
        bind:value={draft.throttleMinutes}
        disabled={!data.canSave}
        aria-invalid={Boolean(errors.throttleMinutes) || undefined}
        aria-describedby="alert-throttle-help{errors.throttleMinutes
          ? ' alert-throttle-error'
          : ''}"
      />
      <p id="alert-throttle-help" class="text-xs text-slate-500">
        {$_('alerts.editor.throttleHelp')}
      </p>
      {#if errors.throttleMinutes}
        <p id="alert-throttle-error" class="text-xs text-red-600" role="alert">
          {errorFor('throttleMinutes')}
        </p>
      {/if}
    </div>
  </section>

  <!-- step 4: test and save -->
  <section class="space-y-4" aria-labelledby="step-save">
    <h4 id="step-save" class="text-base font-semibold text-slate-900">
      4. {$_('alerts.editor.stepSave')}
    </h4>

    {#if needsSampleProject && projects.length > 0}
      <div class="flex flex-col gap-1 sm:max-w-sm">
        <label for="alert-sample-project" class="text-sm font-medium text-slate-700">
          {$_('alerts.editor.sampleProject')}
        </label>
        <select
          id="alert-sample-project"
          name="sampleProjectId"
          class="field-input rounded-md border px-3 py-2 text-sm"
          bind:value={sampleProjectId}
        >
          <option value="">{$_('alerts.editor.sampleProjectAny')}</option>
          {#each projects as project (project.id)}
            <option value={project.id}>{project.label}</option>
          {/each}
        </select>
      </div>
    {/if}

    {#if test}
      <div
        class="rounded-xl border px-4 py-3 text-sm {test.matched
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-amber-200 bg-amber-50 text-amber-900'}"
        role="status"
        data-testid="alert-test-result"
      >
        <p class="font-medium">
          {test.matched ? $_('alerts.test.matched') : $_('alerts.test.notMatched')}
        </p>
        {#if test.recipients.length > 0}
          <p class="mt-1">
            {$_('alerts.test.recipients', {
              values: { names: test.recipients.map((recipient) => recipient.username).join(', ') },
            })}
          </p>
        {:else}
          <p class="mt-1">{$_('alerts.test.noRecipients')}</p>
        {/if}
        {#if test.deniedCount > 0}
          <p class="mt-1 text-xs">
            {$_('alerts.test.denied', { values: { count: test.deniedCount } })}
          </p>
        {/if}
        <p class="mt-1 text-xs opacity-75">{$_('alerts.test.nothingSent')}</p>
      </div>
    {/if}

    <div class="flex flex-wrap items-center gap-3">
      {#if data.canSave}
        <button
          type="submit"
          formaction="?/test"
          class="inline-flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
          disabled={busy !== null}
        >
          <FlaskConical class="h-4 w-4" />
          {$_('alerts.editor.test')}
        </button>
        <button
          type="submit"
          class="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          disabled={busy !== null}
        >
          <Save class="h-4 w-4" />
          {data.alertId ? $_('alerts.editor.saveChanges') : $_('alerts.editor.create')}
        </button>
      {/if}
      {#if data.canDelete}
        <button
          type="submit"
          formaction="?/delete"
          name="redirect"
          value="list"
          formnovalidate
          class="ml-auto inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          onclick={(event) => {
            if (!confirm($_('alerts.list.confirmDelete'))) event.preventDefault();
          }}
        >
          <Trash2 class="h-4 w-4" />
          {$_('alerts.list.delete')}
        </button>
      {/if}
    </div>
  </section>
</form>
