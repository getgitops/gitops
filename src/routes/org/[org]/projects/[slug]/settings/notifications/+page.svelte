<script lang="ts">
  import {
    BellRing,
    Braces,
    Check,
    Hash,
    Mail,
    MessageCircle,
    Pencil,
    Plus,
    Power,
    Trash2,
    Webhook,
    X,
  } from '@lucide/svelte';
  import Dropdown from '$lib/components/Dropdown.svelte';
  import { _ } from '$lib/i18n';

  type Rule = {
    id: string;
    name: string;
    description: string | null;
    eventName: string;
    destinations: DestinationDraft[];
    filters: FilterCondition[];
    enabled: boolean;
  };

  type EventField = {
    id: string;
    name: string;
    type?: 'text' | 'number' | 'datetime';
    options?: string[];
  };
  type EventDefinition = {
    id: string;
    name: string;
    scope: 'project' | 'organization';
    fields: EventField[];
  };
  type FilterOperator =
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'starts_with'
    | 'greater_than'
    | 'greater_or_equal'
    | 'less_than'
    | 'less_or_equal'
    | 'exists';
  type FilterCondition = { id: number; field: string; operator: FilterOperator; value: string };
  type ProviderId = 'mail' | 'slack' | 'google-chat' | 'http';
  type TemplateOption = { id: string; provider: ProviderId; name: string };
  type DestinationDraft = {
    channel: ProviderId;
    templateId: string | null;
    providerConfig: { channel?: string };
    recipients: string[];
  };

  export let data: {
    notifications: Rule[];
    events: EventDefinition[];
    targets: Array<{
      id: ProviderId;
      configured: boolean;
      enabled: boolean;
      defaultTemplateId: string | null;
    }>;
    templates: TemplateOption[];
    canUpdate: boolean;
  };
  export let form: { error?: string; success?: boolean } | null;

  let modalOpen = false;
  let editingRuleId: string | null = null;
  let ruleName = '';
  let ruleDescription = '';
  let eventName = data.events[0]?.id ?? '';
  let destinations: DestinationDraft[] = [];
  let filters: FilterCondition[] = [];
  let conditionSequence = 0;

  $: eventOptions = data.events.map((event) => ({ id: event.id, name: event.name }));
  $: selectedEvent = data.events.find((event) => event.id === eventName) ?? data.events[0];
  $: fieldOptions = (selectedEvent?.fields ?? []).map((field) => ({
    id: field.id,
    name: field.name,
  }));
  $: selectedChannels = new Set(destinations.map((destination) => destination.channel));
  const providers = [
    { id: 'mail' as const, name: 'Email', icon: Mail, soon: false },
    { id: 'slack' as const, name: 'Slack', icon: Hash, soon: false },
    { id: 'google-chat' as const, name: 'Google Chat', icon: MessageCircle, soon: false },
    { id: 'http' as const, name: 'HTTP', icon: Webhook, soon: false },
  ];
  $: filterExpression = filters.length
    ? filters
        .map((filter) => {
          const symbols: Record<FilterOperator, string> = {
            equals: '=',
            not_equals: '!=',
            contains: '~',
            not_contains: '!~',
            starts_with: '^=',
            greater_than: '>',
            greater_or_equal: '>=',
            less_than: '<',
            less_or_equal: '<=',
            exists: 'IS NOT EMPTY',
          };
          return filter.operator === 'exists'
            ? `${filter.field} ${symbols[filter.operator]}`
            : `${filter.field} ${symbols[filter.operator]} "${filter.value}"`;
        })
        .join(' AND ')
    : $_('projectSettings.notifications.allEvents');

  const operatorOptions = [
    { id: 'equals', name: $_('projectSettings.notifications.operators.equals') },
    { id: 'not_equals', name: $_('projectSettings.notifications.operators.notEquals') },
    { id: 'contains', name: $_('projectSettings.notifications.operators.contains') },
    { id: 'not_contains', name: $_('projectSettings.notifications.operators.notContains') },
    { id: 'starts_with', name: $_('projectSettings.notifications.operators.startsWith') },
    { id: 'greater_than', name: $_('projectSettings.notifications.operators.greaterThan') },
    {
      id: 'greater_or_equal',
      name: $_('projectSettings.notifications.operators.greaterOrEqual'),
    },
    { id: 'less_than', name: $_('projectSettings.notifications.operators.lessThan') },
    { id: 'less_or_equal', name: $_('projectSettings.notifications.operators.lessOrEqual') },
    { id: 'exists', name: $_('projectSettings.notifications.operators.exists') },
  ];

  function resetBuilder() {
    editingRuleId = null;
    ruleName = '';
    ruleDescription = '';
    eventName = data.events[0]?.id ?? '';
    destinations = [newDestination('mail')];
    filters = [];
  }

  function openBuilder() {
    resetBuilder();
    modalOpen = true;
  }

  function openEditor(rule: Rule) {
    editingRuleId = rule.id;
    ruleName = rule.name;
    ruleDescription = rule.description ?? '';
    eventName = rule.eventName;
    destinations = rule.destinations.map((destination) => ({
      channel: destination.channel,
      templateId: destination.templateId ?? defaultTemplateFor(destination.channel),
      providerConfig: { ...destination.providerConfig },
      recipients: [...destination.recipients],
    }));
    filters = rule.filters.map((filter) => ({ ...filter, id: ++conditionSequence }));
    modalOpen = true;
  }

  function eventLabel(id: string) {
    return data.events.find((event) => event.id === id)?.name ?? id;
  }

  function targetAvailable(id: ProviderId) {
    if (id === 'mail') return true;
    return data.targets.some((target) => target.id === id && target.configured && target.enabled);
  }

  function targetDefinition(id: ProviderId) {
    return providers.find((provider) => provider.id === id) ?? providers[0];
  }

  function templateLabel(destination: DestinationDraft) {
    const selectedId = destination.templateId ?? defaultTemplateFor(destination.channel);
    return data.templates.find((template) => template.id === selectedId)?.name ?? '—';
  }

  function defaultTemplateFor(id: ProviderId) {
    return (
      data.targets.find((target) => target.id === id)?.defaultTemplateId ??
      data.templates.find((template) => template.provider === id)?.id ??
      ''
    );
  }

  function newDestination(channel: ProviderId): DestinationDraft {
    return {
      channel,
      templateId: defaultTemplateFor(channel),
      providerConfig: {},
      recipients: [],
    };
  }

  function destinationFor(channel: ProviderId) {
    return destinations.find((destination) => destination.channel === channel);
  }

  function toggleTarget(channel: ProviderId) {
    if (destinationFor(channel)) {
      if (destinations.length === 1) return;
      destinations = destinations.filter((destination) => destination.channel !== channel);
      return;
    }
    if (!targetAvailable(channel)) return;
    destinations = [...destinations, newDestination(channel)];
  }

  function updateDestination(channel: ProviderId, changes: Partial<DestinationDraft>) {
    destinations = destinations.map((destination) =>
      destination.channel === channel ? { ...destination, ...changes } : destination,
    );
  }

  function destinationTemplates(channel: ProviderId) {
    return data.templates.filter((template) => template.provider === channel);
  }

  function destinationsValid() {
    return (
      destinations.length > 0 &&
      destinations.every(
        (destination) =>
          targetAvailable(destination.channel) &&
          Boolean(destination.templateId) &&
          (destination.channel !== 'slack' || Boolean(destination.providerConfig.channel?.trim())),
      )
    );
  }

  function selectEvent(id: string) {
    eventName = id;
    filters = [];
  }

  function addCondition() {
    const field = selectedEvent?.fields[0]?.id;
    if (!field) return;
    filters = [...filters, { id: ++conditionSequence, field, operator: 'equals', value: '' }];
  }

  function updateCondition(id: number, changes: Partial<FilterCondition>) {
    filters = filters.map((filter) => (filter.id === id ? { ...filter, ...changes } : filter));
  }

  function removeCondition(id: number) {
    filters = filters.filter((filter) => filter.id !== id);
  }

  function fieldFor(condition: FilterCondition) {
    return selectedEvent?.fields.find((field) => field.id === condition.field);
  }

  function operatorsFor(condition: FilterCondition) {
    const type = fieldFor(condition)?.type ?? 'text';
    const allowed: FilterOperator[] =
      type === 'number' || type === 'datetime'
        ? [
            'equals',
            'not_equals',
            'greater_than',
            'greater_or_equal',
            'less_than',
            'less_or_equal',
            'exists',
          ]
        : ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'exists'];
    return operatorOptions.filter((option) => allowed.includes(option.id as FilterOperator));
  }
