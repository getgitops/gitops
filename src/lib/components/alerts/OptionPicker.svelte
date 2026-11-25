<script lang="ts">
  import { _ } from '#lib/i18n';
  import type { AlertOption } from '#lib/alerts/types';

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
    onchange,
  }: Props = $props();

  let query = $state('');

  const SEARCH_THRESHOLD = 6;

  let visible = $derived(
    query.trim()
      ? options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()))
      : options,
  );

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
</script>

<fieldset
  class="min-w-0 rounded-lg border bg-ink-900/60 px-3 py-2 {invalid
    ? 'border-danger/60'
    : 'border-white/10'}"
  aria-describedby={describedBy}
>
  <legend class="sr-only">{label}</legend>
  {#if options.length > SEARCH_THRESHOLD}
    <input
      type="search"
      class="k-input mb-2 h-8 py-0 text-xs"
      placeholder={$_('alerts.editor.search')}
      aria-label={$_('alerts.editor.searchIn', { values: { label } })}
      aria-controls="{id}-options"
      bind:value={query}
    />
  {/if}
  {#if options.length === 0}
    <p class="text-xs text-fg-subtle">{$_('alerts.editor.noOptions')}</p>
  {:else}
    <div id="{id}-options" class="max-h-40 space-y-1 overflow-y-auto">
      {#each options as option (option.id)}
        <label
          class="flex items-center gap-2 text-sm text-fg"
          class:hidden={!visible.includes(option)}
        >
          <input
            class="k-checkbox {multiple ? '' : 'rounded-full'}"
            type={multiple ? 'checkbox' : 'radio'}
            {name}
            value={option.id}
            checked={selected.includes(option.id)}
            onchange={(event) => toggle(option.id, event.currentTarget.checked)}
          />
          <span class="truncate">{option.label}</span>
        </label>
      {/each}
    </div>
  {/if}
</fieldset>
