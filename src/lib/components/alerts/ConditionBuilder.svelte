<script lang="ts">
  import { Plus, X } from '@lucide/svelte';
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

<div class="builder" data-testid="condition-builder">
  <div class="builder-head">
    <fieldset class="segmented" {disabled}>
      <legend class="sr-only">{$_('alerts.editor.matchLabel')}</legend>
      <span class="segmented-label" aria-hidden="true">{$_('alerts.editor.matchLabel')}</span>
      <label class:active={match === 'all'}>
        <input type="radio" name="match" value="all" bind:group={match} />
        {$_('alerts.editor.matchAll')}
      </label>
      <label class:active={match === 'any'}>
        <input type="radio" name="match" value="any" bind:group={match} />
        {$_('alerts.editor.matchAny')}
      </label>
    </fieldset>
  </div>

  {#if conditions.length === 0}
    <p class="empty">{$_('alerts.editor.noConditions')}</p>
  {/if}

  <ol class="rows">
    {#each conditions as condition, index (index)}
      {@const field = fieldOf(condition.field)}
      {#if index > 0}
        <li class="connector" aria-hidden="true">
          <span>{$_(match === 'any' ? 'alerts.summary.or' : 'alerts.summary.and')}</span>
        </li>
      {/if}
      <li
        class="row"
        class:has-error={Object.keys(errors).some((key) => key.startsWith(`conditions.${index}.`))}
        data-testid="condition-row"
      >
        <span class="row-index" aria-hidden="true">{index + 1}</span>

        <div class="cell">
          <label class="sr-only" for="condition-{index}-field">{$_('alerts.editor.field')}</label>
          <select
            id="condition-{index}-field"
            name="conditions.{index}.field"
            class="control select"
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
        </div>

        <div class="cell operator">
          <label class="sr-only" for="condition-{index}-operator"
            >{$_('alerts.editor.operator')}</label
          >
          <select
            id="condition-{index}-operator"
            name="conditions.{index}.operator"
            class="control select"
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
        </div>

        <div class="cell value">
          <span class="sr-only" id="condition-{index}-value-label">{$_('alerts.editor.value')}</span
          >
          <input
            type="hidden"
            name="conditions.{index}.multiple"
            value={isList(condition.operator) ? 'true' : 'false'}
          />
          {#if !field || !needsValue(condition.operator)}
            <p class="no-value" data-input="none">{$_('alerts.editor.noValueNeeded')}</p>
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
              class="control"
              placeholder="0"
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
              class="control"
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
              class="control"
              placeholder={$_('alerts.editor.valuePlaceholder')}
              aria-labelledby="condition-{index}-value-label"
              aria-invalid={Boolean(errors[`conditions.${index}.value`]) || undefined}
              aria-describedby={errorId(index, 'value')}
              value={condition.value}
              {disabled}
              oninput={(event) => setValue(index, event.currentTarget.value)}
            />
          {/if}
        </div>

        <button
          type="submit"
          formaction="?/draft"
          name="intent"
          value="remove_condition:{index}"
          class="remove"
          aria-label={$_('alerts.editor.removeCondition', { values: { index: index + 1 } })}
          title={$_('alerts.editor.removeCondition', { values: { index: index + 1 } })}
          {disabled}
          onclick={(event) => remove(event, index)}
        >
          <X class="h-4 w-4" />
        </button>

        {#each ['field', 'operator', 'value'] as part (part)}
          {#if errors[`conditions.${index}.${part}`]}
            <p id="condition-{index}-{part}-error" class="row-error" role="alert">
              {$_(`alerts.errors.${errors[`conditions.${index}.${part}`]}`)}
            </p>
          {/if}
        {/each}
      </li>
    {/each}
  </ol>

  {#if errors.conditions}
    <p class="row-error" role="alert">{$_(`alerts.errors.${errors.conditions}`)}</p>
  {/if}

  <button
    type="submit"
    formaction="?/draft"
    name="intent"
    value="add_condition"
    class="add"
    disabled={disabled || fields.length === 0}
    onclick={add}
  >
    <Plus class="h-4 w-4" />
    {$_('alerts.editor.addCondition')}
  </button>
</div>

<style>
  .builder {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .builder-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  /* Segmented control for all / any */
  .segmented {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 9px;
    background: rgb(255 255 255 / 0.02);
  }

  .segmented-label {
    padding: 0 8px 0 6px;
    color: #77737a;
    font-size: 12px;
  }

  .segmented label {
    position: relative;
    display: inline-flex;
    height: 26px;
    align-items: center;
    padding: 0 10px;
    border-radius: 6px;
    color: #9d98a0;
    font-size: 12.5px;
    cursor: pointer;
    transition: all 120ms ease;
  }

  .segmented label:hover {
    color: #ece8ee;
  }

  .segmented label.active {
    background: rgb(255 255 255 / 0.09);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
    color: #ece8ee;
  }

  .segmented input {
    position: absolute;
    z-index: 1;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .segmented label:has(input:focus-visible) {
    outline: 2px solid rgb(249 93 17 / 0.5);
  }

  .empty {
    padding: 14px;
    border: 1px dashed rgb(255 255 255 / 0.1);
    border-radius: 9px;
    color: #8a858d;
    font-size: 12.5px;
    line-height: 1.5;
  }

  .rows {
    display: flex;
    flex-direction: column;
  }

  .row {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1.3fr) 32px;
    align-items: start;
    gap: 8px;
    padding: 10px;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 10px;
    background: rgb(255 255 255 / 0.02);
  }

  .row.has-error {
    border-color: rgb(248 113 113 / 0.35);
  }

  @media (max-width: 760px) {
    .row {
      grid-template-columns: 22px minmax(0, 1fr) 32px;
    }

    .row .operator,
    .row .value {
      grid-column: 2 / 3;
    }
  }

  .row-index {
    display: grid;
    width: 22px;
    height: 22px;
    place-items: center;
    margin-top: 7px;
    border-radius: 6px;
    background: rgb(255 255 255 / 0.05);
    color: #8a858d;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .connector {
    display: flex;
    height: 26px;
    align-items: center;
    padding-left: 20px;
  }

  .connector span {
    padding: 1px 8px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 999px;
    background: #141417;
    color: #9d98a0;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .cell {
    min-width: 0;
  }

  .control {
    width: 100%;
    height: 36px;
    padding: 0 10px;
    border: 1px solid rgb(255 255 255 / 0.09);
    border-radius: 8px;
    background: rgb(255 255 255 / 0.025);
    color: #ece8ee;
    font-size: 13px;
    outline: none;
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease;
  }

  .control:focus {
    border-color: rgb(249 93 17 / 0.42);
    box-shadow: 0 0 0 3px rgb(249 93 17 / 0.1);
  }

  .control[aria-invalid='true'] {
    border-color: rgb(248 113 113 / 0.5);
  }

  .control::placeholder {
    color: #6d6870;
  }

  .select {
    padding-right: 28px;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a858d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-position: right 10px center;
    background-repeat: no-repeat;
    cursor: pointer;
  }

  .select option {
    background: #1b1b1f;
  }

  .no-value {
    display: flex;
    height: 36px;
    align-items: center;
    color: #6d6870;
    font-size: 12.5px;
  }

  .remove {
    display: grid;
    width: 32px;
    height: 36px;
    place-items: center;
    border-radius: 8px;
    color: #6d6870;
    transition: all 120ms ease;
  }

  .remove:hover {
    background: rgb(248 113 113 / 0.1);
    color: #f87171;
  }

  .row-error {
    grid-column: 2 / -1;
    color: #f87171;
    font-size: 12px;
  }

  .add {
    display: inline-flex;
    height: 34px;
    align-items: center;
    align-self: flex-start;
    gap: 6px;
    padding: 0 12px;
    border: 1px dashed rgb(255 255 255 / 0.14);
    border-radius: 8px;
    color: #c9c4cc;
    font-size: 13px;
    transition: all 120ms ease;
  }

  .add:hover:not(:disabled) {
    border-color: rgb(249 93 17 / 0.5);
    border-style: solid;
    color: #ff9a66;
  }

  .add:disabled {
    opacity: 0.45;
  }

  /* app.css paints every input, select and textarea navy with !important: these win on specificity */
  .builder .control {
    border-color: rgb(255 255 255 / 0.09) !important;
    background-color: rgb(255 255 255 / 0.025) !important;
    color: #ece8ee !important;
  }

  .builder .control:focus {
    border-color: rgb(249 93 17 / 0.42) !important;
  }

  .builder .control[aria-invalid='true'] {
    border-color: rgb(248 113 113 / 0.5) !important;
  }

  .builder .control::placeholder {
    color: #6d6870 !important;
  }
</style>