</script>

<svelte:head><title>{$_('projectSettings.notifications.title')}</title></svelte:head>

<div class="space-y-6">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <h2 class="text-xl font-semibold text-slate-900">
        {$_('projectSettings.notifications.title')}
      </h2>
      <p class="mt-1 text-sm text-slate-600">{$_('projectSettings.notifications.description')}</p>
    </div>
    {#if data.canUpdate}
      <button
        type="button"
        on:click={openBuilder}
        class="inline-flex shrink-0 items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        <Plus class="h-4 w-4" />
        {$_('projectSettings.notifications.newRule')}
      </button>
    {/if}
  </div>

  {#if form?.error}
    <p class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {form.error}
    </p>
  {/if}

  {#if data.notifications.length === 0}
    <div
      class="flex flex-col items-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center"
    >
      <BellRing class="h-8 w-8 text-slate-400" />
      <div>
        <p class="text-sm font-medium text-slate-800">
          {$_('projectSettings.notifications.empty')}
        </p>
        <p class="mt-1 text-sm text-slate-500">
          {$_('projectSettings.notifications.emptyDescription')}
        </p>
      </div>
    </div>
  {:else}
    <div class="space-y-3">
      {#each data.notifications as rule (rule.id)}
        <article
          class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
        >
          <div class="flex items-start gap-4 px-5 py-5">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-sky-200 bg-sky-50 text-sky-700"
            >
              <BellRing class="h-5 w-5" />
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="truncate text-base font-semibold text-slate-950">{rule.name}</h3>
                <span
                  class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium {rule.enabled
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'}"
                >
                  <span
                    class="h-1.5 w-1.5 rounded-full {rule.enabled
                      ? 'bg-emerald-500'
                      : 'bg-slate-400'}"
                  ></span>
                  {rule.enabled
                    ? $_('projectSettings.notifications.active')
                    : $_('projectSettings.notifications.inactive')}
                </span>
              </div>
              {#if rule.description}
                <p class="mt-1 max-w-3xl text-sm leading-5 text-slate-600">{rule.description}</p>
              {/if}
            </div>
          </div>

          <div
            class="grid gap-5 border-t border-slate-100 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"
          >
            <div class="flex items-start gap-3 lg:border-r lg:border-slate-200 lg:pr-5">
              <BellRing class="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <div class="min-w-0">
                <p class="text-[11px] font-semibold uppercase text-slate-500">
                  {$_('projectSettings.notifications.action')}
                </p>
                <p class="mt-1 truncate text-sm font-medium text-slate-800">
                  {eventLabel(rule.eventName)}
                </p>
              </div>
            </div>
            <div class="min-w-0 lg:pl-5">
              <p class="text-[11px] font-semibold uppercase text-slate-500">
                {$_('projectSettings.notifications.destinations')}
              </p>
              <div class="mt-2 space-y-3">
                {#each rule.destinations as destination}
                  <div class="flex items-start gap-3">
                    <svelte:component
                      this={targetDefinition(destination.channel).icon}
                      class="mt-0.5 h-4 w-4 shrink-0 text-sky-700"
                    />
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-sky-800">
                        {targetDefinition(destination.channel).name}
                      </p>
                      <p class="mt-0.5 text-xs text-slate-600">
                        {$_('projectSettings.notifications.templates.template')}:
                        {templateLabel(destination)}
                      </p>
                      <p class="mt-0.5 break-all text-xs text-slate-500">
                        {#if destination.channel === 'mail'}
                          {destination.recipients.length
                            ? destination.recipients.join(', ')
                            : $_('projectSettings.notifications.templates.inheritedRecipients')}
                        {:else if destination.channel === 'slack'}
                          {destination.providerConfig.channel}
                        {:else}
                          {$_('projectSettings.notifications.targets.configuredWebhook')}
                        {/if}
                      </p>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>

          {#if rule.filters.length}
            <div class="flex items-start gap-3 px-5 py-3">
              <Braces class="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div class="min-w-0">
                <p class="text-[11px] font-semibold uppercase text-slate-500">
                  {$_('projectSettings.notifications.conditions')}
                </p>
                <code class="mt-1 block break-all text-xs leading-5 text-slate-600">
                  {rule.filters
                    .map((filter) => `${filter.field} ${filter.operator} ${filter.value}`)
                    .join(' AND ')}
                </code>
              </div>
            </div>
          {/if}

          {#if data.canUpdate}
            <div
              class="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3"
            >
              <button
                type="button"
                on:click={() => openEditor(rule)}
                class="btn-secondary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
              >
                <Pencil class="h-4 w-4" />
                {$_('projectSettings.notifications.editRule')}
              </button>
              <form method="POST" action="?/toggle">
                <input type="hidden" name="id" value={rule.id} />
                <input type="hidden" name="enabled" value={rule.enabled ? 'false' : 'true'} />
                <button
                  type="submit"
                  class="btn-secondary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
                >
                  <Power class="h-4 w-4" />
                  {rule.enabled
                    ? $_('projectSettings.notifications.disable')
                    : $_('projectSettings.notifications.enable')}
                </button>
              </form>
              <form method="POST" action="?/delete">
                <input type="hidden" name="id" value={rule.id} />
                <button
                  type="submit"
                  title={$_('common.delete')}
                  class="inline-flex items-center justify-center rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
              </form>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</div>

{#if modalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6">
    <div
      class="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-md bg-white shadow-2xl"
    >
      <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h3 class="text-lg font-semibold text-slate-900">
            {editingRuleId
              ? $_('projectSettings.notifications.editRule')
              : $_('projectSettings.notifications.newRule')}
          </h3>
          <p class="mt-0.5 text-sm text-slate-500">
            {$_('projectSettings.notifications.builderDescription')}
          </p>
        </div>
        <button
          type="button"
          on:click={() => (modalOpen = false)}
          title={$_('common.close')}
          class="p-1 text-slate-500 hover:text-slate-900"><X class="h-5 w-5" /></button
        >
      </div>
      <form
        method="POST"
        action={editingRuleId ? '?/update' : '?/create'}
        class="flex min-h-0 flex-1 flex-col"
      >
        {#if editingRuleId}<input type="hidden" name="id" value={editingRuleId} />{/if}
        <input type="hidden" name="eventName" value={eventName} />
        <input type="hidden" name="destinations" value={JSON.stringify(destinations)} />
        <input
          type="hidden"
          name="filters"
          value={JSON.stringify(
            filters.map(({ field, operator, value }) => ({ field, operator, value })),
          )}
        />

        <div
          class="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]"
        >
          <div
            class="min-h-0 space-y-7 overflow-y-auto border-b border-slate-200 p-5 sm:p-6 lg:border-b-0 lg:border-r"
          >
            <section class="space-y-4">
              <div>
                <label for="notification-name" class="block text-sm font-medium text-slate-700"
                  >{$_('common.name')}</label
                >
                <input
                  id="notification-name"
                  name="name"
                  required
                  bind:value={ruleName}
                  class="field-input mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder={$_('projectSettings.notifications.namePlaceholder')}
                />
              </div>
              <div>
                <label
                  for="notification-description"
                  class="block text-sm font-medium text-slate-700">{$_('common.description')}</label
                >
                <textarea
                  id="notification-description"
                  name="description"
                  rows="3"
                  bind:value={ruleDescription}
                  class="field-input mt-1 w-full resize-none rounded-md border px-3 py-2 text-sm"
                  placeholder={$_('projectSettings.notifications.descriptionPlaceholder')}
                ></textarea>
              </div>
              <div>
                <p class="mb-1 text-sm font-medium text-slate-700">
                  {$_('projectSettings.notifications.event')}
                </p>
                <Dropdown
                  options={eventOptions}
                  value={eventName}
                  fullWidth
                  ariaLabel={$_('projectSettings.notifications.event')}
                  on:change={(event) => selectEvent(event.detail.id)}
                />
                {#if selectedEvent?.scope === 'organization'}
                  <p class="mt-1 text-xs text-amber-700">
                    {$_('projectSettings.notifications.organizationScope')}
                  </p>
                {/if}
              </div>
            </section>

            <section class="space-y-3 border-t border-slate-200 pt-6">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <h4 class="text-sm font-semibold text-slate-900">
                    {$_('projectSettings.notifications.conditions')}
                  </h4>
                  <p class="mt-1 text-sm text-slate-500">
                    {$_('projectSettings.notifications.conditionsDescription')}
                  </p>
                </div>
                <button
                  type="button"
                  on:click={addCondition}
                  class="btn-secondary inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
                >
                  <Plus class="h-4 w-4" />
                  {$_('projectSettings.notifications.addCondition')}
                </button>
              </div>

              {#each filters as condition (condition.id)}
                <div
                  class="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center"
                >
                  <Dropdown
                    options={fieldOptions}
                    value={condition.field}
                    ariaLabel={$_('projectSettings.notifications.property')}
                    on:change={(event) =>
                      updateCondition(condition.id, {
                        field: event.detail.id,
                        operator: 'equals',
                        value: '',
                      })}
                  />
                  <Dropdown
                    options={operatorsFor(condition)}
                    value={condition.operator}
                    ariaLabel={$_('projectSettings.notifications.operator')}
                    on:change={(event) =>
                      updateCondition(condition.id, {
                        operator: event.detail.id as FilterOperator,
                      })}
                  />
                  {#if condition.operator === 'exists'}
                    <span class="px-2 text-sm text-slate-400"
                      >{$_('projectSettings.notifications.noValue')}</span
                    >
                  {:else if fieldFor(condition)?.options}
                    <Dropdown
                      options={(fieldFor(condition)?.options ?? []).map((option) => ({
                        id: option,
                        name: option,
                      }))}
                      value={condition.value}
                      ariaLabel={$_('projectSettings.notifications.value')}
                      on:change={(event) =>
                        updateCondition(condition.id, { value: event.detail.id })}
                    />
                  {:else}
                    <input
                      aria-label={$_('projectSettings.notifications.value')}
                      type={fieldFor(condition)?.type === 'number'
                        ? 'number'
                        : fieldFor(condition)?.type === 'datetime'
                          ? 'datetime-local'
                          : 'text'}
                      step={fieldFor(condition)?.type === 'number' ? '1' : undefined}
                      min={fieldFor(condition)?.type === 'number' ? '0' : undefined}
                      required
                      bind:value={condition.value}
                      class="field-input w-full rounded-md border px-3 py-2 text-sm"
                      placeholder={$_('projectSettings.notifications.value')}
                    />
                  {/if}
                  <button
                    type="button"
                    on:click={() => removeCondition(condition.id)}
                    title={$_('common.delete')}
                    class="justify-self-end rounded-md p-2 text-slate-500 hover:bg-white hover:text-red-600"
                    ><Trash2 class="h-4 w-4" /></button
                  >
                </div>
              {/each}

              <div
                class="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-950 px-4 py-3 text-slate-100"
              >
                <Braces class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <code class="min-w-0 break-all text-xs leading-5">{filterExpression}</code>
              </div>
            </section>
          </div>

          <div class="min-h-0 overflow-y-auto bg-slate-50/50 p-5 sm:p-6">
            <section class="space-y-4">
              <div>
                <h4 class="text-sm font-semibold text-slate-900">
                  {$_('projectSettings.notifications.destinations')}
                </h4>
                <p class="mt-1 text-sm text-slate-500">
                  {$_('projectSettings.notifications.providerDescription')}
                </p>
              </div>
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {#each providers as provider}
                  {@const selectedDestination = selectedChannels.has(provider.id)}
                  <button
                    type="button"
                    on:click={() => toggleTarget(provider.id)}
                    disabled={!selectedDestination &&
                      (provider.id === 'http' || !targetAvailable(provider.id))}
                    aria-pressed={selectedDestination}
                    class="relative flex aspect-square flex-col items-center justify-center gap-2 rounded-md border p-3 text-center transition {selectedDestination
                      ? 'border-sky-600 bg-sky-50 text-sky-950 ring-2 ring-sky-500/30 shadow-sm'
                      : 'border-slate-200 text-slate-600 hover:border-slate-400'} disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {#if selectedDestination}
                      <span
                        class="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-white"
                      >
                        <Check class="h-3 w-3" />
                      </span>
                    {/if}
                    <span
                      class="flex h-10 w-10 items-center justify-center rounded-md {selectedDestination
                        ? 'bg-sky-100 text-sky-700'
                        : 'bg-slate-100 text-slate-600'}"
                    >
                      <svelte:component this={provider.icon} class="h-6 w-6 shrink-0" />
                    </span>
                    <span
                      class="text-sm font-semibold {selectedDestination
                        ? 'text-sky-700'
                        : 'text-slate-700'}"
                    >
                      {provider.name}
                    </span>
                    {#if provider.soon}<span
                        class="absolute right-2 top-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500"
                        >{$_('projectSettings.notifications.soon')}</span
                      >{/if}
                    {#if !provider.soon && provider.id !== 'mail' && !targetAvailable(provider.id)}
                      <span
                        class="absolute bottom-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                      >
                        {$_('projectSettings.notifications.targets.notConfigured')}
                      </span>
                    {/if}
                  </button>
                {/each}
              </div>

              <div class="space-y-3">
                {#each destinations as destination (destination.channel)}
                  <div class="rounded-md border border-slate-200 bg-slate-50 p-4">
                    <div class="flex items-center gap-2">
                      <svelte:component
                        this={targetDefinition(destination.channel).icon}
                        class="h-4 w-4 text-slate-600"
                      />
                      <h5 class="text-sm font-semibold text-slate-900">
                        {targetDefinition(destination.channel).name}
                      </h5>
                    </div>

                    <div class="mt-3">
                      <p class="mb-1 text-sm font-medium text-slate-700">
                        {$_('projectSettings.notifications.templates.template')}
                      </p>
                      <Dropdown
                        options={destinationTemplates(destination.channel).map((template) => ({
                          id: template.id,
                          name: template.name,
                        }))}
                        value={destination.templateId ?? ''}
                        fullWidth
                        ariaLabel={$_('projectSettings.notifications.templates.template')}
                        on:change={(event) =>
                          updateDestination(destination.channel, { templateId: event.detail.id })}
                      />
                    </div>

                    {#if destination.channel === 'mail'}
                      <div class="mt-3">
                        <label
                          for="notification-recipients"
                          class="block text-sm font-medium text-slate-700"
                          >{$_('projectSettings.notifications.recipients')}</label
                        >
                        <input
                          id="notification-recipients"
                          type="text"
                          value={destination.recipients.join(', ')}
                          on:input={(event) =>
                            updateDestination(destination.channel, {
                              recipients: event.currentTarget.value.split(','),
                            })}
                          class="field-input mt-1 w-full rounded-md border px-3 py-2 text-sm"
                          placeholder="ops@example.com, owner@example.com"
                        />
                        <p class="mt-1 text-xs text-slate-500">
                          {$_('projectSettings.notifications.recipientsOverrideHint')}
                        </p>
                      </div>
                    {:else if destination.channel === 'slack'}
                      <div class="mt-3">
                        <label
                          for="provider-channel"
                          class="block text-sm font-medium text-slate-700"
                          >{$_('projectSettings.notifications.providerChannel')}</label
                        >
                        <input
                          id="provider-channel"
                          required
                          value={destination.providerConfig.channel ?? ''}
                          on:input={(event) =>
                            updateDestination(destination.channel, {
                              providerConfig: { channel: event.currentTarget.value },
                            })}
                          class="field-input mt-1 w-full rounded-md border px-3 py-2 text-sm"
                          placeholder="#deployments"
                        />
                      </div>
                    {:else if destination.channel === 'google-chat'}
                      <div class="mt-3 flex items-center gap-2 text-sm text-slate-600">
                        <MessageCircle class="h-4 w-4" />
                        {$_('projectSettings.notifications.targets.configuredWebhook')}
                      </div>
                    {/if}

                    {#if !targetAvailable(destination.channel)}
                      <p class="mt-2 text-xs text-amber-700">
                        {$_('projectSettings.notifications.targets.configureBeforeUse')}
                      </p>
                    {/if}
                  </div>
                {/each}
              </div>
            </section>
          </div>
        </div>

        <div
          class="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4"
        >
          <p class="text-xs text-slate-500">
            {destinationsValid()
              ? $_('projectSettings.notifications.readyToCreate')
              : $_('projectSettings.notifications.destinationsIncomplete')}
          </p>
          <div class="flex gap-2">
            <button
              type="button"
              on:click={() => (modalOpen = false)}
              class="btn-secondary rounded-md px-4 py-2 text-sm font-medium"
              >{$_('common.cancel')}</button
            >
            <button
              type="submit"
              disabled={!destinationsValid()}
              class="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >{editingRuleId
                ? $_('projectSettings.notifications.saveChanges')
                : $_('projectSettings.notifications.create')}</button
            >
          </div>
        </div>
      </form>
    </div>
  </div>
{/if}
