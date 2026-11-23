<script lang="ts">
  import { createPageStore } from '#lib/page-store';
  import {
    Activity,
    Box,
    BookOpen,
    ChevronRight,
    Folder,
    LayoutDashboard,
    LogOut,
    LockKeyhole,
    MessageCircle,
    PanelLeftClose,
    PanelLeftOpen,
    Shield,
    SlidersHorizontal,
    UserRound,
  } from '@lucide/svelte';
  import packageJson from '../../../package.json';
  import OrganizationSwitcher from './OrganizationSwitcher.svelte';

  type Project = {
    slug: string;
    name?: string;
    organization?: { id: string } | null;
    modules?: { vault: boolean; codereport: boolean; stateiac: boolean };
  };

  export let pathname = '/';
  export let isConfigured = true;
  export let collapsed = false;
  export let organizationSlug: string | null = null;
  export let organizationName: string | null = null;
  export let organizations: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
  }[] = [];
  export let canCreateOrganization = false;
  export let projects: Project[] = [];
  export let user: { username: string } | null = null;
  export let canReadOrgProjects = false;
  export let canReadOrgUsers = false;
  export let canReadOrgGlobal = false;
  export let canReadOrgAudit = false;
  export let canReadOrgRoles = false;
  export let canReadOrgEvents = false;
  export let canReadOrganizationAlerts = false;
  export let canReadProjectVault = false;
  export let canReadProjectCodeReport = false;
  export let canReadProjectStateIac = false;
  export let canViewGitDbStatus = false;
  export let currentProjectSlug: string | null = null;

  let profileOpen = false;
  let profileMenuRef: HTMLDivElement | undefined;

  $: currentPath = $page?.url?.pathname || pathname;
  $: orgBase = organizationSlug ? `/org/${organizationSlug}` : '';
  $: productProject =
    projects.find((project) => project.slug === currentProjectSlug) ?? projects[0] ?? null;
  $: projectBase =
    organizationSlug && productProject ? `${orgBase}/projects/${productProject.slug}` : null;
  $: userInitials = (user?.username ?? 'John Doe')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  // organization settings live in the organization switcher: first settings tab the user may open
  $: settingsHref = !orgBase
    ? null
    : canReadOrgGlobal
      ? `${orgBase}/settings/global`
      : canReadOrgUsers
        ? `${orgBase}/settings/access-control`
        : canReadOrgRoles
          ? `${orgBase}/settings/roles-permissions`
          : canReadOrganizationAlerts
            ? `${orgBase}/settings/alerts`
            : canReadOrgAudit
              ? `${orgBase}/settings/audit`
              : canReadOrgEvents
                ? `${orgBase}/settings/events`
                : null;

  $: productLinks = [
    {
      label: 'Vault',
      href: projectBase ? `${projectBase}/vault` : `${orgBase}/overview`,
      icon: LockKeyhole,
      active: currentPath.includes('/vault'),
      visible:
        !currentProjectSlug || (canReadProjectVault && productProject?.modules?.vault === true),
    },
    {
      label: 'Code Report',
      href: projectBase ? `${projectBase}/code-report/dashboard` : `${orgBase}/overview`,
      icon: Shield,
      active: currentPath.includes('/code-report'),
      visible:
        !currentProjectSlug ||
        (canReadProjectCodeReport && productProject?.modules?.codereport === true),
      indicator: true,
    },
    {
      label: 'State IaC',
      href: projectBase ? `${projectBase}/state-iac` : `${orgBase}/overview`,
      icon: Box,
      active: currentPath.includes('/state-iac'),
      visible:
        !currentProjectSlug ||
        (canReadProjectStateIac && productProject?.modules?.stateiac === true),
    },
  ];

  function collapseSidebar() {
    collapsed = !collapsed;
  }

  function closeProfileMenu(event: MouseEvent) {
    const target = event.target as Node;
    if (
      profileOpen &&
      profileMenuRef &&
      !profileMenuRef.contains(target) &&
      target instanceof Element &&
      !target.closest('.sidebar-profile-menu')
    ) {
      profileOpen = false;
    }
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);

    return {
      destroy() {
        node.remove();
      },
    };
  }

  const page = createPageStore();
</script>

<svelte:window on:click={closeProfileMenu} />

