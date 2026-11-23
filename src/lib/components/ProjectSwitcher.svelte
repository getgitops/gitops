<script lang="ts" module>
  /** What the switcher needs from each project (`projectService.listProjects()` JSON) */
  export type SwitcherProject = {
    id: string;
    name: string;
    slug: string | null;
    description?: string | null;
    updatedAt?: string | Date | null;
    modules?: { vault?: boolean; codereport?: boolean; stateiac?: boolean } | null;
    organization?: { id: string; name: string; slug: string | null } | null;
  };

  const RECENT_KEY = 'gitops:recent-projects';
  const MAX_RECENT = 3;

  function readRecent(): string[] {
    try {
      const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
      return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  function rememberRecent(id: string) {
    try {
      const next = [id, ...readRecent().filter((item) => item !== id)].slice(0, 10);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // no storage: recents are just not kept
    }
  }
</script>

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    ArrowRight,
    Check,
    ChevronsUpDown,
    FolderKanban,
    KeyRound,
    Layers,
    Search,
    ShieldCheck,
  } from '@lucide/svelte';
  import { _, locale } from '#lib/i18n';
  import { relativeTime } from '#lib/format/relative-time';
  import { avatarColor, initials } from '#lib/projects/avatar';

  type Props = {
    projects: SwitcherProject[];
    organizationSlug: string | null;
    organizationName?: string | null;
    projectSlug: string;
  };

  let { projects, organizationSlug, organizationName = null, projectSlug }: Props = $props();

  let open = $state(false);
  let query = $state('');
  let active = $state(0);
  let recentIds = $state<string[]>([]);
  let container = $state<HTMLDivElement>();
  let search = $state<HTMLInputElement>();
  let list = $state<HTMLDivElement>();

  let current = $derived(projects.find((project) => project.slug === projectSlug) ?? null);
  let currentOrgSlug = $derived(current?.organization?.slug ?? organizationSlug);
  let currentOrgName = $derived(current?.organization?.name ?? organizationName);

  const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function matches(project: SwitcherProject) {
    const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const text = normalize(
      `${project.name} ${project.slug ?? ''} ${project.description ?? ''} ${project.organization?.name ?? ''}`,
    );
    return terms.every((term) => text.includes(term));
  }

  const byName = (a: SwitcherProject, b: SwitcherProject) => a.name.localeCompare(b.name);

  /** Sections in display order; the flat list of their items drives keyboard navigation */
  let sections = $derived.by(() => {
    const visible = projects.filter(matches);
    const inOrg = visible.filter(
      (project) => !currentOrgSlug || project.organization?.slug === currentOrgSlug,
    );
    const others = visible.filter((project) => !inOrg.includes(project));
    const result: { key: string; title: string; items: SwitcherProject[] }[] = [];

    if (!query.trim()) {
      const recent = recentIds
        .map((id) => projects.find((project) => project.id === id))
        .filter(
          (project): project is SwitcherProject => Boolean(project) && project!.id !== current?.id,
        )
        .slice(0, MAX_RECENT);
      if (recent.length && projects.length > 5) {
        result.push({ key: 'recent', title: $_('projectSwitcher.recent'), items: recent });
      }
    }

    if (inOrg.length) {
      result.push({
        key: 'org',
        title: currentOrgName
          ? $_('projectSwitcher.inOrganization', { values: { organization: currentOrgName } })
          : $_('projectSwitcher.projects'),
        items: [...inOrg].sort(byName),
      });
    }

    const groups = new Map<string, SwitcherProject[]>();
    for (const project of others) {
      const name = project.organization?.name ?? '—';
      groups.set(name, [...(groups.get(name) ?? []), project]);
    }
    for (const [name, items] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
      result.push({ key: `other:${name}`, title: name, items: items.sort(byName) });
    }

    // a project can be listed twice (recent and its organization): each entry gets its own index
    let index = 0;
    return result.map((section) => ({
      ...section,
      entries: section.items.map((project) => ({ project, index: index++ })),
    }));
  });

  let flat = $derived(sections.flatMap((section) => section.entries.map((entry) => entry.project)));

  function hrefOf(project: SwitcherProject) {
    const org = project.organization?.slug ?? organizationSlug;
    return `/org/${org}/projects/${project.slug}/overview`;
  }

  function moduleList(project: SwitcherProject) {
    const modules = project.modules ?? {};
    return [
      { on: modules.vault !== false, icon: KeyRound, label: 'Vault' },
      { on: modules.codereport !== false, icon: ShieldCheck, label: 'Code Report' },
      { on: modules.stateiac !== false, icon: Layers, label: 'State IaC' },
    ].filter((module) => module.on);
  }

  function updatedLabel(value: SwitcherProject['updatedAt']) {
    return relativeTime(value, $locale);
  }

  async function show() {
    recentIds = readRecent();
    query = '';
    open = true;
    await tick();
    active = Math.max(
      0,
      flat.findIndex((project) => project.id === current?.id),
    );
    search?.focus();
    scrollToActive();
  }

  function hide() {
    open = false;
  }

  function choose(project: SwitcherProject) {
    rememberRecent(project.id);
    hide();
    if (project.id !== current?.id) goto(hrefOf(project));
  }

  function scrollToActive() {
    requestAnimationFrame(() =>
      list?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }),
    );
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      active = flat.length ? (active + 1) % flat.length : 0;
      scrollToActive();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      active = flat.length ? (active - 1 + flat.length) % flat.length : 0;
      scrollToActive();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (flat[active]) choose(flat[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      hide();
    }
  }

  function onWindowClick(event: MouseEvent) {
    if (open && container && !container.contains(event.target as Node)) hide();
  }

  // the current project counts as visited, so it shows up in "recent" from other projects
  onMount(() => {
    if (current) rememberRecent(current.id);
  });

  $effect(() => {
    void query;
    active = 0;
  });
