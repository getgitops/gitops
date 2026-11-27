<!--
  Formulario de la watchlist del feed de CVEs. Envía a la acción `?/watchlist` de /org/<org>/cves,
  así que funciona igual dentro del modal (con JS) o en línea (`?manage=1`, sin JS). Los selects
  usan `FormSelect` (nativo sin JS, `Select` con JS); el resto de controles son nativos. El buscador del catálogo solo
  oculta opciones (con JS); sin él se ven todas.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import {
    CVE_TECHNOLOGIES,
    OSV_ECOSYSTEMS,
    type TechnologyCategory,
  } from '#lib/cves/technologies.data';
  import { SELECTABLE_SEVERITIES, customFieldValue, severityAtLeast } from '#lib/cves/feed-view';
  import { Field } from '#lib/components/ui';
  import FormSelect from './FormSelect.svelte';
  import { _ } from '#lib/i18n';
  import type { CveWatchlist, WatchlistSuggestion } from '#modules/cve-feed';
  import { Search } from '@lucide/svelte';

  type Props = {
    formId: string;
    action: string;
    watchlist: CveWatchlist;
    severityFloor: string;
    suggestions: WatchlistSuggestion[];
    /** Mensaje de error de la última respuesta sin JS. */
    error?: string | null;
    /** En el modal: cada columna con scroll propio (en línea, la página es la que hace scroll). */
    scrollColumns?: boolean;
    onsubmit?: Parameters<typeof enhance>[1];
  };

  let {
    formId,
    action,
    watchlist,
    severityFloor,
    suggestions,
    error = null,
    scrollColumns = false,
    onsubmit,
  }: Props = $props();

  const followed = $derived(new Set(watchlist.technologies.map((entry) => entry.technologyId)));
  const customEntries = $derived(watchlist.technologies.filter((entry) => entry.custom));
  const severities = $derived(
    SELECTABLE_SEVERITIES.filter(
      (severity) => severityAtLeast(severity, severityFloor) === severity,
    ),
  );
  const selectedSeverity = $derived(severityAtLeast(watchlist.minSeverity, severityFloor));
  const suggestedIds = $derived(suggestions.filter((item) => !followed.has(item.technologyId)));

  let query = $state('');
  let kind = $state<'osv' | 'cpe'>('osv');
  // svelte-ignore state_referenced_locally
  let minSeverity = $state(selectedSeverity);
  const severityOptions = $derived(
    severities.map((severity) => ({ value: severity, label: severityLabel(severity) })),
  );
  const kindOptions = $derived([
    { value: 'osv', label: $_('org.cves.feed.modal.kindOsv') },
    { value: 'cpe', label: $_('org.cves.feed.modal.kindCpe') },
  ]);
  const ecosystemOptions = OSV_ECOSYSTEMS.map((ecosystem) => ({
    value: ecosystem,
    label: ecosystem,
  }));
  const columnScroll = $derived(
    scrollColumns ? 'md:max-h-[calc(90vh-12rem)] md:overflow-y-auto' : '',
  );

  const visible = (name: string, category: string) => {
    const q = query.trim().toLowerCase();
    return !q || name.toLowerCase().includes(q) || category.toLowerCase().includes(q);
  };
  const categoryLabel = (category: TechnologyCategory) =>
    $_(`org.cves.feed.categories.${category}`);
  const severityLabel = (severity: string) => $_(`events.options.cveSeverity.${severity}`);
  const customName = (entry: (typeof customEntries)[number]) =>
    entry.label ??
    (entry.custom?.kind === 'osv'
      ? `${entry.custom.ecosystem}: ${entry.custom.package}`
      : entry.custom?.cpe);
</script>

