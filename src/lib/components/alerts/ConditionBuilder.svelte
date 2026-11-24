<script lang="ts">
  import { onMount } from 'svelte';
  import { Plus, Trash2 } from '@lucide/svelte';
  import { Select } from '#lib/components/ui';
  import { _ } from '#lib/i18n';
  import type { Operator } from '#lib/events/catalog';
  import { LIST_OPERATORS, VALUELESS_OPERATORS } from '#lib/alerts/summary';
  import type { AlertOption, CatalogEntry, CatalogField, DraftCondition } from '#lib/alerts/types';
  import OptionPicker from './OptionPicker.svelte';

  /**
   * Builds `conditions[]` from an event definition only: fields, operators, input types and
   * options all come from the catalog, so a new catalog field shows up here unchanged.
   *
   * Every row is a set of named inputs (`conditions.<i>.field|operator|value`), so the form also
   * works without JavaScript; the add/remove buttons then post to `?/draft`.
   */
  type Props = {
    definition: CatalogEntry | undefined;
    conditions: DraftCondition[];
    match: 'all' | 'any';
    referenceOptions: Record<string, AlertOption[]>;
    errors?: Record<string, string>;
    disabled?: boolean;
  };

  let {
    definition,
    conditions = $bindable(),
    match = $bindable(),
    referenceOptions,
    errors = {},
    disabled = false,
  }: Props = $props();

  let fields = $derived(definition?.fields ?? []);

  // Sin JavaScript (y en el HTML del servidor) se pintan <select> nativos para que el formulario
  // siga funcionando; al hidratar se cambian por el Select de la marca, que envía el mismo `name`.
  let hydrated = $state(false);
  onMount(() => (hydrated = true));

  function fieldOptions(current: string) {
    const options = fields.map((option) => ({ value: option.key, label: $_(option.label) }));
    return fieldOf(current) || !current
      ? options
      : [{ value: current, label: current, disabled: true }, ...options];
  }

  function operatorOptions(field: CatalogField | undefined) {
    return (field?.operators ?? []).map((operator) => ({
      value: operator,
      label: $_(`alerts.operators.${operator}`),
    }));
  }

  function fieldOf(key: string): CatalogField | undefined {
    return fields.find((field) => field.key === key);
  }

  function isList(operator: string) {
    return LIST_OPERATORS.includes(operator as Operator);
  }

  function needsValue(operator: string) {
    return operator !== '' && !VALUELESS_OPERATORS.includes(operator as Operator);
  }

  function selectField(index: number, key: string) {
    const field = fieldOf(key);
    conditions[index] = { field: key, operator: field?.operators[0] ?? '', value: '' };
  }

  function selectOperator(index: number, operator: Operator) {
    const current = conditions[index];
    const list = isList(operator);
    const values = Array.isArray(current.value)
      ? current.value
      : current.value === ''
        ? []
        : [String(current.value)];
    conditions[index] = {
      ...current,
      operator,
      value: !needsValue(operator) ? '' : list ? values : (values[0] ?? ''),
    };
  }

  function setValue(index: number, value: DraftCondition['value']) {
    conditions[index] = { ...conditions[index], value };
  }

  function add(event: MouseEvent) {
    event.preventDefault();
    const first = fields[0];
    conditions = [
      ...conditions,
      { field: first?.key ?? '', operator: first?.operators[0] ?? '', value: '' },
    ];
  }

  function remove(event: MouseEvent, index: number) {
    event.preventDefault();
    conditions = conditions.filter((_condition, position) => position !== index);
  }

  function errorId(index: number, part: string) {
    return errors[`conditions.${index}.${part}`] ? `condition-${index}-${part}-error` : undefined;
  }

  function valueList(value: DraftCondition['value']): string[] {
    return Array.isArray(value) ? value.map(String) : value === '' ? [] : [String(value)];
  }

  function dateValue(value: DraftCondition['value']) {
    const text = String(value ?? '');
    return text.length >= 10 ? text.slice(0, 10) : text;
  }
</script>

