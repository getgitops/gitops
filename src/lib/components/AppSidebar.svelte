<!--
  Sidebar de la app (UI v3), igual que el mock de /brand: selector de contexto arriba, secciones
  planas (Proyecto con sus productos, Organización) y pie con versión, GitDB y modo colapsado.
  Las subpáginas de cada módulo van en pestañas encima del contenido (las pinta el layout).
-->
<script lang="ts">
  import {
    ArrowRight,
    Building2,
    ChevronsUpDown,
    FolderKanban,
    Lock,
    Search,
    ShieldCheck,
  } from '@lucide/svelte';
  import { DropdownMenu, MenuItem } from '#lib/components/ui';
  import SidebarFooter from '#lib/components/SidebarFooter.svelte';
  import { isModuleActive, type NavCategory } from '#lib/navigation';
  import { _ } from '#lib/i18n';

  type SidebarProject = {
    id: string;
    name: string;
    slug: string;
    organization?: { id: string; name: string; slug: string } | null;
  };

  type Props = {
    pathname: string;
    categories: NavCategory[];
    collapsed?: boolean;
    isConfigured?: boolean;
    organizationSlug?: string | null;
    organizationName?: string | null;
    projects?: SidebarProject[];
    currentProjectSlug?: string | null;
    showSyncStatus?: boolean;
    syncStatusHref?: string | null;
    ontogglecollapse?: () => void;
  };

  let {
    pathname,
    categories,
    collapsed = false,
    isConfigured = true,
    organizationSlug = null,
    organizationName = null,
    projects = [],
    currentProjectSlug = null,
    showSyncStatus = false,
    syncStatusHref = null,
    ontogglecollapse,
  }: Props = $props();

  const currentProject = $derived(projects.find((p) => p.slug === currentProjectSlug) ?? null);
  const sidebarCategories = $derived(categories.filter((c) => c.sidebar !== false));

  // Ajustes de GitOps: el árbol solo lo incluye para administradores del clúster (cluster-admin)
  const adminModule = $derived(
    categories.flatMap((c) => c.modules).find((m) => m.base === '/gitops-settings') ?? null,
  );

  // selector de contexto: proyectos agrupados por organización, la actual primero
  let switcherOpen = $state(false);
  let query = $state('');
  $effect(() => {
    if (!switcherOpen) query = '';
  });

  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const projectGroups = $derived.by(() => {
    const q = normalize(query.trim());
    const groups = new Map<
      string,
      { slug: string | null; name: string; projects: SidebarProject[] }
    >();
    for (const project of projects) {
      const org = project.organization;
      const key = org?.id ?? '';
      if (!groups.has(key)) {
        groups.set(key, {
          slug: org?.slug ?? null,
          name: org?.name ?? $_('nav.noOrganization'),
          projects: [],
        });
      }
      const haystack = normalize(`${project.name} ${project.slug} ${org?.name ?? ''}`);
      if (!q || haystack.includes(q)) groups.get(key)!.projects.push(project);
    }
    return [...groups.values()]
      .filter((group) => !q || group.projects.length > 0)
      .sort((a, b) =>
        a.slug === organizationSlug
          ? -1
          : b.slug === organizationSlug
            ? 1
            : a.name.localeCompare(b.name),
      );
  });

  const projectHref = (project: SidebarProject) =>
    `/org/${project.organization?.slug ?? organizationSlug}/projects/${project.slug}/overview`;
</script>

