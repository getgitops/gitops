<script lang="ts">
  import '../app.css';
  import { onMount, type Snippet } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { BookOpen, FolderKanban, LogOut, UserRound } from '@lucide/svelte';
  import AppNavbar from '#lib/components/AppNavbar.svelte';
  import AppSidebar from '#lib/components/AppSidebar.svelte';
  import WhatsNewBanner from '#lib/components/WhatsNewBanner.svelte';
  import { CommandPalette, Toaster, type CommandGroup } from '#lib/components/ui';
  import { scrollLock, overlayLayer } from '#lib/components/ui/overlay';
  import { activeItem, buildNavigation, isModuleActive } from '#lib/navigation';
  import { _, setupI18n } from '#lib/i18n';

  let { data, children }: { data: any; children: Snippet } = $props();

  setupI18n();

  const SIDEBAR_KEY = 'gitops-sidebar-collapsed';
  let sidebarCollapsed = $state(false);
  let mobileMenuOpen = $state(false);
  let searchOpen = $state(false);

  onMount(() => {
    try {
      sidebarCollapsed = localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      // sin almacenamiento (modo privado): se queda expandido
    }
  });

  function toggleCollapsed() {
    sidebarCollapsed = !sidebarCollapsed;
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      // preferencia solo de esta sesión
    }
  }

  const pathname = $derived(page.url.pathname);
  const isBareLayout = $derived(
    pathname.startsWith('/auth/') || pathname.startsWith('/bootstrap') || pathname === '/brand',
  );

  // el menú móvil se cierra al navegar
  $effect(() => {
    void pathname;
    mobileMenuOpen = false;
  });

  const categories = $derived(
    buildNavigation(
      {
        organizationSlug: data.organization?.slug ?? null,
        currentProjectSlug: data.currentProjectSlug ?? null,
        projects: data.projects ?? [],
        access: data,
      },
      $_,
    ),
  );

  type ShellProject = {
    id: string;
    name: string;
    slug: string;
    organization?: { id: string; name: string; slug: string } | null;
  };
  const projects: ShellProject[] = $derived(data.projects ?? []);

  // pestañas de sección: las subpáginas del módulo activo, si tiene más de una
  const sectionModule = $derived(
    categories
      .flatMap((category) => category.modules)
      .find((navModule) => navModule.items.length > 1 && isModuleActive(pathname, navModule)) ??
      null,
  );
  const sectionItem = $derived(sectionModule ? activeItem(pathname, sectionModule) : null);

  const searchGroups: CommandGroup[] = $derived.by(() => {
    const orgSlug = data.organization?.slug;
    const groups: CommandGroup[] = [];
    if (projects.length > 0) {
      groups.push({
        label: $_('nav.projects'),
        items: projects.map((project) => ({
          id: `project:${project.slug}`,
          label: project.name,
          hint: project.organization?.name ?? project.slug,
          keywords: project.slug,
          icon: FolderKanban,
          run: () =>
            goto(`/org/${project.organization?.slug ?? orgSlug}/projects/${project.slug}/overview`),
        })),
      });
    }
    groups.push({
      label: $_('nav.navigation'),
      items: categories.flatMap((category) =>
        category.modules.flatMap((navModule) =>
          navModule.items.map((item) => ({
            id: `nav:${item.href}`,
            label: item.label,
            hint: navModule.name === item.label ? category.name : navModule.name,
            icon: item.icon,
            keywords: `${category.name} ${navModule.name}`,
            run: () => goto(item.href),
          })),
        ),
      ),
    });
    groups.push({
      label: $_('nav.account'),
      items: [
        { id: 'profile', label: $_('nav.profile'), icon: UserRound, run: () => goto('/profile') },
        {
          id: 'docs',
          label: $_('nav.howTo'),
          icon: BookOpen,
          run: () => window.open('https://getgitops.com/docs', '_blank', 'noopener'),
        },
        {
          id: 'logout',
          label: $_('nav.signOut'),
          icon: LogOut,
          run: () => window.location.assign('/auth/logout'),
        },
      ],
    });
    return groups;
  });
</script>

{#if isBareLayout}
  <!-- auth, bootstrap y /brand: sin shell (aún con los colores anteriores, salvo /brand) -->
  <div class="flex min-h-screen flex-col bg-[#020813] font-sans text-slate-100">
    {@render children()}
  </div>
{:else}
  <div
    class="flex min-h-screen flex-col bg-ink-950 font-sans text-fg antialiased"
    style:--sidebar-width={sidebarCollapsed ? '4.25rem' : '16rem'}
  >
    <AppNavbar
      user={data.user}
      settingsHref={data.canAccessClusterSettings ? '/gitops-settings/orgs' : null}
      onsearch={data.user ? () => (searchOpen = true) : undefined}
      menuOpen={mobileMenuOpen}
      onmenu={() => (mobileMenuOpen = !mobileMenuOpen)}
    />

    {#if mobileMenuOpen}
      <div
        class="fixed inset-0 top-16 z-20 bg-black/60 backdrop-blur-sm md:hidden"
        aria-hidden="true"
        onclick={() => (mobileMenuOpen = false)}
        use:scrollLock
        use:overlayLayer={() => (mobileMenuOpen = false)}
      ></div>
    {/if}

    <div
      id="app-sidebar"
      class="fixed bottom-0 left-0 top-16 z-20 w-72 border-r border-white/8 bg-ink-950 transition-[translate,width] duration-200 md:w-(--sidebar-width) md:translate-x-0 {mobileMenuOpen
        ? 'translate-x-0'
        : '-translate-x-full'}"
    >
      <AppSidebar
        {pathname}
        {categories}
        {projects}
        collapsed={sidebarCollapsed && !mobileMenuOpen}
        isConfigured={data.isConfigured}
        organizationSlug={data.organization?.slug ?? null}
        organizationName={data.organization?.name ?? null}
        currentProjectSlug={data.currentProjectSlug ?? null}
        showSyncStatus={data.canViewGitDbStatus}
        syncStatusHref={data.canAccessClusterSettings ? '/gitops-settings/database' : null}
        ontogglecollapse={toggleCollapsed}
      />
    </div>

    <main class="min-w-0 flex-1 transition-[padding] duration-200 md:pl-(--sidebar-width)">
      <div class="px-4 py-6 sm:px-6">
        <WhatsNewBanner />
        {#if sectionModule}
          <nav
            id="section-nav"
            aria-label={sectionModule.name}
            class="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-white/8 px-4 sm:-mx-6 sm:px-6"
          >
            {#each sectionModule.items as item (item.href)}
              {@const current = item.href === sectionItem?.href}
              <a
                href={item.href}
                aria-current={current ? 'page' : undefined}
                class="relative flex shrink-0 items-center gap-2 px-3 pb-3 pt-1 text-sm font-medium transition-colors {current
                  ? 'text-white after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500'
                  : 'text-fg-muted hover:text-white'}"
                data-sveltekit-preload-data
              >
                <item.icon class="h-4 w-4 {current ? 'text-brand-400' : ''}" />
                {item.label}
              </a>
            {/each}
          </nav>
        {/if}
        {@render children()}
      </div>
    </main>

    {#if data.user}
      <CommandPalette
        bind:open={searchOpen}
        groups={searchGroups}
        placeholder={$_('nav.searchPlaceholder')}
      />
    {/if}
    <Toaster />
  </div>
{/if}
