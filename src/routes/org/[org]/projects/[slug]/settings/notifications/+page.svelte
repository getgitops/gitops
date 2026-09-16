<script lang="ts">
  import {
    BellRing,
    Braces,
    Hash,
    Mail,
    MessageCircle,
    Plus,
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
    channel: 'mail';
    filters: FilterCondition[];
    recipients: string[];
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

  export let data: { notifications: Rule[]; events: EventDefinition[]; canUpdate: boolean };
  export let form: { error?: string; success?: boolean } | null;

  let modalOpen = false;
  let eventName = data.events[0]?.id ?? '';
  let channel: ProviderId = 'mail';
  let filters: FilterCondition[] = [];
  let conditionSequence = 0;

  $: eventOptions = data.events.map((event) => ({ id: event.id, name: event.name }));
  $: selectedEvent = data.events.find((event) => event.id === eventName) ?? data.events[0];
  $: fieldOptions = (selectedEvent?.fields ?? []).map((field) => ({
    id: field.id,
    name: field.name,
  }));
  const providers = [
    { id: 'mail' as const, name: 'Email', icon: Mail, soon: false },
    { id: 'slack' as const, name: 'Slack', icon: Hash, soon: true },
    { id: 'google-chat' as const, name: 'Google Chat', icon: MessageCircle, soon: true },
    { id: 'http' as const, name: 'HTTP', icon: Webhook, soon: true },
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
    eventName = data.events[0]?.id ?? '';
    channel = 'mail';
    filters = [];
  }

  function openBuilder() {
    resetBuilder();
    modalOpen = true;
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

  $: if (form?.success) modalOpen = false;
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
    <div class="divide-y divide-slate-200 rounded-md border border-slate-200">
      {#each data.notifications as rule (rule.id)}
        <div class="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <Mail class="h-4 w-4 shrink-0 text-slate-500" />
              <p class="truncate text-sm font-semibold text-slate-900">{rule.name}</p>
              <span
                class="rounded-full px-2 py-0.5 text-xs font-medium {rule.enabled
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'}"
              >
                {rule.enabled
                  ? $_('projectSettings.notifications.active')
                  : $_('projectSettings.notifications.inactive')}
              </span>
            </div>
            <p class="mt-1 text-xs text-slate-500">{rule.eventName}</p>
            {#if rule.description}
              <p class="mt-1 text-sm text-slate-600">{rule.description}</p>
            {/if}
            {#if rule.filters.length}
              <p class="mt-2 font-mono text-xs text-slate-500">
                {rule.filters
                  .map((filter) => `${filter.field} ${filter.operator} ${filter.value}`)
                  .join(' AND ')}
              </p>
            {/if}
            <p class="mt-1 break-all text-sm text-slate-600">{rule.recipients.join(', ')}</p>
          </div>
          {#if data.canUpdate}
            <div class="flex shrink-0 items-center gap-2">
              <form method="POST" action="?/toggle">
                <input type="hidden" name="id" value={rule.id} />
                <input type="hidden" name="enabled" value={rule.enabled ? 'false' : 'true'} />
                <button
                  type="submit"
                  class="btn-secondary rounded-md px-3 py-2 text-sm font-medium"
                >
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
                  class="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
              </form>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if modalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6">
    <div
      class="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-md bg-white shadow-2xl"
    >
      <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h3 class="text-lg font-semibold text-slate-900">
            {$_('projectSettings.notifications.newRule')}
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
      <form method="POST" action="?/create" class="flex min-h-0 flex-1 flex-col">
        <input type="hidden" name="eventName" value={eventName} />
        <input type="hidden" name="channel" value={channel} />
        <input
          type="hidden"
          name="filters"
          value={JSON.stringify(
            filters.map(({ field, operator, value }) => ({ field, operator, value })),
          )}
        />

        <div class="min-h-0 flex-1 space-y-7 overflow-y-auto p-5 sm:p-6">
          <section class="space-y-4">
            <div>
              <label for="notification-name" class="block text-sm font-medium text-slate-700"
                >{$_('common.name')}</label
              >
              <input
                id="notification-name"
                name="name"
                required
                class="field-input mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder={$_('projectSettings.notifications.namePlaceholder')}
              />
            </div>
            <div>
              <label for="notification-description" class="block text-sm font-medium text-slate-700"
                >{$_('common.description')}</label
              >
              <textarea
                id="notification-description"
                name="description"
                rows="3"
                class="field-input mt-1 w-full resize-none rounded-md border px-3 py-2 text-sm"
                placeholder={$_('projectSettings.notifications.descriptionPlaceholder')}></textarea>
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
                    updateCondition(condition.id, { operator: event.detail.id as FilterOperator })}
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
                    on:change={(event) => updateCondition(condition.id, { value: event.detail.id })}
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

          <section class="space-y-4 border-t border-slate-200 pt-6">
            <div>
              <h4 class="text-sm font-semibold text-slate-900">
                {$_('projectSettings.notifications.provider')}
              </h4>
              <p class="mt-1 text-sm text-slate-500">
                {$_('projectSettings.notifications.providerDescription')}
              </p>
            </div>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {#each providers as provider}
                <button
                  type="button"
                  on:click={() => (channel = provider.id)}
                  class="relative flex aspect-square flex-col items-center justify-center gap-2 rounded-md border p-3 text-center transition {channel ===
                  provider.id
                    ? 'border-slate-900 bg-slate-50 text-slate-950 ring-1 ring-slate-900'
                    : 'border-slate-200 text-slate-600 hover:border-slate-400'}"
                >
                  <svelte:component this={provider.icon} class="h-6 w-6" />
                  <span class="text-sm font-semibold">{provider.name}</span>
                  {#if provider.soon}<span
                      class="absolute right-2 top-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500"
                      >{$_('projectSettings.notifications.soon')}</span
                    >{/if}
                </button>
              {/each}
            </div>

            {#if channel === 'mail'}
              <div>
                <label
                  for="notification-recipients"
                  class="block text-sm font-medium text-slate-700"
                  >{$_('projectSettings.notifications.recipients')}</label
                >
                <input
                  id="notification-recipients"
                  name="recipients"
                  type="text"
                  required
                  class="field-input mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="ops@example.com, owner@example.com"
                />
                <p class="mt-1 text-xs text-slate-500">
                  {$_('projectSettings.notifications.recipientsHint')}
                </p>
              </div>
            {:else if channel === 'slack' || channel === 'google-chat'}
              <div class="rounded-md border border-slate-200 bg-slate-50 p-4">
                <label for="provider-channel" class="block text-sm font-medium text-slate-700"
                  >{$_('projectSettings.notifications.providerChannel')}</label
                >
                <input
                  id="provider-channel"
                  disabled
                  class="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="#deployments"
                />
              </div>
            {:else}
              <div class="rounded-md border border-slate-200 bg-slate-50 p-4">
                <label for="provider-url" class="block text-sm font-medium text-slate-700"
                  >URL</label
                >
                <input
                  id="provider-url"
                  disabled
                  class="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="https://example.com/webhooks/gitops"
                />
              </div>
            {/if}
          </section>
        </div>

        <div
          class="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4"
        >
          <p class="text-xs text-slate-500">
            {channel === 'mail'
              ? $_('projectSettings.notifications.readyToCreate')
              : $_('projectSettings.notifications.providerSoon')}
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
              disabled={channel !== 'mail'}
              class="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >{$_('projectSettings.notifications.create')}</button
            >
          </div>
        </div>
      </form>
    </div>
  </div>
{/if}
