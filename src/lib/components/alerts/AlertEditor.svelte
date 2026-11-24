<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import {
    ArrowLeft,
    FlaskConical,
    Info,
    LoaderCircle,
    MailWarning,
    Save,
    Trash2,
  } from '@lucide/svelte';
  import { Modal } from '#lib/components/ui';
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
  let deleteOpen = $state(false);

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

<form
  id="alert-editor-form"
  method="POST"
  action="?/save"
  class="space-y-6"
  use:enhance={submit}
  novalidate
>
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
      class="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-white"
    >
      <ArrowLeft class="h-4 w-4" />
      {$_('alerts.editor.back')}
    </a>
    {#if message}
      <p
        class="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-red-200"
        role="alert"
      >
        {message}
      </p>
    {/if}
  </div>

  {#if !data.mailConfigured}
    <p
      class="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/8 px-4 py-3 text-sm text-amber-100"
      role="status"
      data-testid="mail-disabled"
    >
      <MailWarning class="mt-0.5 h-4 w-4 shrink-0 text-warn" />
      {$_('alerts.mailDisabled')}
    </p>
  {/if}

  <!-- step 1: event -->
  <section class="k-card space-y-5 p-5 sm:p-6" aria-labelledby="step-event">
    <h2 id="step-event" class="flex items-center gap-2.5 text-sm font-semibold text-white">
      <span
        class="grid h-6 w-6 place-items-center rounded-full bg-brand-500/15 text-xs text-brand-300"
        >1</span
      >
      {$_('alerts.editor.stepEvent')}
    </h2>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-1">
        <label for="alert-name" class="k-label mb-0">{$_('alerts.editor.name')}</label>
        <input
          id="alert-name"
          name="name"
          class="k-input"
          bind:value={draft.name}
          maxlength="120"
          required
          disabled={!data.canSave}
          aria-invalid={Boolean(errors.name) || undefined}
          aria-describedby={errors.name ? 'alert-name-error' : undefined}
        />
        {#if errors.name}
          <p id="alert-name-error" class="text-xs text-red-300" role="alert">{errorFor('name')}</p>
        {/if}
      </div>
      <div class="flex flex-col gap-1">
        <label for="alert-event" class="k-label mb-0">{$_('alerts.editor.event')}</label>
        <select
          id="alert-event"
          name="eventType"
          class="k-input"
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
        <p id="alert-event-help" class="text-xs text-fg-subtle">
          {definition ? $_(definition.description) : $_('alerts.editor.eventHelp')}
        </p>
        {#if errors.eventType}
          <p id="alert-event-error" class="text-xs text-red-300" role="alert">
            {errorFor('eventType')}
          </p>
        {/if}
        <noscript>
          <button
            type="submit"
            formaction="?/draft"
            name="intent"
            value="change_event"
            class="k-btn k-btn-secondary k-btn-sm mt-1"
          >
            {$_('alerts.editor.applyEvent')}
          </button>
        </noscript>
      </div>
    </div>

    <div class="flex flex-col gap-1">
      <label for="alert-description" class="k-label mb-0">
        {$_('alerts.editor.description')}
      </label>
      <textarea
        id="alert-description"
        name="description"
        rows="2"
        maxlength="1000"
        class="k-input"
        bind:value={draft.description}
        disabled={!data.canSave}></textarea>
    </div>

    <label class="inline-flex items-center gap-2 text-sm text-fg">
      <input
        type="checkbox"
        name="enabled"
        class="k-checkbox"
        bind:checked={draft.enabled}
        disabled={!data.canSave}
      />
      {$_('alerts.editor.enabled')}
    </label>
  </section>

  <!-- step 2: conditions -->
  <section class="k-card space-y-4 p-5 sm:p-6" aria-labelledby="step-conditions">
    <h2 id="step-conditions" class="flex items-center gap-2.5 text-sm font-semibold text-white">
      <span
        class="grid h-6 w-6 place-items-center rounded-full bg-brand-500/15 text-xs text-brand-300"
        >2</span
      >
      {$_('alerts.editor.stepConditions')}
    </h2>
    {#if droppedConditions > 0}
      <p
        class="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-xs text-amber-100"
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
      <p class="text-sm text-fg-subtle">{$_('alerts.editor.chooseEventFirst')}</p>
      <input type="hidden" name="match" value={draft.match} />
    {/if}
  </section>

  <!-- step 3: recipients and delivery -->
  <section class="k-card space-y-5 p-5 sm:p-6" aria-labelledby="step-recipients">
    <h2 id="step-recipients" class="flex items-center gap-2.5 text-sm font-semibold text-white">
      <span
        class="grid h-6 w-6 place-items-center rounded-full bg-brand-500/15 text-xs text-brand-300"
        >3</span
      >
      {$_('alerts.editor.stepRecipients')}
    </h2>
    <p
      class="flex items-start gap-2 rounded-lg border border-info/25 bg-info/8 px-3 py-2 text-xs text-blue-100"
    >
      <Info class="mt-0.5 h-4 w-4 shrink-0 text-info" />
      {$_('alerts.editor.recipientsNotice')}
    </p>
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-1">
        <span class="k-label mb-0" id="recipients-roles-label">
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
        <span class="k-label mb-0">{$_('alerts.editor.users')}</span>
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
      <p id="recipients-error" class="text-xs text-red-300" role="alert">
        {errorFor('recipients') || errorFor('recipients.roleIds') || errorFor('recipients.userIds')}
      </p>
    {/if}

    <!-- canales y destinos sin JavaScript: listas separadas por comas (el asistente usa etiquetas) -->
    <div class="flex flex-col gap-1">
      <label for="alert-emails" class="k-label mb-0">{$_('alerts.editor.externalEmails')}</label>
      <input
        id="alert-emails"
        name="emails"
        class="k-input"
        value={draft.recipients.emails.join(', ')}
        placeholder="ops@example.com, oncall@example.com"
        disabled={!data.canSave}
        aria-invalid={Boolean(errors['recipients.emails']) || undefined}
      />
      {#if errors['recipients.emails']}
        <p class="text-xs text-red-300" role="alert">{errorFor('recipients.emails')}</p>
      {/if}
    </div>

    <fieldset class="space-y-3">
      <legend class="k-label mb-0">{$_('alerts.editor.channels')}</legend>
      {#each [{ key: 'mail', list: null }, { key: 'slack', list: 'slackChannels' }, { key: 'google_chat', list: 'googleChatSpaces' }, { key: 'webhook', list: 'webhookUrls' }] as const as channel (channel.key)}
        <div class="space-y-1.5">
          <label class="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              class="k-checkbox"
              name="channels"
              value={channel.key}
              bind:group={draft.channels}
              disabled={!data.canSave}
            />
            {$_(`alerts.channels.${channel.key}`)}
          </label>
          {#if channel.list}
            <input
              name={channel.list}
              class="k-input"
              aria-label={$_(`alerts.editor.targets.${channel.key}`)}
              placeholder={$_(`alerts.editor.targets.${channel.key}`)}
              value={draft.recipients[channel.list].join(', ')}
              disabled={!data.canSave}
              aria-invalid={Boolean(errors[`recipients.${channel.list}`]) || undefined}
            />
            {#if errors[`recipients.${channel.list}`]}
              <p class="text-xs text-red-300" role="alert">
                {errorFor(`recipients.${channel.list}`)}
              </p>
            {/if}
          {/if}
        </div>
      {/each}
      {#if errors.channels}
        <p class="text-xs text-red-300" role="alert">{errorFor('channels')}</p>
      {/if}
    </fieldset>

    <div class="flex flex-col gap-1 sm:max-w-sm">
      <label for="alert-throttle" class="k-label mb-0">
        {$_('alerts.editor.throttle')}
      </label>
      <input
        id="alert-throttle"
        name="throttleMinutes"
        type="number"
        min="0"
        max="1440"
        class="k-input"
        bind:value={draft.throttleMinutes}
        disabled={!data.canSave}
        aria-invalid={Boolean(errors.throttleMinutes) || undefined}
        aria-describedby="alert-throttle-help{errors.throttleMinutes
          ? ' alert-throttle-error'
          : ''}"
      />
      <p id="alert-throttle-help" class="text-xs text-fg-subtle">
        {$_('alerts.editor.throttleHelp')}
      </p>
      {#if errors.throttleMinutes}
        <p id="alert-throttle-error" class="text-xs text-red-300" role="alert">
          {errorFor('throttleMinutes')}
        </p>
      {/if}
    </div>
  </section>

  <!-- step 4: test and save -->
  <section class="k-card space-y-4 p-5 sm:p-6" aria-labelledby="step-save">
    <h2 id="step-save" class="flex items-center gap-2.5 text-sm font-semibold text-white">
      <span
        class="grid h-6 w-6 place-items-center rounded-full bg-brand-500/15 text-xs text-brand-300"
        >4</span
      >
      {$_('alerts.editor.stepSave')}
    </h2>

    {#if needsSampleProject && projects.length > 0}
      <div class="flex flex-col gap-1 sm:max-w-sm">
        <label for="alert-sample-project" class="k-label mb-0">
          {$_('alerts.editor.sampleProject')}
        </label>
        <select
          id="alert-sample-project"
          name="sampleProjectId"
          class="k-input"
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
          ? 'border-ok/30 bg-ok/8 text-green-100'
          : 'border-warn/30 bg-warn/8 text-amber-100'}"
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
          class="k-btn k-btn-secondary"
          disabled={busy !== null}
        >
          {#if busy === 'test'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<FlaskConical
              class="h-4 w-4"
            />{/if}
          {$_('alerts.editor.test')}
        </button>
        <button type="submit" class="k-btn k-btn-primary" disabled={busy !== null}>
          {#if busy === 'save'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Save
              class="h-4 w-4"
            />{/if}
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
          class="k-btn k-btn-ghost ml-auto hover:text-red-400"
          onclick={(event) => {
            // sin JavaScript borra directamente; con JavaScript pide confirmación
            event.preventDefault();
            deleteOpen = true;
          }}
        >
          <Trash2 class="h-4 w-4" />
          {$_('alerts.list.delete')}
        </button>
      {/if}
    </div>
  </section>
</form>

{#if data.canDelete}
  <Modal
    bind:open={deleteOpen}
    role="alertdialog"
    size="sm"
    title={$_('alerts.list.deleteTitle')}
    description={$_('alerts.list.confirmDelete')}
  >
    {#snippet icon()}
      <span
        class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-400"
        ><Trash2 class="h-5 w-5" /></span
      >
    {/snippet}
    {#snippet footer()}
      <button type="button" class="k-btn k-btn-secondary" onclick={() => (deleteOpen = false)}
        >{$_('common.cancel')}</button
      >
      <button
        type="submit"
        form="alert-editor-form"
        formaction="?/delete"
        name="redirect"
        value="list"
        formnovalidate
        class="k-btn k-btn-danger"
        data-autofocus
      >
        {$_('alerts.list.delete')}
      </button>
    {/snippet}
  </Modal>
{/if}