</script>

<svelte:window onclick={onWindowClick} />

<div class="switcher" bind:this={container}>
  <button
    type="button"
    class="trigger"
    class:open
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label={current
      ? $_('projectSwitcher.triggerLabel', { values: { project: current.name } })
      : $_('projectSwitcher.choose')}
    onclick={() => (open ? hide() : show())}
  >
    {#if current}
      <span class="avatar" style="--color: {avatarColor(current.id)}">{initials(current.name)}</span
      >
      <span class="trigger-text">
        <small>{currentOrgName ?? $_('projectSwitcher.label')}</small>
        <strong>{current.name}</strong>
      </span>
    {:else}
      <span class="avatar empty"><FolderKanban class="h-3.5 w-3.5" /></span>
      <span class="trigger-text">
        <small>{$_('projectSwitcher.label')}</small>
        <strong class="placeholder">{$_('projectSwitcher.choose')}</strong>
      </span>
    {/if}
    <ChevronsUpDown class="chevron h-3.5 w-3.5" />
  </button>

  {#if open}
    <div class="panel" role="dialog" aria-label={$_('projectSwitcher.choose')}>
      <label class="search">
        <Search class="h-4 w-4 shrink-0" />
        <input
          bind:this={search}
          bind:value={query}
          type="text"
          placeholder={$_('projectSwitcher.search')}
          aria-label={$_('projectSwitcher.search')}
          aria-controls="project-switcher-list"
          aria-activedescendant={flat[active] ? `project-option-${active}` : undefined}
          role="combobox"
          aria-expanded="true"
          autocomplete="off"
          onkeydown={onKeydown}
        />
        <span class="count"
          >{$_('projectSwitcher.count', { values: { count: projects.length } })}</span
        >
      </label>

      <div class="list" id="project-switcher-list" role="listbox" bind:this={list}>
        {#if projects.length === 0}
          <p class="no-projects">{$_('projectSwitcher.none')}</p>
        {:else if flat.length === 0}
          <p class="no-projects">
            {$_('projectSwitcher.noResults', { values: { query: query.trim() } })}
          </p>
        {/if}

        {#each sections as section (section.key)}
          <p class="section-title">{section.title}</p>
          {#each section.entries as { project, index } (`${section.key}:${project.id}`)}
            {@const isCurrent = project.id === current?.id}
            <a
              href={hrefOf(project)}
              id={`project-option-${index}`}
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
                choose(project);
              }}
            >
              <span class="avatar" style="--color: {avatarColor(project.id)}"
                >{initials(project.name)}</span
              >
              <span class="item-body">
                <span class="item-head">
                  <strong>{project.name}</strong>
                  {#if project.slug}<code>{project.slug}</code>{/if}
                </span>
                <span class="item-description" class:muted={!project.description}>
                  {project.description || $_('projectSwitcher.noDescription')}
                </span>
                <span class="item-meta">
                  {#each moduleList(project) as module (module.label)}
                    {@const Icon = module.icon}
                    <span class="module" title={module.label}>
                      <Icon class="h-3 w-3" />
                      {module.label}
                    </span>
                  {/each}
                  {#if updatedLabel(project.updatedAt)}
                    <span class="updated">
                      {$_('projectSwitcher.updated', {
                        values: { time: updatedLabel(project.updatedAt) },
                      })}
                    </span>
                  {/if}
                </span>
              </span>
              {#if isCurrent}
                <span class="current-tag"
                  ><Check class="h-3 w-3" />{$_('projectSwitcher.current')}</span
                >
              {:else}
                <ArrowRight class="go h-3.5 w-3.5" />
              {/if}
            </a>
          {/each}
        {/each}
      </div>

      <footer class="panel-foot">
        {#if currentOrgSlug}
          <a href={`/org/${currentOrgSlug}/projects`} class="view-all" onclick={hide}>
            <FolderKanban class="h-3.5 w-3.5" />
            {$_('projectSwitcher.viewAll')}
          </a>
        {/if}
        <span class="hints" aria-hidden="true">
          <kbd>↑</kbd><kbd>↓</kbd>
          {$_('projectSwitcher.hintNavigate')}
          <kbd>↵</kbd>
          {$_('projectSwitcher.hintOpen')}
          <kbd>esc</kbd>
        </span>
      </footer>
    </div>
  {/if}
</div>

<style>
  .switcher {
    position: relative;
    min-width: 0;
  }

  /* on mobile the topbar only has room for the search; projects stay reachable from the sidebar link */
  @media (max-width: 767px) {
    .switcher {
      display: none;
    }
  }

  /* Trigger */
  .trigger {
    display: inline-flex;
    max-width: 300px;
    height: 38px;
    align-items: center;
    gap: 10px;
    padding: 0 10px 0 5px;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 10px;
    background: rgb(255 255 255 / 0.025);
    color: #d8d9df;
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

  .trigger-text {
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.2;
  }

  .trigger-text small {
    max-width: 200px;
    overflow: hidden;
    color: #77737a;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trigger-text strong {
    max-width: 200px;
    overflow: hidden;
    color: #ece8ee;
    font-size: 13.5px;
    font-weight: 560;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trigger-text strong.placeholder {
    color: #b9b4bc;
    font-weight: 500;
  }

  .trigger :global(.chevron) {
    flex-shrink: 0;
    margin-left: 2px;
    color: #77737a;
  }

  /* Project avatar: initials on the project's color */
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
    letter-spacing: 0.02em;
  }

  .avatar.empty {
    border: 1px dashed rgb(255 255 255 / 0.18);
    background: transparent;
    color: #8a858d;
  }

  /* Panel */
  .panel {
    position: absolute;
    z-index: 80;
    top: calc(100% + 8px);
    left: 0;
    display: flex;
    width: 440px;
    max-width: calc(100vw - 24px);
    max-height: min(560px, calc(100vh - 90px));
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.1);
    border-radius: 12px;
    background: #17181d;
    box-shadow:
      0 24px 60px rgb(0 0 0 / 0.55),
      inset 0 1px 0 rgb(255 255 255 / 0.04);
  }

  .search {
    display: flex;
    height: 46px;
    flex-shrink: 0;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
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
    font-size: 14px;
    outline: none;
  }

  .panel .search input::placeholder {
    color: #6d6870 !important;
  }

  .count {
    flex-shrink: 0;
    color: #6d6870;
    font-size: 11.5px;
  }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
  }

  .section-title {
    padding: 10px 8px 6px;
    color: #6d6870;
    font-size: 11px;
    font-weight: 560;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .item {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    padding: 9px 10px;
    border: 1px solid transparent;
    border-radius: 9px;
    color: inherit;
    text-decoration: none;
  }

  .item.active {
    border-color: rgb(255 255 255 / 0.06);
    background: rgb(255 255 255 / 0.05);
  }

  .item.current {
    background: rgb(249 93 17 / 0.06);
  }

  .item.current.active {
    border-color: rgb(249 93 17 / 0.22);
  }

  .item .avatar {
    width: 32px;
    height: 32px;
    margin-top: 1px;
    border-radius: 9px;
    font-size: 12px;
  }

  .item-body {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 2px;
  }

  .item-head {
    display: flex;
    min-width: 0;
    align-items: baseline;
    gap: 8px;
  }

  .item-head strong {
    overflow: hidden;
    color: #ece8ee;
    font-size: 13.5px;
    font-weight: 560;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-head code {
    flex-shrink: 0;
    color: #6d6870;
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .item-description {
    overflow: hidden;
    color: #9d98a0;
    font-size: 12.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-description.muted {
    color: #5f5b63;
    font-style: italic;
  }

  .item-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
  }

  .module {
    display: inline-flex;
    height: 19px;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    border: 1px solid rgb(255 255 255 / 0.07);
    border-radius: 5px;
    background: rgb(255 255 255 / 0.03);
    color: #9d98a0;
    font-size: 10.5px;
  }

  .updated {
    color: #6d6870;
    font-size: 11px;
  }

  .current-tag {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 7px;
    border-radius: 999px;
    background: rgb(249 93 17 / 0.14);
    color: #ff9a66;
    font-size: 11px;
    font-weight: 540;
  }

  .item :global(.go) {
    flex-shrink: 0;
    margin-top: 9px;
    color: transparent;
    transition: color 120ms ease;
  }

  .item.active :global(.go) {
    color: #8a858d;
  }

  .no-projects {
    padding: 28px 12px;
    color: #77737a;
    font-size: 13px;
    text-align: center;
  }

  .panel-foot {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 12px;
    border-top: 1px solid rgb(255 255 255 / 0.07);
    background: rgb(255 255 255 / 0.015);
  }

  .view-all {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #c9c4cc;
    font-size: 12.5px;
  }

  .view-all:hover {
    color: #ff9a66;
  }

  .hints {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    color: #6d6870;
    font-size: 11px;
  }

  kbd {
    display: inline-grid;
    min-width: 18px;
    height: 18px;
    place-items: center;
    padding: 0 4px;
    border: 1px solid rgb(255 255 255 / 0.1);
    border-radius: 4px;
    background: rgb(255 255 255 / 0.04);
    color: #9d98a0;
    font-family: inherit;
    font-size: 10px;
  }

  /* medium widths: just the avatar, so it never overlaps the search (after the base rules) */
  @media (max-width: 1100px) {
    .trigger-text {
      display: none;
    }
  }
</style>
