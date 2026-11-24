<!--
  Crear o editar una alerta en un modal, en cuatro pasos: evento → condiciones → destinos →
  revisar. Envía a las mismas acciones que el editor de página (`?/save`, `?/test` de la lista),
  así que la validación y los permisos son los del servidor.
-->
<script lang="ts">
  import { deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import {
    Activity,
    AtSign,
    Bell,
    Check,
    ChevronLeft,
    ChevronRight,
    FlaskConical,
    Hash,
    Info,
    LoaderCircle,
    Mail,
    MailWarning,
    MessageSquare,
    Save,
    Search,
    User,
    Users,
    Webhook,
  } from '@lucide/svelte';
  import {
    Field,
    Modal,
    Switch,
    TagInput,
    toast,
    type TagSuggestion,
    type TagView,
  } from '#lib/components/ui';
  import { _ } from '#lib/i18n';
  import { channelTargets, summarizeConditions } from '#lib/alerts/summary';
  import { draftFromAlert, draftToFormData, emptyDraft } from '#lib/alerts/draft';
  import type {
    AlertChannel,
    AlertDraft,
    AlertOption,
    AlertRow,
    AlertScope,
    AlertTestView,
    CatalogEntry,
    DraftCondition,
  } from '#lib/alerts/types';
  import ConditionBuilder from './ConditionBuilder.svelte';

  type WizardData = {
    basePath: string;
    scope: AlertScope;
    catalog: CatalogEntry[];
    referenceOptions: Record<string, AlertOption[]>;
    recipientUsers: AlertOption[];
    recipientRoles: AlertOption[];
    mailConfigured: boolean;
  };

  let {
    open = $bindable(false),
    data,
    alert = null,
  }: { open?: boolean; data: WizardData; alert?: AlertRow | null } = $props();

  const STEPS = ['event', 'conditions', 'channels', 'review'] as const;
  type Step = (typeof STEPS)[number];

  const THROTTLE_PRESETS = [0, 15, 60, 1440];
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let draft = $state<AlertDraft>(emptyDraft());
  let step = $state<Step>('event');
  let errors = $state<Record<string, string>>({});
  let message = $state('');
  let busy = $state<'save' | 'test' | null>(null);
  let test = $state<AlertTestView | null>(null);
  let eventQuery = $state('');
  let sampleProjectId = $state('');
  let droppedConditions = $state(0);

  // cada apertura empieza de cero (o desde la alerta que se edita)
  let wasOpen = false;
  $effect.pre(() => {
    if (open && !wasOpen) {
      draft = alert ? draftFromAlert(alert) : emptyDraft();
      step = alert ? 'review' : 'event';
      errors = {};
      message = '';
      test = null;
      eventQuery = '';
      sampleProjectId = '';
      droppedConditions = 0;
    }
    wasOpen = open;
  });

  const editing = $derived(Boolean(alert));
  const stepIndex = $derived(STEPS.indexOf(step));
  const definition = $derived(data.catalog.find((entry) => entry.type === draft.eventType));
  const t = (key: string, options?: { values?: Record<string, unknown> }) => $_(key, options);

  // ---------- paso 1: evento ----------
  const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const eventGroups = $derived.by(() => {
    const q = normalize(eventQuery.trim());
    const groups = new Map<string, CatalogEntry[]>();
    for (const entry of data.catalog) {
      const text = normalize(`${$_(entry.label)} ${$_(entry.description)}`);
      if (q && !text.includes(q)) continue;
      if (!groups.has(entry.module)) groups.set(entry.module, []);
      groups.get(entry.module)!.push(entry);
    }
    return [...groups.entries()];
  });

  function compatible(entry: CatalogEntry | undefined, condition: DraftCondition) {
    const field = entry?.fields.find((candidate) => candidate.key === condition.field);
    return Boolean(field && (!condition.operator || field.operators.includes(condition.operator)));
  }

  function chooseEvent(type: string) {
    if (draft.eventType === type) return;
    const next = data.catalog.find((entry) => entry.type === type);
    const kept = draft.conditions.filter((condition) => compatible(next, condition));
    droppedConditions = draft.conditions.length - kept.length;
    draft.eventType = type;
    draft.conditions = kept;
    test = null;
    delete errors.eventType;
  }

  // ---------- paso 3: canales ----------
  type ChannelMeta = {
    key: AlertChannel;
    icon: typeof Mail;
    label: string;
    description: string;
  };
  const channelMeta: ChannelMeta[] = $derived([
    {
      key: 'mail',
      icon: Mail,
      label: $_('alerts.channels.mail'),
      description: $_('alerts.wizard.mailDescription'),
    },
    {
      key: 'slack',
      icon: Hash,
      label: $_('alerts.channels.slack'),
      description: $_('alerts.wizard.slackDescription'),
    },
    {
      key: 'google_chat',
      icon: MessageSquare,
      label: $_('alerts.channels.google_chat'),
      description: $_('alerts.wizard.googleChatDescription'),
    },
    {
      key: 'webhook',
      icon: Webhook,
      label: $_('alerts.channels.webhook'),
      description: $_('alerts.wizard.webhookDescription'),
    },
  ]);

  function toggleChannel(channel: AlertChannel) {
    draft.channels = draft.channels.includes(channel)
      ? draft.channels.filter((item) => item !== channel)
      : [...draft.channels, channel].sort(
          (a, b) =>
            channelMeta.findIndex((meta) => meta.key === a) -
            channelMeta.findIndex((meta) => meta.key === b),
        );
    delete errors.channels;
  }

  // destinatarios de email como etiquetas: `role:<id>`, `user:<id>`, `email:<dirección>`
  const mailSuggestions: TagSuggestion[] = $derived([
    ...data.recipientRoles.map((role) => ({
      value: `role:${role.id}`,
      label: role.label,
      group: $_('alerts.wizard.groupRoles'),
      icon: Users,
    })),
    ...data.recipientUsers.map((user) => ({
      value: `user:${user.id}`,
      label: user.label,
      hint: user.hint,
      group: $_('alerts.wizard.groupUsers'),
      icon: User,
    })),
  ]);

  const mailValues = $derived([
    ...draft.recipients.roleIds.map((id) => `role:${id}`),
    ...draft.recipients.userIds.map((id) => `user:${id}`),
    ...draft.recipients.emails.map((email) => `email:${email}`),
  ]);

  function setMailValues(values: string[]) {
    const pick = (prefix: string) =>
      values.filter((value) => value.startsWith(prefix)).map((value) => value.slice(prefix.length));
    draft.recipients.roleIds = pick('role:');
    draft.recipients.userIds = pick('user:');
    draft.recipients.emails = pick('email:');
    delete errors.recipients;
    delete errors['recipients.userIds'];
    delete errors['recipients.roleIds'];
    delete errors['recipients.emails'];
  }

  function describeMail(value: string): TagView {
    const [kind, ...rest] = value.split(':');
    const id = rest.join(':');
    if (kind === 'role') {
      return {
        label: data.recipientRoles.find((role) => role.id === id)?.label ?? id,
        icon: Users,
        tone: 'brand',
      };
    }
    if (kind === 'user') {
      return { label: data.recipientUsers.find((user) => user.id === id)?.label ?? id, icon: User };
    }
    return { label: id, icon: AtSign };
  }

  const parseEmail = (text: string) => {
    const email = text.trim().toLowerCase();
    return EMAIL_PATTERN.test(email) ? `email:${email}` : null;
  };
  const parseSlack = (text: string) => {
    const name = text.trim().toLowerCase().replace(/^#/, '');
    return /^[a-z0-9][a-z0-9._-]{0,79}$/.test(name) ? `#${name}` : null;
  };
  const parseSpace = (text: string) => (text.trim() ? text.trim().slice(0, 128) : null);
  const parseUrl = (text: string) => {
    try {
      const url = new URL(text.trim());
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
    } catch {
      return null;
    }
  };

  function targetsOf(channel: AlertChannel): number {
    return channelTargets(channel, draft.recipients, data.recipientUsers, data.recipientRoles)
      .length;
  }

  // ---------- validación por paso (lo mínimo para avanzar; el servidor valida todo) ----------
  const stepReady = $derived({
    event: Boolean(draft.eventType),
    conditions: true,
    channels:
      draft.channels.length > 0 && draft.channels.every((channel) => targetsOf(channel) > 0),
    review: true,
  } satisfies Record<Step, boolean>);

  const stepOfError = (key: string): Step => {
    if (key === 'eventType') return 'event';
    if (key.startsWith('conditions') || key === 'match') return 'conditions';
    if (key.startsWith('recipients') || key === 'channels' || key === 'throttleMinutes') {
      return 'channels';
    }
    return 'review';
  };
  const stepErrors = $derived(
    Object.keys(errors).reduce<Record<string, number>>((acc, key) => {
      const target = stepOfError(key);
      acc[target] = (acc[target] ?? 0) + 1;
      return acc;
    }, {}),
  );

  function errorFor(key: string) {
    return errors[key] ? $_(`alerts.errors.${errors[key]}`) : null;
  }

  function go(next: Step) {
    if (next === 'review' && !draft.name.trim() && definition) draft.name = $_(definition.label);
    step = next;
  }

  // ---------- enviar ----------
  async function post(action: 'save' | 'test') {
    if (!draft.name.trim() && definition) draft.name = $_(definition.label);
    busy = action;
    message = '';
    try {
      const response = await fetch(`${data.basePath}?/${action}`, {
        method: 'POST',
        headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
        body: draftToFormData(draft, {
          alertId: alert?.id,
          sampleProjectId: action === 'test' ? sampleProjectId : null,
        }),
      });
      const result = deserialize(await response.text());
      if (result.type === 'failure') {
        errors = (result.data?.errors as Record<string, string>) ?? {};
        message = Object.keys(errors).length
          ? $_('alerts.editor.fixErrors')
          : String(result.data?.error ?? $_('alerts.wizard.failed'));
        if (action === 'test') test = null;
        const first = STEPS.find((candidate) => stepErrors[candidate]);
        if (first) step = first;
        return;
      }
      if (result.type === 'error') {
        message = $_('alerts.wizard.failed');
        return;
      }
      errors = {};
      if (action === 'test' && result.type === 'success') {
        test = (result.data?.test as AlertTestView) ?? null;
        return;
      }
      // guardado: el servidor responde con una redirección a la lista
      toast.success(editing ? $_('alerts.wizard.saved') : $_('alerts.wizard.created'), draft.name);
      open = false;
      await invalidateAll();
    } catch {
      message = $_('alerts.wizard.failed');
    } finally {
      busy = null;
    }
  }

  const projects = $derived(data.referenceOptions.project ?? []);
  const needsSampleProject = $derived(
    data.scope === 'organization' && definition?.scope === 'project',
  );
</script>

<Modal
  bind:open
  size="xl"
  dismissible={busy === null}
  title={editing ? $_('alerts.editor.editTitle') : $_('alerts.editor.newTitle')}
  description={$_('alerts.wizard.subtitle')}
>
  {#snippet icon()}
    <span
      class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-400"
      ><Bell class="h-5 w-5" /></span
    >
  {/snippet}

  <!-- pasos -->
  <ol
    class="-mx-6 -mt-5 mb-6 flex border-b border-white/8 px-6"
    aria-label={$_('alerts.wizard.steps')}
  >
    {#each STEPS as key, index (key)}
      {@const done = index < stepIndex || (editing && index !== stepIndex)}
      {@const reachable =
        editing || index <= stepIndex || STEPS.slice(0, index).every((s) => stepReady[s])}
      <li class="flex-1">
        <button
          type="button"
          class="flex w-full items-center gap-2 border-b-2 py-3 text-left text-sm transition-colors disabled:cursor-default {key ===
          step
            ? 'border-brand-500 text-white'
            : 'border-transparent text-fg-subtle hover:text-fg disabled:hover:text-fg-subtle'}"
          aria-current={key === step ? 'step' : undefined}
          disabled={!reachable}
          onclick={() => go(key)}
        >
          <span
            class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold {stepErrors[
              key
            ]
              ? 'bg-danger/20 text-red-300'
              : key === step
                ? 'bg-brand-500 text-white'
                : done
                  ? 'bg-brand-500/15 text-brand-300'
                  : 'bg-white/6 text-fg-subtle'}"
          >
            {#if stepErrors[key]}!{:else if done && key !== step}<Check
                class="h-3.5 w-3.5"
              />{:else}{index + 1}{/if}
          </span>
          <span class="hidden truncate sm:inline">{$_(`alerts.wizard.step.${key}`)}</span>
        </button>
      </li>
    {/each}
  </ol>

  {#if message}
    <p
      class="mb-5 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-red-200"
      role="alert"
    >
      {message}
    </p>
  {/if}

  <!-- onsubmit: Enter dentro de un campo no envía nada; ConditionBuilder usa botones submit -->
  <form class="min-h-104" onsubmit={(event) => event.preventDefault()} novalidate>
    {#if step === 'event'}
      <div class="space-y-4">
        <label class="relative block">
          <span class="sr-only">{$_('alerts.wizard.searchEvents')}</span>
          <Search
            class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
          />
          <input
            class="k-input pl-9"
            placeholder={$_('alerts.wizard.searchEvents')}
            data-autofocus
            bind:value={eventQuery}
          />
        </label>
        {#if errorFor('eventType')}
          <p class="text-xs text-red-300" role="alert">{errorFor('eventType')}</p>
        {/if}
        <div class="space-y-5" role="radiogroup" aria-label={$_('alerts.editor.event')}>
          {#each eventGroups as [module, entries] (module)}
            <div>
              <p class="k-nav-heading px-0">{$_(`org.events.modules.${module}`)}</p>
              <div class="grid gap-2 sm:grid-cols-2">
                {#each entries as entry (entry.type)}
                  {@const selected = draft.eventType === entry.type}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    class="flex items-start gap-3 rounded-xl border p-3 text-left transition-colors {selected
                      ? 'border-brand-500/50 bg-brand-500/8'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/2'}"
                    onclick={() => chooseEvent(entry.type)}
                    ondblclick={() => go('conditions')}
                  >
                    <span
                      class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg {selected
                        ? 'bg-brand-500/15 text-brand-400'
                        : 'bg-white/5 text-fg-subtle'}"
                    >
                      <Activity class="h-4 w-4" />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block text-sm font-medium text-white">{$_(entry.label)}</span>
                      <span class="mt-0.5 block text-xs text-fg-subtle"
                        >{$_(entry.description)}</span
                      >
                    </span>
                    {#if selected}<Check class="h-4 w-4 shrink-0 text-brand-400" />{/if}
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            <p class="py-8 text-center text-sm text-fg-subtle">{$_('alerts.wizard.noEvents')}</p>
          {/each}
        </div>
      </div>
    {:else if step === 'conditions'}
      <div class="space-y-4">
        <p class="text-sm text-fg-muted">
          {$_('alerts.wizard.conditionsIntro', {
            values: { event: definition ? $_(definition.label) : '' },
          })}
        </p>
        {#if droppedConditions > 0}
          <p
            class="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-xs text-amber-100"
            role="status"
          >
            {$_('alerts.editor.droppedConditions', { values: { count: droppedConditions } })}
          </p>
        {/if}
        <ConditionBuilder
          {definition}
          bind:conditions={draft.conditions}
          bind:match={draft.match}
          referenceOptions={data.referenceOptions}
          {errors}
        />
      </div>
    {:else if step === 'channels'}
      <div class="space-y-6">
        <div>
          <p class="k-label">{$_('alerts.wizard.channelsTitle')}</p>
          <p class="k-help mt-0 mb-3">{$_('alerts.wizard.channelsHelp')}</p>
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {#each channelMeta as meta (meta.key)}
              {@const on = draft.channels.includes(meta.key)}
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                class="relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors {on
                  ? 'border-brand-500/50 bg-brand-500/8'
                  : 'border-white/10 hover:border-white/20 hover:bg-white/2'}"
                onclick={() => toggleChannel(meta.key)}
              >
                <span
                  class="grid h-8 w-8 place-items-center rounded-lg {on
                    ? 'bg-brand-500/15 text-brand-400'
                    : 'bg-white/5 text-fg-subtle'}"><meta.icon class="h-4 w-4" /></span
                >
                <span class="text-sm font-medium text-white">{meta.label}</span>
                <span class="text-xs text-fg-subtle">{meta.description}</span>
                <span
                  class="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-md border {on
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-white/15'}"
                  >{#if on}<Check class="h-3.5 w-3.5" />{/if}</span
                >
              </button>
            {/each}
          </div>
          {#if errorFor('channels')}
            <p class="mt-2 text-xs text-red-300" role="alert">{errorFor('channels')}</p>
          {/if}
        </div>

        {#each channelMeta.filter((meta) => draft.channels.includes(meta.key)) as meta (meta.key)}
          <section class="rounded-xl border border-white/8 bg-ink-900/50 p-4">
            <h3 class="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <meta.icon class="h-4 w-4 text-brand-400" />{meta.label}
            </h3>
            {#if meta.key === 'mail'}
              {#if !data.mailConfigured}
                <p
                  class="mb-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-xs text-amber-100"
                >
                  <MailWarning class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />{$_(
                    'alerts.mailDisabled',
                  )}
                </p>
              {/if}
              <Field
                id="alert-mail-targets"
                label={$_('alerts.wizard.mailTargets')}
                help={$_('alerts.wizard.mailTargetsHelp')}
                error={errorFor('recipients') ??
                  errorFor('recipients.emails') ??
                  errorFor('recipients.userIds') ??
                  errorFor('recipients.roleIds')}
              >
                {#snippet children(control)}
                  <TagInput
                    id={control.id}
                    aria-describedby={control['aria-describedby']}
                    aria-invalid={control['aria-invalid']}
                    values={mailValues}
                    suggestions={mailSuggestions}
                    parse={parseEmail}
                    describe={describeMail}
                    placeholder={$_('alerts.wizard.mailPlaceholder')}
                    invalidMessage={$_('alerts.errors.invalid_email')}
                    onchange={setMailValues}
                  />
                {/snippet}
              </Field>
              <p class="mt-3 flex items-start gap-2 text-xs text-fg-subtle">
                <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />{$_('alerts.editor.recipientsNotice')}
              </p>
            {:else if meta.key === 'slack'}
              <Field
                id="alert-slack-targets"
                label={$_('alerts.wizard.slackTargets')}
                help={$_('alerts.wizard.slackTargetsHelp')}
                error={errorFor('recipients.slackChannels')}
              >
                {#snippet children(control)}
                  <TagInput
                    id={control.id}
                    aria-describedby={control['aria-describedby']}
                    aria-invalid={control['aria-invalid']}
                    bind:values={draft.recipients.slackChannels}
                    parse={parseSlack}
                    describe={(value) => ({ label: value, icon: Hash })}
                    placeholder="#alertas"
                    invalidMessage={$_('alerts.errors.invalid_slack_channel')}
                  />
                {/snippet}
              </Field>
            {:else if meta.key === 'google_chat'}
              <Field
                id="alert-gchat-targets"
                label={$_('alerts.wizard.googleChatTargets')}
                help={$_('alerts.wizard.googleChatTargetsHelp')}
                error={errorFor('recipients.googleChatSpaces')}
              >
                {#snippet children(control)}
                  <TagInput
                    id={control.id}
                    aria-describedby={control['aria-describedby']}
                    aria-invalid={control['aria-invalid']}
                    bind:values={draft.recipients.googleChatSpaces}
                    parse={parseSpace}
                    describe={(value) => ({ label: value, icon: MessageSquare })}
                    placeholder={$_('alerts.wizard.googleChatPlaceholder')}
                  />
                {/snippet}
              </Field>
            {:else}
              <Field
                id="alert-webhook-targets"
                label={$_('alerts.wizard.webhookTargets')}
                help={$_('alerts.wizard.webhookTargetsHelp')}
                error={errorFor('recipients.webhookUrls')}
              >
                {#snippet children(control)}
                  <TagInput
                    id={control.id}
                    aria-describedby={control['aria-describedby']}
                    aria-invalid={control['aria-invalid']}
                    bind:values={draft.recipients.webhookUrls}
                    parse={parseUrl}
                    describe={(value) => ({ label: value, icon: Webhook })}
                    placeholder="https://hooks.example.com/gitops"
                    invalidMessage={$_('alerts.errors.invalid_url')}
                  />
                {/snippet}
              </Field>
            {/if}
          </section>
        {/each}

        <fieldset>
          <legend class="k-label">{$_('alerts.wizard.throttle')}</legend>
          <div class="flex flex-wrap items-center gap-2">
            <div
              class="inline-flex rounded-[0.625rem] border border-white/10 bg-ink-900 p-0.5"
              role="radiogroup"
              aria-label={$_('alerts.wizard.throttle')}
            >
              {#each THROTTLE_PRESETS as minutes (minutes)}
                <button
                  type="button"
                  role="radio"
                  aria-checked={draft.throttleMinutes === minutes}
                  class="h-8 rounded-md px-3 text-xs font-medium transition-colors {draft.throttleMinutes ===
                  minutes
                    ? 'bg-brand-500/20 text-brand-100'
                    : 'text-fg-subtle hover:text-fg'}"
                  onclick={() => (draft.throttleMinutes = minutes)}
                  >{$_(`alerts.wizard.throttle_${minutes}`)}</button
                >
              {/each}
            </div>
            <label class="flex items-center gap-2 text-xs text-fg-subtle">
              {$_('alerts.wizard.throttleCustom')}
              <input
                type="number"
                min="0"
                max="1440"
                class="k-input h-8 w-20 py-0 text-xs"
                aria-label={$_('alerts.editor.throttle')}
                bind:value={draft.throttleMinutes}
              />
              min
            </label>
          </div>
          <p class="k-help">{$_('alerts.editor.throttleHelp')}</p>
          {#if errorFor('throttleMinutes')}
            <p class="text-xs text-red-300" role="alert">{errorFor('throttleMinutes')}</p>
          {/if}
        </fieldset>
      </div>
    {:else}
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div class="space-y-5">
          <Field id="alert-name" label={$_('alerts.editor.name')} error={errorFor('name')}>
            {#snippet children(control)}
              <input
                {...control}
                class="k-input"
                maxlength="120"
                data-autofocus
                bind:value={draft.name}
              />
            {/snippet}
          </Field>
          <Field
            id="alert-description"
            label={$_('alerts.editor.description')}
            error={errorFor('description')}
          >
            {#snippet children(control)}
              <textarea
                {...control}
                class="k-input"
                rows="3"
                maxlength="1000"
                bind:value={draft.description}></textarea>
            {/snippet}
          </Field>
          <label
            class="flex items-center justify-between gap-3 rounded-xl border border-white/8 px-4 py-3"
          >
            <span>
              <span class="block text-sm font-medium text-white">{$_('alerts.editor.enabled')}</span
              >
              <span class="block text-xs text-fg-subtle">{$_('alerts.wizard.enabledHelp')}</span>
            </span>
            <Switch label={$_('alerts.editor.enabled')} bind:checked={draft.enabled} />
          </label>
          {#if needsSampleProject && projects.length > 0}
            <Field id="alert-sample-project" label={$_('alerts.editor.sampleProject')}>
              {#snippet children(control)}
                <select {...control} class="k-input" bind:value={sampleProjectId}>
                  <option value="">{$_('alerts.editor.sampleProjectAny')}</option>
                  {#each projects as project (project.id)}
                    <option value={project.id}>{project.label}</option>
                  {/each}
                </select>
              {/snippet}
            </Field>
          {/if}
        </div>

        <div class="space-y-4">
          <div class="rounded-xl border border-white/8 bg-ink-900/50 p-4 text-sm">
            <p class="k-nav-heading px-0">{$_('alerts.wizard.summary')}</p>
            <dl class="space-y-3">
              <div>
                <dt class="text-xs text-fg-subtle">{$_('alerts.wizard.step.event')}</dt>
                <dd class="text-white">{definition ? $_(definition.label) : '—'}</dd>
              </div>
              <div>
                <dt class="text-xs text-fg-subtle">{$_('alerts.wizard.step.conditions')}</dt>
                <dd class="text-fg">
                  {summarizeConditions(
                    definition,
                    draft.conditions,
                    draft.match,
                    data.referenceOptions,
                    t,
                  )}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-fg-subtle">{$_('alerts.wizard.step.channels')}</dt>
                <dd class="mt-1 space-y-1.5">
                  {#each channelMeta.filter( (meta) => draft.channels.includes(meta.key) ) as meta (meta.key)}
                    <p class="flex items-start gap-2 text-fg">
                      <meta.icon class="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                      <span class="min-w-0 break-words">
                        <span class="text-fg-muted">{meta.label}:</span>
                        {channelTargets(
                          meta.key,
                          draft.recipients,
                          data.recipientUsers,
                          data.recipientRoles,
                        ).join(', ') || '—'}
                      </span>
                    </p>
                  {/each}
                  {#if draft.throttleMinutes > 0}
                    <p class="text-xs text-fg-subtle">
                      {$_('alerts.list.throttle', { values: { minutes: draft.throttleMinutes } })}
                    </p>
                  {/if}
                </dd>
              </div>
            </dl>
          </div>

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
              <p class="mt-1">
                {test.recipients.length > 0
                  ? $_('alerts.test.recipients', {
                      values: {
                        names: test.recipients.map((recipient) => recipient.username).join(', '),
                      },
                    })
                  : $_('alerts.test.noRecipients')}
              </p>
              {#if test.deniedCount > 0}
                <p class="mt-1 text-xs">
                  {$_('alerts.test.denied', { values: { count: test.deniedCount } })}
                </p>
              {/if}
              <p class="mt-1 text-xs opacity-75">{$_('alerts.test.nothingSent')}</p>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </form>

  {#snippet footer()}
    <span class="mr-auto text-xs text-fg-subtle">
      {$_('alerts.wizard.stepOf', { values: { current: stepIndex + 1, total: STEPS.length } })}
    </span>
    {#if stepIndex > 0}
      <button type="button" class="k-btn k-btn-ghost" onclick={() => go(STEPS[stepIndex - 1])}>
        <ChevronLeft class="h-4 w-4" />{$_('alerts.wizard.back')}
      </button>
    {:else}
      <button type="button" class="k-btn k-btn-ghost" onclick={() => (open = false)}
        >{$_('common.cancel')}</button
      >
    {/if}
    {#if step !== 'review'}
      <button
        type="button"
        class="k-btn k-btn-primary"
        disabled={!stepReady[step]}
        onclick={() => go(STEPS[stepIndex + 1])}
      >
        {step === 'conditions' && draft.conditions.length === 0
          ? $_('alerts.wizard.skipConditions')
          : $_('alerts.wizard.next')}<ChevronRight class="h-4 w-4" />
      </button>
    {:else}
      <button
        type="button"
        class="k-btn k-btn-secondary"
        disabled={busy !== null}
        onclick={() => post('test')}
      >
        {#if busy === 'test'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<FlaskConical
            class="h-4 w-4"
          />{/if}
        {$_('alerts.editor.test')}
      </button>
      <button
        type="button"
        class="k-btn k-btn-primary"
        disabled={busy !== null}
        onclick={() => post('save')}
      >
        {#if busy === 'save'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Save
            class="h-4 w-4"
          />{/if}
        {editing ? $_('alerts.editor.saveChanges') : $_('alerts.editor.create')}
      </button>
    {/if}
  {/snippet}
</Modal>