<div class="space-y-3" data-testid="condition-builder">
  <fieldset class="flex flex-wrap items-center gap-4 text-sm text-fg" {disabled}>
    <legend class="mb-1 text-sm font-medium text-white">{$_('alerts.editor.matchLabel')}</legend>
    <label class="inline-flex items-center gap-2">
      <input
        type="radio"
        name="match"
        value="all"
        class="k-checkbox rounded-full"
        bind:group={match}
      />
      {$_('alerts.editor.matchAll')}
    </label>
    <label class="inline-flex items-center gap-2">
      <input
        type="radio"
        name="match"
        value="any"
        class="k-checkbox rounded-full"
        bind:group={match}
      />
      {$_('alerts.editor.matchAny')}
    </label>
  </fieldset>

  {#if conditions.length === 0}
    <p class="rounded-lg border border-dashed border-white/10 px-3 py-3 text-xs text-fg-subtle">
      {$_('alerts.editor.noConditions')}
    </p>
  {/if}

  <ol class="space-y-3">
    {#each conditions as condition, index (index)}
      {@const field = fieldOf(condition.field)}
      <li
        class="grid gap-3 rounded-xl border border-white/8 bg-ink-900/50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]"
        data-testid="condition-row"
      >
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-fg-muted" for="condition-{index}-field">
            {$_('alerts.editor.field')}
          </label>
          {#if hydrated}
            <div class="**:[[role=combobox]]:h-9">
              <Select
                id="condition-{index}-field"
                name="conditions.{index}.field"
                options={fieldOptions(condition.field)}
                value={condition.field}
                placeholder="—"
                searchable={fields.length > 8}
                aria-invalid={Boolean(errors[`conditions.${index}.field`]) || undefined}
                aria-describedby={errorId(index, 'field')}
                {disabled}
                onchange={(value) => selectField(index, value)}
              />
            </div>
          {:else}
            <select
              id="condition-{index}-field"
              name="conditions.{index}.field"
              class="k-input h-9 py-0"
              value={condition.field}
              aria-invalid={Boolean(errors[`conditions.${index}.field`]) || undefined}
              aria-describedby={errorId(index, 'field')}
              {disabled}
              onchange={(event) => selectField(index, event.currentTarget.value)}
            >
              {#if !field}
                <option value={condition.field} disabled>{condition.field || '—'}</option>
              {/if}
              {#each fields as option (option.key)}
                <option value={option.key}>{$_(option.label)}</option>
              {/each}
            </select>
          {/if}
          {#if errors[`conditions.${index}.field`]}
            <p id="condition-{index}-field-error" class="text-xs text-red-300" role="alert">
              {$_(`alerts.errors.${errors[`conditions.${index}.field`]}`)}
            </p>
          {/if}
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-fg-muted" for="condition-{index}-operator">
            {$_('alerts.editor.operator')}
          </label>
          {#if hydrated}
            <div class="**:[[role=combobox]]:h-9">
              <Select
                id="condition-{index}-operator"
                name="conditions.{index}.operator"
                options={operatorOptions(field)}
                value={condition.operator}
                placeholder="—"
                aria-invalid={Boolean(errors[`conditions.${index}.operator`]) || undefined}
                aria-describedby={errorId(index, 'operator')}
                disabled={disabled || !field}
                onchange={(value) => selectOperator(index, value as Operator)}
              />
            </div>
          {:else}
            <select
              id="condition-{index}-operator"
              name="conditions.{index}.operator"
              class="k-input h-9 py-0"
              value={condition.operator}
              aria-invalid={Boolean(errors[`conditions.${index}.operator`]) || undefined}
              aria-describedby={errorId(index, 'operator')}
              {disabled}
              onchange={(event) => selectOperator(index, event.currentTarget.value as Operator)}
            >
              {#each field?.operators ?? [] as operator (operator)}
                <option value={operator}>{$_(`alerts.operators.${operator}`)}</option>
              {/each}
            </select>
          {/if}
          {#if errors[`conditions.${index}.operator`]}
            <p id="condition-{index}-operator-error" class="text-xs text-red-300" role="alert">
              {$_(`alerts.errors.${errors[`conditions.${index}.operator`]}`)}
            </p>
          {/if}
        </div>

        <div class="flex min-w-0 flex-col gap-1">
          <span class="text-xs font-medium text-fg-muted" id="condition-{index}-value-label">
            {$_('alerts.editor.value')}
          </span>
          <input
            type="hidden"
            name="conditions.{index}.multiple"
            value={isList(condition.operator) ? 'true' : 'false'}
          />
          {#if !field || !needsValue(condition.operator)}
            <p class="py-1.5 text-xs text-fg-subtle" data-input="none">—</p>
          {:else if field.type === 'enum' || field.type === 'reference'}
            <OptionPicker
              id="condition-{index}-value"
              name="conditions.{index}.value"
              label={$_(field.label)}
              multiple={isList(condition.operator)}
              options={field.type === 'enum'
                ? (field.options ?? []).map((option) => ({
                    id: option.value,
                    label: $_(option.label),
                  }))
                : (referenceOptions[field.reference ?? ''] ?? [])}
              selected={valueList(condition.value)}
              invalid={Boolean(errors[`conditions.${index}.value`])}
              describedBy={errorId(index, 'value')}
              onchange={(selected) =>
                setValue(index, isList(condition.operator) ? selected : (selected[0] ?? ''))}
            />
          {:else if field.type === 'number'}
            <input
              type="number"
              step="any"
              name="conditions.{index}.value"
              class="k-input h-9 py-0"
              aria-labelledby="condition-{index}-value-label"
              aria-invalid={Boolean(errors[`conditions.${index}.value`]) || undefined}
              aria-describedby={errorId(index, 'value')}
              value={condition.value}
              {disabled}
              oninput={(event) => setValue(index, event.currentTarget.value)}
            />
          {:else if field.type === 'date'}
            <input
              type="date"
              name="conditions.{index}.value"
              class="k-input h-9 py-0"
              aria-labelledby="condition-{index}-value-label"
              aria-invalid={Boolean(errors[`conditions.${index}.value`]) || undefined}
              aria-describedby={errorId(index, 'value')}
              value={dateValue(condition.value)}
              {disabled}
              oninput={(event) => setValue(index, event.currentTarget.value)}
            />
          {:else}
            <input
              type="text"
              name="conditions.{index}.value"
              class="k-input h-9 py-0"
              aria-labelledby="condition-{index}-value-label"
              aria-invalid={Boolean(errors[`conditions.${index}.value`]) || undefined}
              aria-describedby={errorId(index, 'value')}
              value={condition.value}
              {disabled}
              oninput={(event) => setValue(index, event.currentTarget.value)}
            />
          {/if}
          {#if errors[`conditions.${index}.value`]}
            <p id="condition-{index}-value-error" class="text-xs text-red-300" role="alert">
              {$_(`alerts.errors.${errors[`conditions.${index}.value`]}`)}
            </p>
          {/if}
        </div>

        <div class="flex items-end">
          <button
            type="submit"
            formaction="?/draft"
            name="intent"
            value="remove_condition:{index}"
            class="k-btn k-btn-ghost k-btn-icon hover:text-red-400"
            aria-label={$_('alerts.editor.removeCondition', { values: { index: index + 1 } })}
            {disabled}
            onclick={(event) => remove(event, index)}
          >
            <Trash2 class="h-4 w-4" />
          </button>
        </div>
      </li>
    {/each}
  </ol>

  {#if errors.conditions}
    <p class="text-xs text-red-300" role="alert">{$_(`alerts.errors.${errors.conditions}`)}</p>
  {/if}

  <button
    type="submit"
    formaction="?/draft"
    name="intent"
    value="add_condition"
    class="k-btn k-btn-secondary k-btn-sm"
    disabled={disabled || fields.length === 0}
    onclick={add}
  >
    <Plus class="h-4 w-4" />
    {$_('alerts.editor.addCondition')}
  </button>
</div>