<form id={formId} method="POST" {action} use:enhance={onsubmit} class="space-y-5">
  {#if error}
    <p role="alert" class="k-badge k-badge-danger h-auto whitespace-normal py-1.5">{error}</p>
  {/if}

  <div class="grid items-start gap-6 md:grid-cols-2">
    <div class="order-2 min-w-0 md:order-none {columnScroll}">
      <section class="space-y-3" aria-labelledby="{formId}-catalog">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 id="{formId}-catalog" class="text-sm font-semibold text-white">
            {$_('org.cves.feed.modal.catalog')}
          </h3>
          <label class="relative block w-full sm:w-64">
            <Search
              class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
            />
            <input
              type="search"
              class="k-input h-9 pl-9"
              placeholder={$_('org.cves.feed.modal.searchPlaceholder')}
              aria-label={$_('org.cves.feed.modal.search')}
              data-autofocus
              bind:value={query}
            />
          </label>
        </div>
        <ul class="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
          {#each CVE_TECHNOLOGIES as technology (technology.id)}
            <li hidden={!visible(technology.name, categoryLabel(technology.category))}>
              <label
                class="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/2.5 px-3 py-2 text-sm hover:border-white/20"
              >
                <input
                  type="checkbox"
                  class="k-checkbox"
                  name="technology"
                  value={technology.id}
                  checked={followed.has(technology.id)}
                />
                <span class="min-w-0 flex-1 truncate text-fg">{technology.name}</span>
                <span class="text-xs text-fg-subtle">{categoryLabel(technology.category)}</span>
              </label>
            </li>
          {/each}
        </ul>
        {#if query.trim() && !CVE_TECHNOLOGIES.some( (t) => visible(t.name, categoryLabel(t.category)) )}
          <p class="text-sm text-fg-subtle">{$_('org.cves.feed.modal.noMatches')}</p>
        {/if}
      </section>
    </div>
    <div class="contents space-y-6 md:block {columnScroll}">
      {#if suggestedIds.length > 0}
        <aside class="order-1 md:order-none">
          <section
            class="space-y-3"
            aria-labelledby="{formId}-suggestions"
            data-testid="cve-feed-suggestions"
          >
            <div>
              <h3 id="{formId}-suggestions" class="text-sm font-semibold text-white">
                {$_('org.cves.feed.modal.suggestions')}
              </h3>
              <p class="k-help">{$_('org.cves.feed.modal.suggestionsHelp')}</p>
            </div>
            <ul class="grid gap-2">
              {#each suggestedIds as suggestion (suggestion.technologyId)}
                <li>
                  <label
                    class="flex cursor-pointer items-center gap-3 rounded-xl border border-brand-500/30 bg-brand-500/5 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      class="k-checkbox"
                      name={suggestion.custom ? 'custom' : 'technology'}
                      value={suggestion.custom
                        ? customFieldValue(suggestion.custom)
                        : suggestion.technologyId}
                    />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-fg">{suggestion.name}</span>
                      <span class="block truncate text-xs text-fg-subtle">
                        {$_(
                          suggestion.services === 1
                            ? 'org.cves.feed.modal.suggestionReasonOne'
                            : 'org.cves.feed.modal.suggestionReasonMany',
                          { values: { package: suggestion.package, count: suggestion.services } },
                        )}
                      </span>
                    </span>
                  </label>
                </li>
              {/each}
            </ul>
          </section>
        </aside>
      {/if}
      <section class="order-3 space-y-3 md:order-none" aria-labelledby="{formId}-custom">
        <div>
          <h3 id="{formId}-custom" class="text-sm font-semibold text-white">
            {$_('org.cves.feed.modal.custom')}
          </h3>
          <p class="k-help">{$_('org.cves.feed.modal.customHelp')}</p>
        </div>
        {#if customEntries.length > 0}
          <ul class="grid gap-2 sm:grid-cols-2">
            {#each customEntries as entry (entry.technologyId)}
              {#if entry.custom}
                <li>
                  <label
                    class="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/2.5 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      class="k-checkbox"
                      name="custom"
                      value={customFieldValue(entry.custom)}
                      checked
                    />
                    <span class="min-w-0 flex-1 truncate font-mono text-xs text-fg">
                      {customName(entry)}
                    </span>
                  </label>
                </li>
              {/if}
            {/each}
          </ul>
        {/if}
        <div class="grid gap-3 sm:grid-cols-[9rem_9rem_1fr]">
          <Field label={$_('org.cves.feed.modal.customKind')}>
            {#snippet children(control)}
              <FormSelect name="newKind" options={kindOptions} bind:value={kind} {...control} />
            {/snippet}
          </Field>
          <Field label={$_('org.cves.feed.modal.ecosystem')}>
            {#snippet children(control)}
              <FormSelect
                name="newEcosystem"
                options={ecosystemOptions}
                value={OSV_ECOSYSTEMS[0]}
                disabled={kind === 'cpe'}
                {...control}
              />
            {/snippet}
          </Field>
          <Field
            label={kind === 'cpe'
              ? $_('org.cves.feed.modal.cpe')
              : $_('org.cves.feed.modal.package')}
            help={kind === 'cpe'
              ? $_('org.cves.feed.modal.cpeHelp')
              : $_('org.cves.feed.modal.packageHelp')}
          >
            {#snippet children(control)}
              <input
                class="k-input font-mono"
                name="newValue"
                autocomplete="off"
                spellcheck="false"
                placeholder={kind === 'cpe' ? 'cpe:2.3:a:vendor:product' : 'lodash'}
                {...control}
              />
            {/snippet}
          </Field>
        </div>
      </section>
      <div class="order-4 md:order-none">
        {@render settings('grid gap-4 sm:grid-cols-2')}
      </div>
    </div>
  </div>
</form>

{#snippet settings(layout: string)}
  <section class="space-y-3 border-t border-white/8 pt-5">
    <div class={layout}>
      <Field
        label={$_('org.cves.feed.modal.minSeverity')}
        help={$_('org.cves.feed.modal.minSeverityHelp')}
      >
        {#snippet children(control)}
          <FormSelect
            name="minSeverity"
            options={severityOptions}
            bind:value={minSeverity}
            {...control}
          />
        {/snippet}
      </Field>
      <Field
        label={$_('org.cves.feed.modal.includeKev')}
        help={$_('org.cves.feed.modal.includeKevHelp')}
      >
        {#snippet children(control)}
          <label class="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              class="k-checkbox"
              name="includeKev"
              checked={watchlist.includeKev}
              {...control}
            />
            {$_('org.cves.feed.modal.includeKevLabel')}
          </label>
        {/snippet}
      </Field>
    </div>
    <p class="text-xs text-fg-subtle">
      {$_('org.cves.feed.modal.floorNotice', {
        values: { severity: severityLabel(severityFloor) },
      })}
    </p>
  </section>
{/snippet}
