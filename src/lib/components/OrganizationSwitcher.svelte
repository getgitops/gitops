<script lang="ts">
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    ArrowRight,
    Check,
    ChevronsUpDown,
    LayoutGrid,
    Plus,
    Search,
    Settings,
  } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import { avatarColor, initials } from '#lib/projects/avatar';

  type Organization = { id: string; name: string; slug: string; description?: string | null };

  type Props = {
    organizations: Organization[];
    currentSlug: string | null;
    currentName?: string | null;
    /** Projects the user can open, to count them per organization */
    projects?: { organization?: { id: string } | null }[];
    /** First organization settings page the user may open; `null` hides the link */
    settingsHref?: string | null;
    canCreate?: boolean;
    /** Sidebar collapsed: only the avatar, and the panel opens to the right */
    collapsed?: boolean;
  };

  let {
    organizations,
    currentSlug,
    currentName = null,
    projects = [],
    settingsHref = null,
    canCreate = false,
    collapsed = false,
  }: Props = $props();

  let open = $state(false);
  let query = $state('');
  let active = $state(0);
  let trigger = $state<HTMLButtonElement>();
  let panel = $state<HTMLDivElement>();
  let search = $state<HTMLInputElement>();
  let list = $state<HTMLDivElement>();
  let position = $state({ left: 0, top: 0 });

  let current = $derived(
    organizations.find((organization) => organization.slug === currentSlug) ?? null,
  );
  let displayName = $derived(current?.name ?? currentName ?? $_('orgSwitcher.choose'));

  let projectCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const project of projects) {
      const id = project.organization?.id;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  });

  function countLabel(organizationId: string) {
    const count = projectCounts.get(organizationId) ?? 0;
    return count === 1
      ? $_('orgSwitcher.projectCountOne')
      : $_('orgSwitcher.projectCount', { values: { count } });
  }

  const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  let visible = $derived.by(() => {
    const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
    return (
      [...organizations]
        .filter((organization) => {
          if (!terms.length) return true;
          const text = normalize(
            `${organization.name} ${organization.slug} ${organization.description ?? ''}`,
          );
          return terms.every((term) => text.includes(term));
        })
        // the current one first, then alphabetical
        .sort(
          (a, b) =>
            Number(b.slug === currentSlug) - Number(a.slug === currentSlug) ||
            a.name.localeCompare(b.name),
        )
    );
  });

  function place() {
    if (!trigger) return;
    const box = trigger.getBoundingClientRect();
    position = collapsed
      ? { left: box.right + 8, top: box.top }
      : { left: box.left, top: box.bottom + 6 };
  }

  async function show() {
    place();
    query = '';
    open = true;
    await tick();
    active = 0;
    search?.focus();
  }

  function hide() {
    open = false;
  }

  function choose(organization: Organization) {
    hide();
    if (organization.slug !== currentSlug) goto(`/org/${organization.slug}/overview`);
  }

  function scrollToActive() {
    requestAnimationFrame(() =>
      list?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }),
    );
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      active = visible.length ? (active + 1) % visible.length : 0;
      scrollToActive();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      active = visible.length ? (active - 1 + visible.length) % visible.length : 0;
      scrollToActive();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (visible[active]) choose(visible[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      hide();
      trigger?.focus();
    }
  }

  function onWindowClick(event: MouseEvent) {
    const target = event.target as Node;
    if (open && !trigger?.contains(target) && !panel?.contains(target)) hide();
  }

  /** The sidebar scrolls and clips its overflow: the panel lives on <body> */
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  $effect(() => {
    void query;
    active = 0;
  });
</script>

<svelte:window onclick={onWindowClick} onresize={() => open && place()} />

<button
  bind:this={trigger}
  type="button"
  class="trigger"
  class:collapsed
  class:open
  aria-haspopup="dialog"
  aria-expanded={open}
  aria-label={$_('orgSwitcher.triggerLabel', { values: { organization: displayName } })}
  title={collapsed ? displayName : undefined}
  onclick={() => (open ? hide() : show())}
