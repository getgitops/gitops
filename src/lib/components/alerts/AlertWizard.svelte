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
    Send,
    Settings,
    ShieldAlert,
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
    AlertChannelOption,
    AlertDraft,
    AlertOption,
    AlertRow,
    AlertScope,
    AlertTestView,
    CatalogEntry,
    DraftCondition,
    ExternalRecipientsEditorData,
  } from '#lib/alerts/types';
  import { statusBadgeClass } from '#lib/notifications/status';
  import ConditionBuilder from './ConditionBuilder.svelte';

  type WizardData = {
    basePath: string;
    scope: AlertScope;
    catalog: CatalogEntry[];
    referenceOptions: Record<string, AlertOption[]>;
    recipientUsers: AlertOption[];
    recipientRoles: AlertOption[];
    mailConfigured: boolean;
    external: ExternalRecipientsEditorData;
    channels: AlertChannelOption[];
    configPath?: string | null;
  };

  let {
    open = $bindable(false),
    data,
    alert = null,
    onConfigure,
  }: {
    open?: boolean;
    data: WizardData;
    alert?: AlertRow | null;
    onConfigure?: () => void;
  } = $props();

  const STEPS = ['event', 'conditions', 'channels', 'review'] as const;
  type Step = (typeof STEPS)[number];

  const THROTTLE_PRESETS = [0, 15, 60, 1440];
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let draft = $state<AlertDraft>(emptyDraft());
  let step = $state<Step>('event');
  let errors = $state<Record<string, string>>({});
  let message = $state('');
  let busy = $state<'save' | 'test' | 'send' | null>(null);
  let test = $state<AlertTestView | null>(null);
  let eventQuery = $state('');
  let sampleProjectId = $state('');
  let droppedConditions = $state(0);
  let mailOn = $state(true);

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
      mailOn =
        !alert ||
        draft.recipients.userIds.length +
          draft.recipients.roleIds.length +
          draft.recipients.emails.length >
          0;
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

  const channelIcons: Record<string, typeof Mail> = {
    mail: Mail,
    slack: Hash,
    'google-chat': MessageSquare,
    webhook: Webhook,
  };

  const CHANNEL_TYPES = ['mail', 'slack', 'google-chat', 'webhook'] as const;
  type ChannelType = (typeof CHANNEL_TYPES)[number];
  const typeMeta = $derived({
    mail: { label: $_('alerts.channels.mail'), description: $_('alerts.wizard.mailDescription') },
    slack: {
      label: $_('alerts.channels.slack'),
      description: $_('alerts.wizard.slackDescription'),
    },
    'google-chat': {
      label: $_('alerts.channels.google_chat'),
      description: $_('alerts.wizard.googleChatDescription'),
    },
    webhook: {
      label: $_('alerts.channels.webhook'),
      description: $_('alerts.wizard.webhookDescription'),
    },
  } satisfies Record<ChannelType, { label: string; description: string }>);

  const channelsOf = (type: ChannelType) =>
    data.channels.filter((channel) => channel.type === type);

  function typeOn(type: ChannelType) {
    if (type === 'mail') return mailOn;
    return channelsOf(type).some((channel) => draft.channelIds.includes(channel.id));
  }

  function toggleType(type: ChannelType) {
    if (type === 'mail') {
      mailOn = !mailOn;
      if (!mailOn) {
        draft.recipients.userIds = [];
        draft.recipients.roleIds = [];
        draft.recipients.emails = [];
      }
    } else {
      const ids = channelsOf(type).map((channel) => channel.id);
      if (typeOn(type)) {
        draft.channelIds = draft.channelIds.filter((id) => !ids.includes(id));
      } else if (data.external.canManage) {
        const enabled = channelsOf(type).filter((channel) => channel.enabled);
        const picked = (enabled.length > 0 ? enabled : channelsOf(type)).map(
          (channel) => channel.id,
        );
        draft.channelIds = [...draft.channelIds, ...picked];
      }
    }
    delete errors.channelIds;
    delete errors.recipients;
  }

  function toggleChannel(channel: AlertChannelOption) {
    const on = draft.channelIds.includes(channel.id);
    if (!on && !data.external.canManage) return;
    draft.channelIds = on
      ? draft.channelIds.filter((id) => id !== channel.id)
      : [...draft.channelIds, channel.id];
    delete errors.channelIds;
    delete errors.recipients;
  }

  function configure(event: MouseEvent) {
    if (!onConfigure || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    onConfigure();
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
    const status = data.external.statuses[id];
    return {
      label: status ? `${id} · ${$_(`notifications.status.${status}`)}` : id,
      icon: AtSign,
    };
  }

  const canAddExternal = $derived(
    data.external.canManage && data.external.allowedDomains.length > 0,
  );
  function domainAllowed(email: string) {
    const domain = email.split('@').pop() ?? '';
    return data.external.allowedDomains.some((allowed) =>
      allowed.startsWith('*.') ? domain.endsWith(allowed.slice(1)) : domain === allowed,
    );
  }
  const parseEmail = (text: string) => {
    const email = text.trim().toLowerCase();
    if (!canAddExternal || !EMAIL_PATTERN.test(email) || !domainAllowed(email)) return null;
    return `email:${email}`;
  };
  const emailRejection = $derived(
    !data.external.allowedDomains.length
      ? $_('alerts.editor.externalDisabled')
      : !data.external.canManage
        ? $_('alerts.editor.externalReadonly')
        : $_('alerts.editor.externalHelp', {
            values: { domains: data.external.allowedDomains.join(', ') },
          }),
  );
  const externalErrors = $derived(
    Object.entries(errors)
      .filter(([key]) => /^recipients\.emails\.\d+$/.test(key))
      .map(([key, code]) => ({
        email: draft.recipients.emails[Number(key.split('.').pop())] ?? '',
        code,
      })),
  );
  // ---------- validación por paso (lo mínimo para avanzar; el servidor valida todo) ----------
  const stepReady = $derived({
    event: Boolean(draft.eventType),
    conditions: true,
    channels:
      (mailOn
        ? draft.recipients.userIds.length +
          draft.recipients.roleIds.length +
          draft.recipients.emails.length
        : 0) +
        draft.channelIds.length >
      0,
    review: true,
  } satisfies Record<Step, boolean>);

  const stepOfError = (key: string): Step => {
    if (key === 'eventType') return 'event';
    if (key.startsWith('conditions') || key === 'match') return 'conditions';
    if (key.startsWith('recipients') || key === 'channelIds' || key === 'throttleMinutes') {
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
  const OPERATION_ERRORS = ['mail_not_configured', 'test_rate_limited'];

  async function post(action: 'save' | 'test', send = false) {
    if (!draft.name.trim() && definition) draft.name = $_(definition.label);
    busy = send ? 'send' : action;
    message = '';
    try {
      const response = await fetch(`${data.basePath}?/${action}`, {
        method: 'POST',
        headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
        body: draftToFormData(draft, {
          alertId: alert?.id,
          sampleProjectId: action === 'test' ? sampleProjectId : null,
          send: send ? 'true' : null,
        }),
      });
      const result = deserialize(await response.text());
      if (result.type === 'failure') {
        errors = (result.data?.errors as Record<string, string>) ?? {};
        const code = String(result.data?.error ?? '');
        message = Object.keys(errors).length
          ? $_('alerts.editor.fixErrors')
          : OPERATION_ERRORS.includes(code)
            ? $_(`alerts.errors.${code}`)
            : code || $_('alerts.wizard.failed');
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
        <div data-testid="alert-channels">
          <p class="k-label">{$_('alerts.wizard.channelsTitle')}</p>
          <p class="k-help mb-3 mt-0">{$_('alerts.wizard.channelsHelp')}</p>
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {#each CHANNEL_TYPES as type (type)}
              {@const on = typeOn(type)}
              {@const configured = type === 'mail' || channelsOf(type).length > 0}
              {@const locked =
                !on && (!configured || (type !== 'mail' && !data.external.canManage))}
              {@const Icon = channelIcons[type]}
              <div
                class="relative flex flex-col rounded-xl border transition-colors {on
                  ? 'border-brand-500/50 bg-brand-500/8'
                  : locked
                    ? 'border-white/8'
                    : 'border-white/10 hover:border-white/20 hover:bg-white/2'}"
                data-channel-type={type}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-disabled={locked || undefined}
                  disabled={locked}
                  class="flex flex-1 flex-col items-start gap-2 p-3 text-left disabled:cursor-not-allowed {locked
                    ? 'opacity-55'
                    : ''}"
                  onclick={() => toggleType(type)}
                >
                  <span
                    class="grid h-8 w-8 place-items-center rounded-lg {on
                      ? 'bg-brand-500/15 text-brand-400'
                      : 'bg-white/5 text-fg-subtle'}"><Icon class="h-4 w-4" /></span
                  >
                  <span class="text-sm font-medium text-white">{typeMeta[type].label}</span>
                  <span class="text-xs text-fg-subtle">
                    {configured ? typeMeta[type].description : $_('alerts.wizard.notConfigured')}
                  </span>
                </button>
                {#if configured}
                  <span
                    class="pointer-events-none absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-md border {on
                      ? 'border-brand-500 bg-brand-500 text-white'
                      : 'border-white/15'}"
                    >{#if on}<Check class="h-3.5 w-3.5" />{/if}</span
                  >
                {:else}
                  <span class="k-badge absolute right-3 top-3 h-5 px-1.5 text-[10px]"
                    >{$_('alerts.wizard.notConfigured')}</span
                  >
                  {#if data.configPath}
                    <a
                      href={data.configPath}
                      class="k-btn k-btn-secondary k-btn-sm mx-3 mb-3"
                      onclick={configure}
                      data-testid="configure-channel"
                    >
                      <Settings class="h-3.5 w-3.5" />{$_('alerts.wizard.configure')}
                    </a>
                  {/if}
                {/if}
              </div>
            {/each}
          </div>
          {#if errorFor('channelIds')}
            <p class="mt-2 text-xs text-red-300" role="alert">{errorFor('channelIds')}</p>
          {/if}
        </div>

        {#if mailOn}
          <section class="rounded-xl border border-white/8 bg-ink-900/50 p-4">
            <h3 class="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Mail class="h-4 w-4 text-brand-400" />{$_('alerts.channels.mail')}
            </h3>
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
                  invalidMessage={emailRejection}
                  onchange={setMailValues}
                />
              {/snippet}
            </Field>
            {#if externalErrors.length > 0}
              <ul class="mt-2 list-disc pl-4 text-xs text-red-300" role="alert">
                {#each externalErrors as failure (failure.email + failure.code)}
                  <li>{failure.email}: {$_(`alerts.errors.${failure.code}`)}</li>
                {/each}
              </ul>
            {/if}
            {#if draft.recipients.emails.length > 0}
              <p
                class="mt-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-xs text-amber-100"
              >
                <ShieldAlert class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                {$_('alerts.editor.externalNotice')}
              </p>
            {:else if !data.external.allowedDomains.length && data.external.settingsPath}
              <p class="mt-3 text-xs text-fg-subtle">
                {$_('alerts.editor.externalDisabled')}
                <a class="text-brand-400 hover:text-brand-300" href={data.external.settingsPath}
                  >{$_('alerts.editor.externalSettingsLink')}</a
                >
              </p>
            {/if}
            <p class="mt-3 flex items-start gap-2 text-xs text-fg-subtle">
              <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />{$_('alerts.editor.recipientsNotice')}
            </p>
          </section>
        {/if}

        {#each CHANNEL_TYPES.filter((type) => type !== 'mail' && typeOn(type)) as type (type)}
          {@const Icon = channelIcons[type]}
          <section class="rounded-xl border border-white/8 bg-ink-900/50 p-4">
            <h3 class="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Icon class="h-4 w-4 text-brand-400" />{typeMeta[type].label}
            </h3>
            <div class="flex flex-wrap gap-2">
              {#each channelsOf(type) as channel (channel.id)}
                {@const selected = draft.channelIds.includes(channel.id)}
                <label
                  class="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm {selected
                    ? 'border-brand-500/40 bg-brand-500/8 text-white'
                    : 'border-white/10 text-fg-muted'}"
                >
                  <input
                    type="checkbox"
                    class="k-checkbox"
                    checked={selected}
                    disabled={!selected && !data.external.canManage}
                    onchange={() => toggleChannel(channel)}
                  />
                  {channel.name}
                  {#if channel.scope === 'organization' && data.scope === 'project'}
                    <span class="text-[11px] text-fg-subtle"
                      >{$_('alerts.editor.channelFromOrganization')}</span
                    >
                  {/if}
                  {#if !channel.enabled}
                    <span class="text-[11px] text-fg-subtle"
                      >{$_('notifications.channels.disabled')}</span
                    >
                  {/if}
                </label>
              {/each}
            </div>
          </section>
        {/each}

        {#if draft.channelIds.length > 0}
          <p
            class="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-xs text-amber-100"
          >
            <ShieldAlert class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
            {$_('alerts.editor.channelsNotice')}
          </p>
        {/if}
        {#if !data.external.canManage && data.channels.length > 0}
          <p class="text-xs text-fg-subtle">{$_('alerts.editor.channelsReadonly')}</p>
        {/if}

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
                  {#if channelTargets('mail', draft, data.recipientUsers, data.recipientRoles).length > 0}
                    <p class="flex items-start gap-2 text-fg">
                      <Mail class="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                      <span class="min-w-0 break-words">
                        <span class="text-fg-muted">{$_('alerts.channels.mail')}:</span>
                        {channelTargets(
                          'mail',
                          draft,
                          data.recipientUsers,
                          data.recipientRoles,
                        ).join(', ')}
                      </span>
                    </p>
                  {/if}
                  {#each data.channels.filter( (channel) => draft.channelIds.includes(channel.id) ) as channel (channel.id)}
                    {@const Icon = channelIcons[channel.type] ?? Webhook}
                    <p class="flex items-start gap-2 text-fg">
                      <Icon class="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                      <span class="min-w-0 break-words">
                        <span class="text-fg-muted"
                          >{$_(`notifications.channels.types.${channel.type}`)}:</span
                        >
                        {channel.name}
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
              {#if test.external.length > 0}
                <ul class="mt-1 text-xs">
                  {#each test.external as recipient (recipient.email)}
                    <li class="flex flex-wrap items-center gap-1.5">
                      <span class="{statusBadgeClass(recipient.status)} h-5 px-1.5 text-[10px]"
                        >{$_(`notifications.status.${recipient.status}`)}</span
                      >
                      {recipient.email}: {recipient.delivers
                        ? $_('alerts.test.externalDelivers')
                        : test.delivery && recipient.status === 'pending'
                          ? $_('alerts.test.externalVerificationSent')
                          : $_('alerts.test.externalSkipped', {
                              values: { status: $_(`notifications.status.${recipient.status}`) },
                            })}
                    </li>
                  {/each}
                </ul>
              {/if}
              {#if test.delivery}
                <p class="mt-1 font-medium" data-testid="alert-test-delivery">
                  {$_('alerts.test.delivered', {
                    values: { sent: test.delivery.sent, failed: test.delivery.failed },
                  })}
                </p>
              {:else}
                <p class="mt-1 text-xs opacity-75">{$_('alerts.test.nothingSent')}</p>
              {/if}
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
        class="k-btn k-btn-secondary"
        disabled={busy !== null || (!data.mailConfigured && draft.channelIds.length === 0)}
        title={$_('alerts.editor.sendTestHelp')}
        onclick={() => post('test', true)}
        data-testid="alert-send-test"
      >
        {#if busy === 'send'}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Send
            class="h-4 w-4"
          />{/if}
        {busy === 'send' ? $_('alerts.editor.sendingTest') : $_('alerts.editor.sendTest')}
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
