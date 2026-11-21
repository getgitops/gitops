<script lang="ts">
  import { untrack } from 'svelte';
  import {
    Building2,
    Check,
    FolderKanban,
    KeyRound,
    Search,
    ShieldCheck,
    Users,
  } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import type { CatalogEntry } from '#lib/alerts/types';

  /**
   * Event selector as radio cards grouped by module (`name="eventType"`), so it also works without
   * JavaScript. Once an event is chosen the list collapses to that card; "Cambiar" opens it again.
   */
  type Props = {
    catalog: CatalogEntry[];
    value: string;
    disabled?: boolean;
    invalid?: boolean;
    describedBy?: string;
    onchange: (type: string) => void;
  };

  let {
    catalog,
    value,
    disabled = false,
    invalid = false,
    describedBy,
    onchange,
  }: Props = $props();

  const MODULE_ICONS: Record<string, typeof ShieldCheck> = {
    code_report: ShieldCheck,
    vault: KeyRound,
    projects: FolderKanban,
    organization: Building2,
    access: Users,
  };

  let open = $state(untrack(() => !value));
  let query = $state('');

  const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  let selected = $derived(catalog.find((entry) => entry.type === value));
  let groups = $derived(
    Object.entries(
      catalog.reduce<Record<string, CatalogEntry[]>>((acc, entry) => {
        (acc[entry.module] ??= []).push(entry);
        return acc;
      }, {}),
    ),
  );

  function matches(entry: CatalogEntry) {
    const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const text = normalize(
      `${$_(entry.label)} ${$_(entry.description)} ${$_(`org.events.modules.${entry.module}`)}`,
    );
    return terms.every((term) => text.includes(term));
  }

  let anyVisible = $derived(catalog.some(matches));

  function choose(type: string) {
    onchange(type);
    open = false;
    query = '';
  }
</script>