>
  <span class="avatar" style="--color: {avatarColor(current?.id ?? displayName)}"
    >{initials(displayName)}</span
  >
  {#if !collapsed}
    <span class="trigger-text">
      <small>{$_('orgSwitcher.label')}</small>
      <strong>{displayName}</strong>
    </span>
    <ChevronsUpDown class="chevron h-3.5 w-3.5" />
  {/if}
</button>

{#if open}
  <div
    bind:this={panel}
    class="panel"
    role="dialog"
    aria-label={$_('orgSwitcher.choose')}
    style="left: {position.left}px; top: {position.top}px"
    use:portal
  >
    {#if current}
      <div class="current">
        <span class="avatar large" style="--color: {avatarColor(current.id)}"
          >{initials(current.name)}</span
        >
        <span class="current-text">
          <strong>{current.name}</strong>
          <small>
            {countLabel(current.id)}
          </small>
        </span>
      </div>
      {#if settingsHref}
        <div class="actions">
          <a href={settingsHref} class="action" onclick={hide}>
            <Settings class="h-4 w-4" />
            <span>{$_('orgSwitcher.settings')}</span>
            <ArrowRight class="go h-3.5 w-3.5" />
          </a>
        </div>
      {/if}
    {/if}

    {#if organizations.length > 1 || !current}
      <label class="search">
        <Search class="h-4 w-4 shrink-0" />
        <input
          bind:this={search}
          bind:value={query}
          type="text"
          placeholder={$_('orgSwitcher.search')}
          aria-label={$_('orgSwitcher.search')}
          aria-controls="org-switcher-list"
          aria-activedescendant={visible[active] ? `org-option-${active}` : undefined}
          role="combobox"
          aria-expanded="true"
          autocomplete="off"
          onkeydown={onKeydown}
        />
      </label>

      <div class="list" id="org-switcher-list" role="listbox" bind:this={list}>
        <p class="section-title">{$_('orgSwitcher.organizations')}</p>
        {#each visible as organization, index (organization.id)}
          {@const isCurrent = organization.slug === currentSlug}
          <a
            id={`org-option-${index}`}
            href={`/org/${organization.slug}/overview`}
            class="item"
            class:active={index === active}
            class:current={isCurrent}
            role="option"
            aria-selected={isCurrent}
            data-index={index}
            onmouseenter={() => (active = index)}
            onclick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              choose(organization);
            }}
          >
            <span class="avatar" style="--color: {avatarColor(organization.id)}"
              >{initials(organization.name)}</span
            >
            <span class="item-body">
              <strong>{organization.name}</strong>
              <small>
                {organization.slug} · {countLabel(organization.id)}
              </small>
            </span>
            {#if isCurrent}<Check class="check h-4 w-4" />{/if}
          </a>
        {:else}
          <p class="no-results">
            {$_('orgSwitcher.noResults', { values: { query: query.trim() } })}
          </p>
        {/each}
      </div>
    {:else}
      <!-- a single organization: the search would only get in the way, keep Enter/Esc working -->
      <input
        class="sr-only"
        bind:this={search}
        aria-hidden="true"
        tabindex="-1"
        onkeydown={onKeydown}
      />
    {/if}

    <footer class="foot">
      <a href="/org" class="foot-link" onclick={hide}>
        <LayoutGrid class="h-3.5 w-3.5" />
        {$_('orgSwitcher.viewAll')}
      </a>
      {#if canCreate}
        <a href="/org?create=1" class="foot-link" onclick={hide}>
          <Plus class="h-3.5 w-3.5" />
          {$_('orgSwitcher.create')}
        </a>
      {/if}
    </footer>
  </div>
{/if}

<style>
  /* Trigger */
  .trigger {
    display: flex;
    width: 100%;
    height: 44px;
    align-items: center;
    gap: 10px;
    padding: 0 10px 0 7px;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 10px;
    background: rgb(255 255 255 / 0.025);
    color: #d8d9df;
    text-align: left;
    transition:
      border-color 120ms ease,
      background 120ms ease;
  }

  .trigger:hover,
  .trigger.open {
    border-color: rgb(255 255 255 / 0.14);
    background: rgb(255 255 255 / 0.05);
  }

  .trigger:focus-visible {
    outline: 2px solid rgb(249 93 17 / 0.5);
    outline-offset: 2px;
  }

  .trigger.collapsed {
    width: 44px;
    justify-content: center;
    padding: 0;
  }

  .trigger-text {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    line-height: 1.2;
  }

  .trigger-text small {
    color: #77737a;
    font-size: 10.5px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .trigger-text strong {
    overflow: hidden;
    color: #ece8ee;
    font-size: 13.5px;
    font-weight: 560;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trigger :global(.chevron) {
    flex-shrink: 0;
    color: #77737a;
  }

  .avatar {
    display: grid;
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--color) 40%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--color) 18%, transparent);
    color: color-mix(in srgb, var(--color) 70%, white);
    font-size: 11px;
    font-weight: 700;
  }

  .avatar.large {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    font-size: 13px;
  }

  /* Panel (on <body>, fixed) */
  .panel {
    position: fixed;
    z-index: 90;
    display: flex;
    width: 320px;
    max-height: min(520px, calc(100vh - 80px));
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.1);
    border-radius: 12px;
    background: #17181d;
    box-shadow:
      0 24px 60px rgb(0 0 0 / 0.55),
      inset 0 1px 0 rgb(255 255 255 / 0.04);
    color: #c9c4cc;
  }

  .current {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 14px;
  }

  .current-text {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .current-text strong {
    overflow: hidden;
    color: #ece8ee;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .current-text small {
    color: #77737a;
    font-size: 12px;
  }

  .actions {
    padding: 0 6px 6px;
  }

  .action {
    display: flex;
    height: 36px;
    align-items: center;
    gap: 10px;
    padding: 0 10px;
    border-radius: 8px;
    color: #ded9df;
    font-size: 13px;
  }

  .action:hover {
    background: rgb(255 255 255 / 0.05);
    color: #fff;
  }

  .action span {
    flex: 1;
  }

  .action :global(.go) {
    color: #6d6870;
  }

  .search {
    display: flex;
    height: 42px;
    flex-shrink: 0;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border-top: 1px solid rgb(255 255 255 / 0.07);
    border-bottom: 1px solid rgb(255 255 255 / 0.07);
    color: #77737a;
  }

  /* app.css paints every input navy with !important: this wins on specificity */
  .panel .search input {
    min-width: 0;
    flex: 1;
    border: 0 !important;
    background-color: transparent !important;
    color: #ece8ee !important;
    font-size: 13.5px;
    outline: none;
  }

  .panel .search input::placeholder {
    color: #6d6870 !important;
  }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 6px 6px;
  }

  .section-title {
    padding: 8px 8px 6px;
    color: #6d6870;
    font-size: 11px;
    font-weight: 560;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border-radius: 8px;
    color: inherit;
  }

  .item.active {
    background: rgb(255 255 255 / 0.05);
  }

  .item-body {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
  }

  .item-body strong {
    overflow: hidden;
    color: #ece8ee;
    font-size: 13px;
    font-weight: 540;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-body small {
    overflow: hidden;
    color: #6d6870;
    font-size: 11.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item :global(.check) {
    flex-shrink: 0;
    color: #ff8a4c;
  }

  .no-results {
    padding: 18px 8px;
    color: #77737a;
    font-size: 12.5px;
    text-align: center;
  }

  .foot {
    display: flex;
    flex-shrink: 0;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid rgb(255 255 255 / 0.07);
    background: rgb(255 255 255 / 0.015);
  }

  .foot-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #a9a4ac;
    font-size: 12.5px;
  }

  .foot-link:hover {
    color: #ff9a66;
  }
</style>
