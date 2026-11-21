<script lang="ts">
  import { Check, Search } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import type { AlertOption } from '#lib/alerts/types';

  /**
   * Checkbox (or radio) list with search, submitted as plain form inputs under `name`, so it also
   * works without JavaScript.
   */
  type Props = {
    /** Form field name; every checked option is submitted under it. */
    name: string;
    options: AlertOption[];
    selected: string[];
    multiple?: boolean;
    id: string;
    label: string;
    describedBy?: string;
    invalid?: boolean;
    /** Shows a header with the label and how many are selected */
    showHeader?: boolean;
    /** Initial in a circle before each option (people and roles) */
    avatars?: boolean;
    onchange?: (selected: string[]) => void;
  };

  let {
    name,
    options,
    selected,
    multiple = false,
    id,
    label,
    describedBy,
    invalid = false,
    showHeader = false,
    avatars = false,
    onchange,
  }: Props = $props();

  let query = $state('');

  const SEARCH_THRESHOLD = 6;

  // searches the name and the second line (a user's email)
  let visible = $derived.by(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) =>
      `${option.label} ${option.description ?? ''}`.toLowerCase().includes(term),
    );
  });

  function toggle(optionId: string, checked: boolean) {
    const next = multiple
      ? checked
        ? [...selected, optionId]
        : selected.filter((value) => value !== optionId)
      : checked
        ? [optionId]
        : [];
    onchange?.(next);
  }

  const initial = (text: string) => text.trim().slice(0, 1).toUpperCase();
</script>

<fieldset class="picker" class:invalid aria-describedby={describedBy}>
  <legend class="sr-only">{label}</legend>
  {#if showHeader}
    <div class="picker-head" aria-hidden="true">
      <span>{label}</span>
      {#if selected.length}
        <span class="count"
          >{selected.length === 1
            ? $_('alerts.editor.selectedOne')
            : $_('alerts.editor.selectedCount', { values: { count: selected.length } })}</span
        >
      {/if}
    </div>
  {/if}
  {#if options.length > SEARCH_THRESHOLD}
    <label class="search">
      <Search class="h-3.5 w-3.5 shrink-0" />
      <input
        type="search"
        placeholder={$_('alerts.editor.search')}
        aria-label={$_('alerts.editor.searchIn', { values: { label } })}
        aria-controls="{id}-options"
        onkeydown={(event) => {
          // inside the alert form: Enter must filter, never submit (save) the form
          if (event.key === 'Enter') event.preventDefault();
        }}
        bind:value={query}
      />
    </label>
  {/if}
  {#if options.length === 0}
    <p class="empty">{$_('alerts.editor.noOptions')}</p>
  {:else}
    <div id="{id}-options" class="options">
      {#each options as option (option.id)}
        {@const checked = selected.includes(option.id)}
        <label class="option" class:checked class:hidden={!visible.includes(option)}>
          <input
            type={multiple ? 'checkbox' : 'radio'}
            {name}
            value={option.id}
            {checked}
            onchange={(event) => toggle(option.id, event.currentTarget.checked)}
          />
          <span class="box" class:round={!multiple} aria-hidden="true">
            <Check class="h-2.5 w-2.5" strokeWidth={3} />
          </span>
          {#if avatars}<span class="avatar" aria-hidden="true">{initial(option.label)}</span>{/if}
          <span class="text">
            <span class="label">{option.label}</span>
            {#if option.description}<span class="description">{option.description}</span>{/if}
          </span>
        </label>
      {/each}
      {#if query.trim() && visible.length === 0}
        <p class="empty">{$_('alerts.editor.noOptions')}</p>
      {/if}
    </div>
  {/if}
</fieldset>

<style>
  .picker {
    min-width: 0;
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 9px;
    background: rgb(255 255 255 / 0.02);
  }

  .picker.invalid {
    border-color: rgb(248 113 113 / 0.45);
  }

  .picker-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-bottom: 1px solid rgb(255 255 255 / 0.06);
    color: #ded9df;
    font-size: 12.5px;
    font-weight: 540;
  }

  .count {
    padding: 1px 7px;
    border-radius: 999px;
    background: rgb(249 93 17 / 0.12);
    color: #ff9a66;
    font-size: 11px;
    font-weight: 520;
  }

  .search {
    display: flex;
    height: 32px;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
    border-bottom: 1px solid rgb(255 255 255 / 0.06);
    color: #6d6870;
  }

  .search input {
    min-width: 0;
    flex: 1;
    border: 0;
    background: transparent;
    color: #ece8ee;
    font-size: 12.5px;
    outline: none;
  }

  .options {
    max-height: 220px;
    overflow-y: auto;
    padding: 4px;
  }

  .option {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 5px 8px;
    border-radius: 6px;
    color: #c9c4cc;
    font-size: 13px;
    cursor: pointer;
  }

  .option:hover {
    background: rgb(255 255 255 / 0.04);
  }

  .option.checked {
    color: #ece8ee;
  }

  .option input {
    position: absolute;
    z-index: 1;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .option:has(input:focus-visible) {
    outline: 2px solid rgb(249 93 17 / 0.5);
    outline-offset: -2px;
  }

  .box {
    display: grid;
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    place-items: center;
    border: 1px solid rgb(255 255 255 / 0.2);
    border-radius: 4px;
    color: transparent;
    transition: all 100ms ease;
  }

  .box.round {
    border-radius: 999px;
  }

  .option.checked .box {
    border-color: #f95d11;
    background: #f95d11;
    color: #fff;
  }

  .text {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .label,
  .description {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .description {
    color: #77737a;
    font-size: 11.5px;
    line-height: 1.35;
  }

  .avatar {
    display: grid;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    place-items: center;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.07);
    color: #a9a4ac;
    font-size: 10.5px;
    font-weight: 600;
  }

  .empty {
    padding: 10px;
    color: #77737a;
    font-size: 12.5px;
  }

  .hidden {
    display: none;
  }

  /* app.css paints every input, select and textarea navy with !important: these win on specificity */
  .picker .search input {
    border: 0 !important;
    background-color: transparent !important;
    color: #ece8ee !important;
  }

  .picker .search input::placeholder {
    color: #6d6870 !important;
  }
</style>