<div class="event-picker" class:invalid>
  {#if selected && !open}
    {@const Icon = MODULE_ICONS[selected.module] ?? ShieldCheck}
    <div class="selected js-only">
      <span class="module-icon"><Icon class="h-4 w-4" /></span>
      <span class="min-w-0 flex-1">
        <span class="module-name">{$_(`org.events.modules.${selected.module}`)}</span>
        <span class="event-name">{$_(selected.label)}</span>
        <span class="event-description">{$_(selected.description)}</span>
      </span>
      {#if !disabled}
        <button type="button" class="change" onclick={() => (open = true)}>
          {$_('alerts.editor.changeEvent')}
        </button>
      {/if}
    </div>
  {/if}

  <div class="event-list" class:collapsed={Boolean(selected) && !open}>
    {#if catalog.length > 6}
      <label class="search js-only">
        <Search class="h-3.5 w-3.5 shrink-0" />
        <!-- svelte-ignore a11y_autofocus -->
        <input
          type="search"
          bind:value={query}
          placeholder={$_('alerts.editor.searchEvents')}
          aria-label={$_('alerts.editor.searchEvents')}
          onkeydown={(event) => {
            // inside the alert form: Enter must filter, never submit (save) the form
            if (event.key === 'Enter') event.preventDefault();
          }}
          autofocus={open && Boolean(selected)}
        />
      </label>
    {/if}

    <div
      class="groups"
      role="radiogroup"
      aria-label={$_('alerts.editor.event')}
      aria-describedby={describedBy}
    >
      {#each groups as [module, entries] (module)}
        {@const Icon = MODULE_ICONS[module] ?? ShieldCheck}
        <div class="group" class:hidden={!entries.some(matches)}>
          <p class="group-title">
            <Icon class="h-3.5 w-3.5" />
            {$_(`org.events.modules.${module}`)}
          </p>
          <div class="options">
            {#each entries as entry (entry.type)}
              <label
                class="option"
                class:active={entry.type === value}
                class:hidden={!matches(entry)}
              >
                <input
                  type="radio"
                  name="eventType"
                  value={entry.type}
                  checked={entry.type === value}
                  aria-label={$_(entry.label)}
                  {disabled}
                  onchange={() => choose(entry.type)}
                />
                <span class="min-w-0 flex-1">
                  <span class="option-name">{$_(entry.label)}</span>
                  <span class="option-description">{$_(entry.description)}</span>
                </span>
                <span class="check" aria-hidden="true"><Check class="h-3 w-3" /></span>
              </label>
            {/each}
          </div>
        </div>
      {/each}
      {#if !anyVisible}
        <p class="empty">{$_('alerts.editor.noEvents', { values: { query: query.trim() } })}</p>
      {/if}
    </div>
  </div>
</div>

<!-- Without JavaScript: the list stays open and the "Cambiar" card is not needed -->
<noscript>
  <style>
    .event-list.collapsed {
      display: block !important;
    }
    .event-picker .js-only {
      display: none !important;
    }
  </style>
</noscript>

<style>
  .event-picker {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .selected {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px;
    border: 1px solid rgb(249 93 17 / 0.28);
    border-radius: 10px;
    background: rgb(249 93 17 / 0.05);
  }

  .module-icon {
    display: grid;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    place-items: center;
    border: 1px solid rgb(249 93 17 / 0.25);
    border-radius: 8px;
    background: rgb(249 93 17 / 0.1);
    color: #ff8a4c;
  }

  .module-name {
    display: block;
    color: #8a858d;
    font-size: 11.5px;
  }

  .event-name {
    display: block;
    margin-top: 1px;
    color: #ece8ee;
    font-size: 14px;
    font-weight: 540;
  }

  .event-description {
    display: block;
    margin-top: 3px;
    color: #8a858d;
    font-size: 12.5px;
    line-height: 1.45;
  }

  .change {
    flex-shrink: 0;
    height: 28px;
    padding: 0 10px;
    border: 1px solid rgb(255 255 255 / 0.1);
    border-radius: 7px;
    background: rgb(255 255 255 / 0.04);
    color: #ded9df;
    font-size: 12.5px;
    transition: background 120ms ease;
  }

  .change:hover {
    background: rgb(255 255 255 / 0.08);
  }

  .event-list.collapsed {
    display: none;
  }

  .search {
    display: flex;
    height: 34px;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    padding: 0 10px;
    border: 1px solid rgb(255 255 255 / 0.09);
    border-radius: 8px;
    background: rgb(255 255 255 / 0.025);
    color: #6d6870;
  }

  .search:focus-within {
    border-color: rgb(249 93 17 / 0.42);
  }

  .search input {
    min-width: 0;
    flex: 1;
    border: 0;
    background: transparent;
    color: #ece8ee;
    font-size: 13px;
    outline: none;
  }

  .groups {
    display: flex;
    max-height: 380px;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    padding-right: 2px;
  }

  .group-title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    color: #77737a;
    font-size: 11.5px;
    font-weight: 560;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  @media (max-width: 640px) {
    .options {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .option {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 9px;
    background: rgb(255 255 255 / 0.018);
    cursor: pointer;
    transition:
      border-color 120ms ease,
      background 120ms ease;
  }

  .option:hover {
    border-color: rgb(255 255 255 / 0.13);
    background: rgb(255 255 255 / 0.035);
  }

  .option:has(input:focus-visible) {
    outline: 2px solid rgb(249 93 17 / 0.5);
    outline-offset: 1px;
  }

  .option.active {
    border-color: rgb(249 93 17 / 0.45);
    background: rgb(249 93 17 / 0.06);
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

  .option-name {
    display: block;
    color: #ded9df;
    font-size: 13px;
    font-weight: 520;
  }

  .option-description {
    display: -webkit-box;
    margin-top: 2px;
    overflow: hidden;
    color: #7f7983;
    font-size: 12px;
    line-height: 1.4;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .check {
    display: grid;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    place-items: center;
    margin-top: 1px;
    border: 1px solid rgb(255 255 255 / 0.15);
    border-radius: 999px;
    color: transparent;
  }

  .option.active .check {
    border-color: #f95d11;
    background: #f95d11;
    color: #fff;
  }

  .invalid .option:not(.active) {
    border-color: rgb(248 113 113 / 0.3);
  }

  .empty {
    padding: 18px 0;
    color: #77737a;
    font-size: 13px;
    text-align: center;
  }

  .hidden {
    display: none;
  }

  /* app.css paints every input, select and textarea navy with !important: these win on specificity */
  .event-picker .search input {
    border: 0 !important;
    background-color: transparent !important;
    color: #ece8ee !important;
  }

  .event-picker .search input::placeholder {
    color: #6d6870 !important;
  }
</style>