<div class="sidebar-inner">
  <div class="sidebar-workspace">
    <OrganizationSwitcher
      {organizations}
      currentSlug={organizationSlug}
      currentName={organizationName}
      {projects}
      {settingsHref}
      canCreate={canCreateOrganization}
      {collapsed}
    />
  </div>

  <div class="sidebar-collapse-row">
    <button type="button" on:click={collapseSidebar} aria-label={collapsed ? 'Expand' : 'Collapse'}>
      {#if collapsed}
        <PanelLeftOpen class="h-3.5 w-3.5" />
      {:else}
        <PanelLeftClose class="h-3.5 w-3.5" />
      {/if}
    </button>
  </div>

  {#if !isConfigured}
    <a href={`${orgBase}/settings/global`} class="sidebar-setup" title="Configure storage">
      <Activity class="h-4 w-4" />
      {#if !collapsed}<span>Setup pending</span>{/if}
    </a>
  {/if}

  <nav class="sidebar-navigation" aria-label="Main navigation">
    <a
      href={`${orgBase}/overview`}
      class="sidebar-overview"
      class:active={currentPath === `${orgBase}/overview`}
    >
      <LayoutDashboard class="h-4 w-4" />
      {#if !collapsed}<span>Overview</span>{/if}
    </a>

    {#if canReadOrgProjects}
      <a
        href={`${orgBase}/projects`}
        class="sidebar-overview"
        class:active={currentPath === `${orgBase}/projects`}
        title="Projects"
      >
        <Folder class="h-4 w-4" />
        {#if !collapsed}<span>Projects</span>{/if}
      </a>
    {/if}

    {#if !collapsed}<p class="sidebar-section-label">Products</p>{/if}

    <div class="sidebar-links products">
      {#each productLinks.filter((item) => item.visible) as item}
        <a href={item.href} class:active={item.active} title={item.label}>
          <svelte:component this={item.icon} class="h-4 w-4" />
          {#if !collapsed}
            <span>{item.label}</span>
            {#if item.indicator}<i></i>{/if}
          {/if}
        </a>
      {/each}
    </div>
  </nav>

  <div class="sidebar-bottom">
    {#if canViewGitDbStatus}
      <div class="sync-card" title="GitDB synchronization status">
        <span class="sync-dot"></span>
        {#if !collapsed}
          <span><strong>GitDB</strong><small>Synced · 2m ago</small></span>
          <Activity class="ml-auto h-4 w-4 text-[#8757ff]" />
        {/if}
      </div>
    {/if}

    <div class="sidebar-profile-wrap" bind:this={profileMenuRef}>
      {#if profileOpen}
        <div class="sidebar-profile-menu" use:portal>
          <div class="profile-menu-header">
            <span>{userInitials}</span>
            <div>
              <strong>{user?.username ?? 'John Doe'}</strong>
              <small>Personal account</small>
            </div>
          </div>

          <div class="profile-menu-section">
            <a href="/profile" on:click={() => (profileOpen = false)}>
              <UserRound class="h-4 w-4" />
              <span>Perfil</span>
            </a>
            <a href="/profile" on:click={() => (profileOpen = false)}>
              <SlidersHorizontal class="h-4 w-4" />
              <span>Ajustes</span>
            </a>
          </div>

          <div class="profile-menu-section">
            <a
              href="https://getgitops.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              on:click={() => (profileOpen = false)}
            >
              <BookOpen class="h-4 w-4" />
              <span>Documentación</span>
              <span class="external-indicator">↗</span>
            </a>
            <a
              href="https://getgitops.com/community"
              target="_blank"
              rel="noopener noreferrer"
              on:click={() => (profileOpen = false)}
            >
              <MessageCircle class="h-4 w-4" />
              <span>Soporte en Slack</span>
              <span class="external-indicator">↗</span>
            </a>
            <a href="/changelog" on:click={() => (profileOpen = false)}>
              <Activity class="h-4 w-4" />
              <span>Changelog</span>
            </a>
          </div>

          <div class="profile-menu-footer">
            <span>Version {packageJson.version}</span>
            <a href="/auth/logout" class="logout-link" on:click={() => (profileOpen = false)}>
              <LogOut class="h-4 w-4" />
              Cerrar sesión
            </a>
          </div>
        </div>
      {/if}

      <button
        type="button"
        class="sidebar-profile"
        title={user?.username ?? 'John Doe'}
        aria-expanded={profileOpen}
        on:click={() => (profileOpen = !profileOpen)}
      >
        <span>{userInitials}</span>
        {#if !collapsed}
          <strong>{user?.username ?? 'John Doe'}</strong>
          <ChevronRight class="h-3.5 w-3.5" />
        {/if}
      </button>
    </div>
  </div>
</div>