<aside class="flex h-full flex-col p-3">
  <!-- Selector de contexto -->
  <DropdownMenu
    label={$_('nav.selectProject')}
    class="w-72 overflow-hidden p-0"
    initialFocus="input"
    block
    bind:open={switcherOpen}
  >
    {#snippet trigger(props)}
      <button
        {...props}
        class="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/2 p-2 text-left transition-colors hover:border-white/20 aria-expanded:border-white/20"
        title={collapsed ? (currentProject?.name ?? organizationName ?? undefined) : undefined}
      >
        <span
          class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500/15 text-sm"
          aria-hidden="true">🦊</span
        >
        {#if !collapsed}
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs text-fg-subtle"
              >{organizationName ?? $_('nav.noOrganizationSelected')}</span
            >
            <span class="block truncate text-sm font-medium text-white"
              >{currentProject?.name ?? $_('nav.selectProject')}</span
            >
          </span>
          <ChevronsUpDown class="h-4 w-4 shrink-0 text-fg-subtle" />
        {/if}
      </button>
    {/snippet}

    <div class="relative border-b border-white/8">
      <Search
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
      />
      <input
        class="k-input-bare h-10 w-full pl-9 pr-3 text-sm"
        placeholder={$_('nav.searchProjects')}
        aria-label={$_('nav.searchProjects')}
        bind:value={query}
      />
    </div>

    <div class="max-h-80 overflow-y-auto p-1.5">
      {#each projectGroups as group (group.slug ?? '')}
        <div class="mb-1">
          <p class="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-xs font-medium text-fg-subtle">
            <Building2 class="h-3 w-3" />{group.name}
          </p>
          {#each group.projects as project (project.id)}
            <MenuItem
              icon={FolderKanban}
              tone={project.id === currentProject?.id ? 'brand' : 'default'}
              href={projectHref(project)}
            >
              <span class="truncate">{project.name}</span>
            </MenuItem>
          {/each}
        </div>
      {:else}
        <p class="px-2.5 py-6 text-center text-sm text-fg-subtle">
          {query ? $_('nav.noProjectsFound') : $_('nav.noActiveProjects')}
        </p>
      {/each}
    </div>

    {#if organizationSlug}
      <!-- proyectos de la organización seleccionada -->
      <div class="border-t border-white/8 bg-ink-900/60 p-1.5">
        <MenuItem icon={ArrowRight} href={`/org/${organizationSlug}/overview`}
          >{$_('nav.viewAllProjects')}</MenuItem
        >
      </div>
    {/if}
  </DropdownMenu>

  {#if !isConfigured}
    <a
      href={organizationSlug
        ? `/org/${organizationSlug}/settings/storage`
        : '/gitops-settings/orgs'}
      class="mt-3 flex items-center gap-2.5 rounded-xl border border-warn/30 bg-warn/8 p-2.5 text-sm font-medium text-amber-200 transition-colors hover:border-warn/50 {collapsed
        ? 'justify-center'
        : ''}"
      title={$_('sidebar.setupPending')}
      data-sveltekit-preload-data
    >
      <Lock class="h-4 w-4 shrink-0 text-warn" />
      {#if !collapsed}<span class="truncate">{$_('sidebar.setupPending')}</span>{/if}
    </a>
  {/if}

  <nav class="-mx-3 mt-6 flex-1 space-y-6 overflow-y-auto px-3" aria-label={$_('nav.navigation')}>
    {#each sidebarCategories as category, index (category.name)}
      <div>
        {#if !collapsed}
          <p class="k-nav-heading">{category.name}</p>
        {:else if index > 0}
          <div class="k-divider mx-2 mb-3"></div>
        {/if}
        <div class="space-y-0.5">
          {#each category.modules as navModule (navModule.id)}
            <a
              href={navModule.items[0].href}
              class="k-nav-item {collapsed ? 'justify-center px-0' : ''}"
              aria-current={isModuleActive(pathname, navModule) ? 'page' : undefined}
              title={collapsed ? navModule.name : undefined}
              aria-label={collapsed ? navModule.name : undefined}
              data-sveltekit-preload-data
            >
              <navModule.icon class="h-4 w-4 shrink-0" />
              {#if !collapsed}<span class="flex-1 truncate">{navModule.name}</span>{/if}
            </a>
          {/each}
        </div>
      </div>
    {/each}
  </nav>

  <div class="mt-3 space-y-3">
    {#if adminModule}
      <div class="border-t border-white/8 pt-3">
        <a
          href={adminModule.items[0].href}
          class="k-nav-item {collapsed ? 'justify-center px-0' : ''}"
          aria-current={isModuleActive(pathname, adminModule) ? 'page' : undefined}
          title={collapsed ? adminModule.name : undefined}
          aria-label={collapsed ? adminModule.name : undefined}
          data-sveltekit-preload-data
        >
          <ShieldCheck class="h-4 w-4 shrink-0" />
          {#if !collapsed}<span class="flex-1 truncate">{adminModule.name}</span>{/if}
        </a>
      </div>
    {/if}
    <SidebarFooter {collapsed} {showSyncStatus} {syncStatusHref} {ontogglecollapse} />
  </div>
</aside>
