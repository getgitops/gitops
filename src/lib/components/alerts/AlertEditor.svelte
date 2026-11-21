<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import {
    ArrowLeft,
    BellRing,
    CircleAlert,
    CircleCheck,
    FlaskConical,
    Mail,
    MailWarning,
    MessageSquare,
    ShieldCheck,
    Hash,
    Trash2,
  } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import { summarizeConditions, summarizeRecipients } from '#lib/alerts/summary';
  import type {
    AlertEditorData,
    AlertFormResult,
    CatalogEntry,
    DraftCondition,
  } from '#lib/alerts/types';
  import ConditionBuilder from './ConditionBuilder.svelte';
  import EventPicker from './EventPicker.svelte';
  import OptionPicker from './OptionPicker.svelte';

  type Props = { data: AlertEditorData; form: AlertFormResult };
  let { data, form }: Props = $props();

  // the editor is keyed by alert in its page: it starts from the draft echoed by a failed save or
  // a no-JS draft action, else from the stored alert, and owns its state from then on
  const initial = untrack(() => ({
    draft: structuredClone(form?.draft ?? data.draft),
    errors: form?.errors ?? {},
    message: form?.error && !form?.errors ? form.error : form?.errors ? 'fix' : '',
    test: form?.test ?? null,
  }));
  let draft = $state(initial.draft);
  let errors = $state<Record<string, string>>(initial.errors);
  let message = $state(initial.message === 'fix' ? $_('alerts.editor.fixErrors') : initial.message);
  let test = $state(initial.test);
  let droppedConditions = $state(0);
  let busy = $state<'save' | 'test' | null>(null);
  let sampleProjectId = $state('');

  /** Quick picks for the throttle; any other value can still be typed */
  const THROTTLE_PRESETS = [0, 15, 60, 1440];

  let definition = $derived(data.catalog.find((entry) => entry.type === draft.eventType));
  let needsSampleProject = $derived(
    data.scope === 'organization' && definition?.scope === 'project',
  );
  let projects = $derived(data.referenceOptions.project ?? []);
  let recipientCount = $derived(draft.recipients.roleIds.length + draft.recipients.userIds.length);
  let recipientsError = $derived(
    errors.recipients || errors['recipients.userIds'] || errors['recipients.roleIds'],
  );

  const t = (key: string, options?: { values?: Record<string, unknown> }) => $_(key, options);

  let summaryConditions = $derived(
    summarizeConditions(definition, draft.conditions, draft.match, data.referenceOptions, t),
  );
  let summaryRecipients = $derived(
    summarizeRecipients(draft.recipients, data.users, data.roles, t),
  );

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

  function throttleLabel(minutes: number) {
    if (minutes === 0) return $_('alerts.editor.throttleNone');
    if (minutes === 1440) return $_('alerts.editor.throttleDay');
    if (minutes % 1440 === 0)
      return $_('alerts.editor.throttleDays', { values: { count: minutes / 1440 } });
    if (minutes === 60) return $_('alerts.editor.throttleHour');
    if (minutes % 60 === 0)
      return $_('alerts.editor.throttleHours', { values: { count: minutes / 60 } });
    return $_('alerts.editor.throttleMinutes', { values: { count: minutes } });
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

<form method="POST" action="?/save" class="editor" use:enhance={submit} novalidate>
  <input type="hidden" name="alertId" value={data.alertId ?? ''} />
  <!-- pressing Enter submits the first submit button: make it "save", not a condition button -->
  {#if data.canSave}
    <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true">
      {$_('alerts.editor.create')}
    </button>
  {/if}

  <!-- Header: back link, then the name as the page title (like an issue title) -->
  <header class="editor-head">
    <a href={data.basePath} class="back">
      <ArrowLeft class="h-3.5 w-3.5" />
      {$_('alerts.editor.back')}
    </a>
    <p class="eyebrow">
      <BellRing class="h-3.5 w-3.5" />
      {data.alertId ? $_('alerts.editor.editTitle') : $_('alerts.editor.newTitle')}
    </p>
    <label for="alert-name" class="sr-only">{$_('alerts.editor.name')}</label>
    <input
      id="alert-name"
      name="name"
      class="title-input"
      bind:value={draft.name}
      maxlength="120"
      required
      placeholder={$_('alerts.editor.namePlaceholder')}
      disabled={!data.canSave}
      aria-invalid={Boolean(errors.name) || undefined}
      aria-describedby={errors.name ? 'alert-name-error' : undefined}
    />
    {#if errors.name}
      <p id="alert-name-error" class="field-error" role="alert">{errorFor('name')}</p>
    {/if}
    <label for="alert-description" class="sr-only">{$_('alerts.editor.description')}</label>
    <textarea
      id="alert-description"
      name="description"
      rows="1"
      maxlength="1000"
      class="description-input"
      placeholder={$_('alerts.editor.descriptionPlaceholder')}
      bind:value={draft.description}
      disabled={!data.canSave}
      oninput={(event) => {
        event.currentTarget.style.height = 'auto';
        event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
      }}></textarea>
  </header>

  <div class="layout">
    <div class="steps">
      <!-- 1. What to watch -->
      <section class="step" aria-labelledby="step-event">
        <div class="step-head">
          <span class="step-number" class:done={Boolean(definition)}>
            {#if definition}<CircleCheck class="h-4 w-4" />{:else}1{/if}
          </span>
          <div>
            <h2 id="step-event">{$_('alerts.editor.stepEvent')}</h2>
            <p id="alert-event-help">{$_('alerts.editor.stepEventHint')}</p>
          </div>
        </div>
        <EventPicker
          catalog={data.catalog}
          value={draft.eventType}
          disabled={!data.canSave}
          invalid={Boolean(errors.eventType)}
          describedBy="alert-event-help{errors.eventType ? ' alert-event-error' : ''}"
          onchange={changeEvent}
        />
        {#if errors.eventType}
          <p id="alert-event-error" class="field-error" role="alert">{errorFor('eventType')}</p>
        {/if}
        <noscript>
          <button
            type="submit"
            formaction="?/draft"
            name="intent"
            value="change_event"
            class="ghost-button mt-3"
          >
            {$_('alerts.editor.applyEvent')}
          </button>
        </noscript>
      </section>

      <!-- 2. When to fire -->
      <section class="step" class:locked={!definition} aria-labelledby="step-conditions">
        <div class="step-head">
          <span class="step-number">2</span>
          <div>
            <h2 id="step-conditions">{$_('alerts.editor.stepConditions')}</h2>
            <p>
              {definition
                ? $_('alerts.editor.stepConditionsHint', {
                    values: { event: $_(definition.label) },
                  })
                : $_('alerts.editor.chooseEventFirst')}
            </p>
          </div>
        </div>
        {#if droppedConditions > 0}
          <p class="notice warning" role="status">
            <CircleAlert class="h-4 w-4 shrink-0" />
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
          <input type="hidden" name="match" value={draft.match} />
        {/if}
      </section>

      <!-- 3. Who and how -->
      <section class="step" aria-labelledby="step-recipients">
        <div class="step-head">
          <span class="step-number" class:done={recipientCount > 0}>
            {#if recipientCount > 0}<CircleCheck class="h-4 w-4" />{:else}3{/if}
          </span>
          <div>
            <h2 id="step-recipients">{$_('alerts.editor.stepRecipients')}</h2>
            <p>{$_('alerts.editor.recipientsNotice')}</p>
          </div>
        </div>

        <div class="pickers">
          <OptionPicker
            id="recipients-roles"
            name="roleIds"
            label={$_('alerts.editor.roles')}
            multiple
            showHeader
            options={data.roles}
            selected={draft.recipients.roleIds}
            invalid={Boolean(errors['recipients.roleIds'] || errors.recipients)}
            describedBy={recipientsError ? 'recipients-error' : undefined}
            onchange={(selected) => {
              draft.recipients.roleIds = selected;
            }}
          />
          <OptionPicker
            id="recipients-users"
            name="userIds"
            label={$_('alerts.editor.users')}
            multiple
            showHeader
            avatars
            options={data.users}
            selected={draft.recipients.userIds}
            invalid={Boolean(errors['recipients.userIds'] || errors.recipients)}
            describedBy={recipientsError ? 'recipients-error' : undefined}
            onchange={(selected) => {
              draft.recipients.userIds = selected;
            }}
          />
        </div>
        {#if recipientsError}
          <p id="recipients-error" class="field-error" role="alert">
            {errorFor('recipients') ||
              errorFor('recipients.roleIds') ||
              errorFor('recipients.userIds')}
          </p>
        {/if}

        <div class="subsection">
          <p class="subsection-title">{$_('alerts.editor.channels')}</p>
          <div class="channels">
            <div class="channel active">
              <input type="hidden" name="channels" value="mail" />
              <Mail class="h-4 w-4" />
              <span>{$_('alerts.channels.mail')}</span>
              <CircleCheck class="ml-auto h-4 w-4 text-[#f95d11]" />
            </div>
            <div class="channel soon" aria-disabled="true">
              <MessageSquare class="h-4 w-4" />
              <span>{$_('alerts.channels.in_app')}</span>
              <span class="soon-tag">{$_('alerts.channels.soon')}</span>
            </div>
            <div class="channel soon" aria-disabled="true">
              <Hash class="h-4 w-4" />
              <span>{$_('alerts.channels.slack')}</span>
              <span class="soon-tag">{$_('alerts.channels.soon')}</span>
            </div>
          </div>
        </div>

        <div class="subsection">
          <label for="alert-throttle" class="subsection-title">{$_('alerts.editor.throttle')}</label
          >
          <div class="throttle">
            <div class="presets" role="group" aria-label={$_('alerts.editor.throttlePresets')}>
              {#each THROTTLE_PRESETS as minutes (minutes)}
                <button
                  type="button"
                  class:active={Number(draft.throttleMinutes) === minutes}
                  disabled={!data.canSave}
                  onclick={() => (draft.throttleMinutes = minutes)}
                >
                  {throttleLabel(minutes)}
                </button>
              {/each}
            </div>
            <div class="minutes">
              <input
                id="alert-throttle"
                name="throttleMinutes"
                type="number"
                min="0"
                max="1440"
                class="control"
                bind:value={draft.throttleMinutes}
                disabled={!data.canSave}
                aria-invalid={Boolean(errors.throttleMinutes) || undefined}
                aria-describedby="alert-throttle-help{errors.throttleMinutes
                  ? ' alert-throttle-error'
                  : ''}"
              />
              <span>min</span>
            </div>
          </div>
          <p id="alert-throttle-help" class="help">{$_('alerts.editor.throttleHelp')}</p>
          {#if errors.throttleMinutes}
            <p id="alert-throttle-error" class="field-error" role="alert">
              {errorFor('throttleMinutes')}
            </p>
          {/if}
        </div>
      </section>
    </div>

    <!-- Sticky summary: what the alert will do, test and save -->
    <div class="panel">
      <div class="panel-card">
        <label class="status" class:on={draft.enabled}>
          <span>
            <span class="status-title">{$_('alerts.editor.enabled')}</span>
            <span class="status-hint">
              {draft.enabled ? $_('alerts.editor.enabledOn') : $_('alerts.editor.enabledOff')}
            </span>
          </span>
          <input
            type="checkbox"
            name="enabled"
            bind:checked={draft.enabled}
            disabled={!data.canSave}
          />
          <span class="switch" aria-hidden="true"></span>
        </label>

        <div class="summary">
          <p class="panel-title">{$_('alerts.editor.summaryTitle')}</p>
          {#if definition}
            <ol class="timeline">
              <li>
                <span class="dot"></span>
                <span class="label">{$_('alerts.editor.summaryWhen')}</span>
                <strong>{$_(definition.label)}</strong>
              </li>
              <li>
                <span class="dot"></span>
                <span class="label">{$_('alerts.editor.summaryIf')}</span>
                <strong class:muted={draft.conditions.length === 0}>{summaryConditions}</strong>
              </li>
              <li>
                <span class="dot"></span>
                <span class="label">{$_('alerts.editor.summaryNotify')}</span>
                <strong class:muted={recipientCount === 0}>{summaryRecipients}</strong>
              </li>
              <li>
                <span class="dot"></span>
                <span class="label">{$_('alerts.editor.summaryLimit')}</span>
                <strong>{throttleLabel(Number(draft.throttleMinutes) || 0)}</strong>
              </li>
            </ol>
          {:else}
            <p class="summary-empty">{$_('alerts.editor.summaryNoEvent')}</p>
          {/if}
        </div>

        {#if !data.mailConfigured}
          <p class="notice warning" role="status" data-testid="mail-disabled">
            <MailWarning class="h-4 w-4 shrink-0" />
            {$_('alerts.mailDisabled')}
          </p>
        {/if}

        {#if message}
          <p class="notice error" role="alert">
            <CircleAlert class="h-4 w-4 shrink-0" />
            {message}
          </p>
        {/if}

        {#if data.canSave}
          <div class="test-box">
            {#if needsSampleProject && projects.length > 0}
              <label for="alert-sample-project" class="test-label">
                {$_('alerts.editor.sampleProject')}
              </label>
              <select
                id="alert-sample-project"
                name="sampleProjectId"
                class="control select"
                bind:value={sampleProjectId}
              >
                <option value="">{$_('alerts.editor.sampleProjectAny')}</option>
                {#each projects as project (project.id)}
                  <option value={project.id}>{project.label}</option>
                {/each}
              </select>
            {/if}
            <button
              type="submit"
              formaction="?/test"
              class="ghost-button w-full"
              disabled={busy !== null || !definition}
            >
              <FlaskConical class="h-4 w-4 {busy === 'test' ? 'animate-pulse' : ''}" />
              {$_('alerts.editor.test')}
            </button>
            <p class="help">{$_('alerts.editor.testHint')}</p>

            {#if test}
              <div
                class="test-result"
                class:matched={test.matched}
                role="status"
                data-testid="alert-test-result"
              >
                <p class="test-title">
                  {#if test.matched}<CircleCheck class="h-4 w-4" />{:else}<CircleAlert
                      class="h-4 w-4"
                    />{/if}
                  {test.matched ? $_('alerts.test.matched') : $_('alerts.test.notMatched')}
                </p>
                {#if test.recipients.length > 0}
                  <p>
                    {$_('alerts.test.recipients', {
                      values: {
                        names: test.recipients.map((recipient) => recipient.username).join(', '),
                      },
                    })}
                  </p>
                {:else}
                  <p>{$_('alerts.test.noRecipients')}</p>
                {/if}
                {#if test.deniedCount > 0}
                  <p class="flex items-start gap-1.5">
                    <ShieldCheck class="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {$_('alerts.test.denied', { values: { count: test.deniedCount } })}
                  </p>
                {/if}
                <p class="opacity-70">{$_('alerts.test.nothingSent')}</p>
              </div>
            {/if}
          </div>

          <div class="actions">
            <button type="submit" class="primary-button" disabled={busy !== null}>
              {busy === 'save'
                ? $_('alerts.editor.saving')
                : data.alertId
                  ? $_('alerts.editor.saveChanges')
                  : $_('alerts.editor.create')}
            </button>
            <a href={data.basePath} class="cancel">{$_('alerts.editor.cancel')}</a>
          </div>
        {/if}
      </div>

      {#if data.canDelete}
        <button
          type="submit"
          formaction="?/delete"
          name="redirect"
          value="list"
          formnovalidate
          class="delete"
          onclick={(event) => {
            if (!confirm($_('alerts.list.confirmDelete'))) event.preventDefault();
          }}
        >
          <Trash2 class="h-3.5 w-3.5" />
          {$_('alerts.editor.deleteAlert')}
        </button>
      {/if}
    </div>
  </div>
</form>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  /* Header */
  .editor-head {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-bottom: 18px;
    border-bottom: 1px solid rgb(255 255 255 / 0.06);
  }

  .back {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 6px;
    margin-bottom: 8px;
    color: #77737a;
    font-size: 12.5px;
    transition: color 120ms ease;
  }

  .back:hover {
    color: #ded9df;
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #ff8a4c;
    font-size: 12px;
    font-weight: 540;
  }

  .title-input {
    width: 100%;
    padding: 2px 0;
    border: 0;
    background: transparent;
    color: #ece8ee;
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.3px;
    outline: none;
  }

  .title-input::placeholder {
    color: #4f4b53;
  }

  .title-input[aria-invalid='true'] {
    text-decoration: underline wavy rgb(248 113 113 / 0.6);
    text-underline-offset: 6px;
  }

  .description-input {
    width: 100%;
    min-height: 24px;
    padding: 0;
    overflow: hidden;
    border: 0;
    background: transparent;
    color: #a9a4ac;
    font-size: 14px;
    line-height: 1.55;
    outline: none;
    resize: none;
  }

  .description-input::placeholder {
    color: #57535b;
  }

  /* Two columns */
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    align-items: start;
    gap: 20px;
  }

  @media (max-width: 1100px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .steps {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 14px;
  }

  .step {
    padding: 18px;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 12px;
    background: linear-gradient(180deg, rgb(255 255 255 / 0.03), rgb(255 255 255 / 0.012));
  }

  .step.locked {
    opacity: 0.55;
  }

  .step-head {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 16px;
  }

  .step-number {
    display: grid;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    place-items: center;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 999px;
    color: #a9a4ac;
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .step-number.done {
    border-color: transparent;
    color: #6ee7a0;
  }

  .step-head h2 {
    color: #ece8ee;
    font-size: 15px;
    font-weight: 560;
    line-height: 24px;
  }

  .step-head p {
    margin-top: 1px;
    color: #8a858d;
    font-size: 13px;
    line-height: 1.5;
  }

  .pickers {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 10px;
  }

  @media (max-width: 640px) {
    .pickers {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .subsection {
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid rgb(255 255 255 / 0.06);
  }

  .subsection-title {
    display: block;
    margin-bottom: 8px;
    color: #ded9df;
    font-size: 13px;
    font-weight: 540;
  }

  .channels {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  @media (max-width: 640px) {
    .channels {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .channel {
    display: flex;
    min-width: 0;
    height: 40px;
    white-space: nowrap;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 9px;
    color: #8a858d;
    font-size: 13px;
  }

  .channel.active {
    border-color: rgb(249 93 17 / 0.4);
    background: rgb(249 93 17 / 0.06);
    color: #ece8ee;
  }

  .channel.soon {
    opacity: 0.6;
  }

  .channel > span:not(.soon-tag) {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .soon-tag {
    margin-left: auto;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.06);
    color: #8a858d;
    font-size: 10.5px;
  }

  .throttle {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .presets {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 9px;
    background: rgb(255 255 255 / 0.02);
  }

  .presets button {
    height: 28px;
    padding: 0 10px;
    border-radius: 6px;
    color: #9d98a0;
    font-size: 12.5px;
    transition: all 120ms ease;
  }

  .presets button:hover:not(:disabled) {
    color: #ece8ee;
  }

  .presets button.active {
    background: rgb(255 255 255 / 0.09);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
    color: #ece8ee;
  }

  .minutes {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #77737a;
    font-size: 12.5px;
  }

  .minutes .control {
    width: 90px;
  }

  .control {
    height: 36px;
    padding: 0 10px;
    border: 1px solid rgb(255 255 255 / 0.09);
    border-radius: 8px;
    background: rgb(255 255 255 / 0.025);
    color: #ece8ee;
    font-size: 13px;
    outline: none;
  }

  .control:focus {
    border-color: rgb(249 93 17 / 0.42);
    box-shadow: 0 0 0 3px rgb(249 93 17 / 0.1);
  }

  .control[aria-invalid='true'] {
    border-color: rgb(248 113 113 / 0.5);
  }

  .select {
    width: 100%;
    padding-right: 28px;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a858d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-position: right 10px center;
    background-repeat: no-repeat;
  }

  .select option {
    background: #1b1b1f;
  }

  .help {
    margin-top: 8px;
    color: #6d6870;
    font-size: 12px;
    line-height: 1.5;
  }

  .field-error {
    margin-top: 6px;
    color: #f87171;
    font-size: 12px;
  }

  .notice {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 12px;
    padding: 10px 12px;
    border: 1px solid;
    border-radius: 9px;
    font-size: 12.5px;
    line-height: 1.45;
  }

  .notice :global(svg) {
    margin-top: 1px;
  }

  .notice.warning {
    border-color: rgb(251 191 36 / 0.22);
    background: rgb(251 191 36 / 0.06);
    color: #f6c860;
  }

  .notice.error {
    border-color: rgb(248 113 113 / 0.25);
    background: rgb(248 113 113 / 0.07);
    color: #fca5a5;
  }

  /* Side panel */
  .panel {
    position: sticky;
    top: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .panel-card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 12px;
    background: rgb(255 255 255 / 0.03);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04);
  }

  .panel-card > .notice {
    margin-bottom: 0;
  }

  .status {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 14px;
    border-bottom: 1px solid rgb(255 255 255 / 0.06);
    cursor: pointer;
  }

  .status-title {
    display: block;
    color: #ece8ee;
    font-size: 13.5px;
    font-weight: 540;
  }

  .status-hint {
    display: block;
    margin-top: 1px;
    color: #77737a;
    font-size: 12px;
  }

  .status input {
    position: absolute;
    z-index: 1;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .switch {
    position: relative;
    width: 34px;
    height: 20px;
    flex-shrink: 0;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.14);
    transition: background 140ms ease;
  }

  .switch::after {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.4);
    content: '';
    transition: transform 140ms ease;
  }

  .status.on .switch {
    background: #f95d11;
  }

  .status.on .switch::after {
    transform: translateX(14px);
  }

  .status:has(input:focus-visible) .switch {
    outline: 2px solid rgb(249 93 17 / 0.5);
    outline-offset: 2px;
  }

  .panel-title {
    margin-bottom: 10px;
    color: #77737a;
    font-size: 11.5px;
    font-weight: 560;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .timeline {
    display: flex;
    flex-direction: column;
  }

  .timeline li {
    position: relative;
    padding: 0 0 12px 18px;
    font-size: 12.5px;
    line-height: 1.45;
  }

  .timeline li:last-child {
    padding-bottom: 0;
  }

  .timeline li:not(:last-child)::before {
    position: absolute;
    top: 12px;
    bottom: -2px;
    left: 3px;
    width: 1px;
    background: rgb(255 255 255 / 0.08);
    content: '';
  }

  .dot {
    position: absolute;
    top: 5px;
    left: 0;
    width: 7px;
    height: 7px;
    border: 1px solid #f95d11;
    border-radius: 999px;
    background: rgb(249 93 17 / 0.25);
  }

  .timeline .label {
    display: block;
    color: #77737a;
  }

  .timeline strong {
    display: block;
    color: #ded9df;
    font-weight: 520;
    overflow-wrap: anywhere;
  }

  .timeline strong.muted {
    color: #8a858d;
    font-weight: 400;
  }

  .summary-empty {
    color: #77737a;
    font-size: 12.5px;
    line-height: 1.5;
  }

  .test-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 14px;
    border-top: 1px solid rgb(255 255 255 / 0.06);
  }

  .test-box .help {
    margin-top: 0;
  }

  .test-label {
    color: #8a858d;
    font-size: 12px;
  }

  .test-result {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border: 1px solid rgb(251 191 36 / 0.22);
    border-radius: 9px;
    background: rgb(251 191 36 / 0.06);
    color: #f6d08a;
    font-size: 12.5px;
    line-height: 1.45;
  }

  .test-result.matched {
    border-color: rgb(74 222 128 / 0.22);
    background: rgb(74 222 128 / 0.06);
    color: #a7f3c4;
  }

  .test-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 560;
  }

  .ghost-button {
    display: inline-flex;
    height: 36px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 12px;
    border: 1px solid rgb(255 255 255 / 0.1);
    border-radius: 8px;
    background: rgb(255 255 255 / 0.04);
    color: #ded9df;
    font-size: 13px;
    transition: all 120ms ease;
  }

  .ghost-button:hover:not(:disabled) {
    border-color: rgb(255 255 255 / 0.16);
    background: rgb(255 255 255 / 0.07);
  }

  .ghost-button:disabled {
    opacity: 0.45;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .primary-button {
    display: inline-flex;
    height: 38px;
    flex: 1;
    align-items: center;
    justify-content: center;
    border: 1px solid #f95d11;
    border-radius: 8px;
    background: linear-gradient(180deg, #ff7430, #e74d08);
    box-shadow: 0 6px 18px rgb(249 93 17 / 0.18);
    color: #fff;
    font-size: 13.5px;
    font-weight: 560;
    transition: filter 120ms ease;
  }

  .primary-button:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .primary-button:disabled {
    opacity: 0.6;
  }

  .cancel {
    padding: 0 6px;
    color: #8a858d;
    font-size: 13px;
  }

  .cancel:hover {
    color: #ded9df;
  }

  .delete {
    display: inline-flex;
    align-items: center;
    align-self: center;
    gap: 6px;
    height: 32px;
    padding: 0 10px;
    border-radius: 7px;
    color: #8a858d;
    font-size: 12.5px;
    transition: all 120ms ease;
  }

  .delete:hover {
    background: rgb(248 113 113 / 0.08);
    color: #f87171;
  }

  /* app.css paints every input, select and textarea navy with !important: these win on specificity */
  .editor .title-input,
  .editor .description-input {
    border: 0 !important;
    background-color: transparent !important;
  }

  .editor .title-input {
    color: #ece8ee !important;
  }

  .editor .description-input {
    color: #a9a4ac !important;
  }

  .editor .title-input::placeholder {
    color: #4f4b53 !important;
  }

  .editor .description-input::placeholder {
    color: #57535b !important;
  }

  .editor .control {
    border-color: rgb(255 255 255 / 0.09) !important;
    background-color: rgb(255 255 255 / 0.025) !important;
    color: #ece8ee !important;
  }

  .editor .control:focus {
    border-color: rgb(249 93 17 / 0.42) !important;
  }

  .editor .control[aria-invalid='true'] {
    border-color: rgb(248 113 113 / 0.5) !important;
  }
</style>
