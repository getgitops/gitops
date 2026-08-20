<script lang="ts">
  import { page } from '$app/stores';
  import {
    BarChart3,
    ChevronDown,
    ChevronRight,
    Database,
    FolderKanban,
    GitBranch,
    Info,
    KeyRound,
    LayoutDashboard,
    Lock,
    PanelLeftClose,
    PanelLeftOpen,
    ScrollText,
    Settings,
    Shield,
    Users,
  } from 'lucide-svelte';
  export let pathname = '/';
  export let isConfigured = false;
  export let collapsed = false;
  export let organizationSlug = 'gitops';
  export let projects: {
    slug: string;
    modules?: { vault: boolean; openreport: boolean; stateiac: boolean };
  }[] = [];

  let currentPath = pathname;

  $: currentProject = projects.find((project) => project.slug === currentProjectSlug) ?? null;

  $: sections = [
    {
      title: 'Inicio',
      items: [
        {
          label: 'Overview',
          href: `/org/${organizationSlug}/overview`,
          icon: LayoutDashboard,
        },
      ],
    },
    ...(currentProject?.modules?.vault
      ? [
          {
            title: 'Seguridad',
            items: [
              {
                label: 'Vault',
                href: `/org/${currentProjectOrgSlug}/projects/${currentProject.slug}/vault`,
                icon: Shield,
              },
            ],
          },
        ]
      : []),
    ...(currentProject?.modules?.openreport
      ? [
          {
            title: 'Analisis',
            items: [
              {
                label: 'Open Report',
                href: `/org/${currentProjectOrgSlug}/projects/${currentProject.slug}/report`,
                icon: BarChart3,
              },
            ],
          },
        ]
      : []),
    ...(currentProject?.modules?.stateiac
      ? [
          {
            title: 'GitOps',
            items: [
              {
                label: 'State IaC',
                href: `/org/${currentProjectOrgSlug}/projects/${currentProject.slug}/state-iac`,
                icon: GitBranch,
              },
            ],
          },
        ]
      : []),
  ];

  const settingsItems = [
    {
      label: 'Projects',
      href: '/settings/projects',
      icon: FolderKanban,
    },
    {
      label: 'Autentication',
      href: '/settings/authentication',
      icon: Shield,
    },
    {
      label: 'Roles & Permissions',
      href: '/settings/roles-permissions',
      icon: Users,
    },
    {
      label: 'System & Backup',
      href: '/settings/system-backup',
      icon: Database,
    },
    {
      label: 'Server Access Keys',
      href: '/settings/server-access-keys',
      icon: KeyRound,
    },
  ];

  let settingsMenuOpen = pathname.startsWith('/settings');
  let projectSettingsMenuOpen = true;

  $: currentProjectOrgSlug = ($page.params.org as string | undefined) ?? organizationSlug;
  $: currentProjectSlug = $page.params.slug as string | undefined;

  $: projectSettingsItems = currentProjectSlug
    ? [
        {
          label: 'Información',
          href: `/org/${currentProjectOrgSlug}/projects/${currentProjectSlug}/settings/overview`,
          icon: Info,
        },
        {
          label: 'Users and Groups',
          href: `/org/${currentProjectOrgSlug}/projects/${currentProjectSlug}/settings/users-groups`,
          icon: Users,
        },
        {
          label: 'Roles and Permissions',
          href: `/org/${currentProjectOrgSlug}/projects/${currentProjectSlug}/settings/roles-permissions`,
          icon: Shield,
        },
        {
          label: 'Audit',
          href: `/org/${currentProjectOrgSlug}/projects/${currentProjectSlug}/settings/audit`,
          icon: ScrollText,
        },
      ]
    : [];

  function isProjectSettingsItemActive(href: string) {
    return currentPath.startsWith(href);
  }

  function isActive(path: string) {
    if (path.startsWith('/settings')) {
      return currentPath.startsWith('/settings');
    }

    return currentPath.startsWith(path);
  }

  function toggleCollapsed() {
    collapsed = !collapsed;
  }

  $: currentPath = $page.url.pathname || pathname;

  $: if (currentPath.startsWith('/settings')) {
    settingsMenuOpen = true;
  }
</script>

<aside class="flex h-full flex-col gap-4">
  <div class="border-b border-slate-200 px-1 pb-4">
    <div class="flex items-center justify-between gap-3">
      {#if !collapsed}
        <div class="min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Organization
          </p>
          <h2 class="mt-1 text-sm font-semibold text-slate-900">GitOps</h2>
        </div>
      {/if}

      <button
        type="button"
        class="btn-secondary inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-600"
        on:click={toggleCollapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {#if collapsed}
          <PanelLeftOpen class="h-4 w-4" />
        {:else}
          <PanelLeftClose class="h-4 w-4" />
        {/if}
      </button>
    </div>
  </div>

  {#if !isConfigured}
    <a
      href="/settings/storage"
      class="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950 transition-colors hover:border-amber-300 hover:bg-amber-100 {collapsed
        ? 'justify-center'
        : 'items-start'}"
      title="Configure a storage backend"
    >
      <div class="flex h-8 w-8 items-center justify-center rounded-md bg-amber-200 text-amber-900">
        <Lock class="h-3.5 w-3.5" />
      </div>
      {#if !collapsed}
        <div class="min-w-0">
          <p class="text-sm font-medium">Setup pending</p>
        </div>
      {/if}
    </a>
  {/if}

  <div class="space-y-4">
    {#each sections as section}
      <section>
        {#if !collapsed}
          <div class="mb-2 px-1">
            <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              {section.title}
            </p>
          </div>
        {/if}

        <div class="space-y-2">
          {#each section.items as item}
            <a
              href={item.href}
              class="group flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors {collapsed
                ? 'justify-center'
                : 'items-center'} {isActive(item.href)
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}"
              title={item.label}
            >
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md {isActive(
                  item.href,
                )
                  ? 'bg-white/10 text-white'
                  : 'bg-slate-100 text-slate-600'}"
              >
                <svelte:component this={item.icon} class="h-3.5 w-3.5" />
              </div>

              {#if !collapsed}
                <p class="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</p>
              {/if}
            </a>
          {/each}
        </div>
      </section>
    {/each}

    {#if currentProjectSlug}
      <section>
        {#if !collapsed}
          <div class="mb-2 px-1">
            <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Proyecto
            </p>
          </div>
        {/if}

        {#if collapsed}
          <a
            href={`/org/${currentProjectOrgSlug}/projects/${currentProjectSlug}/settings/overview`}
            class="group flex items-center justify-center rounded-md border px-3 py-2.5 transition-colors border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            title="Project Settings"
          >
            <div
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600"
            >
              <FolderKanban class="h-3.5 w-3.5" />
            </div>
          </a>
        {:else}
          <div class="space-y-2">
            <button
              type="button"
              class="btn-secondary group flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-slate-700 transition-colors"
              on:click={() => (projectSettingsMenuOpen = !projectSettingsMenuOpen)}
              aria-expanded={projectSettingsMenuOpen}
            >
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600"
              >
                <FolderKanban class="h-3.5 w-3.5" />
              </div>
              <p class="min-w-0 flex-1 truncate text-sm font-medium">Project Settings</p>
              {#if projectSettingsMenuOpen}
                <ChevronDown class="h-4 w-4 shrink-0" />
              {:else}
                <ChevronRight class="h-4 w-4 shrink-0" />
              {/if}
            </button>

            {#if projectSettingsMenuOpen}
              <div class="ml-4 border-l border-slate-200 pl-3">
                <div class="space-y-1">
                  {#each projectSettingsItems as item}
                    <a
                      href={item.href}
                      class="group flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors {isProjectSettingsItemActive(
                        item.href,
                      )
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}"
                    >
                      <svelte:component this={item.icon} class="h-3.5 w-3.5 shrink-0" />
                      <span class="truncate">{item.label}</span>
                    </a>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </section>
    {/if}

    <section class="border-t border-slate-200 pt-4">
      {#if !collapsed}
        <div class="mb-2 px-1">
          <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Sistema
          </p>
        </div>
      {/if}

      {#if collapsed}
        <a
          href="/settings/authentication"
          class="group flex items-center justify-center rounded-md border px-3 py-2.5 transition-colors {isActive(
            '/settings',
          )
            ? 'border-slate-900 bg-slate-900 text-white'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}"
          title="Settings"
        >
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md {isActive(
              '/settings',
            )
              ? 'bg-white/10 text-white'
              : 'bg-slate-100 text-slate-600'}"
          >
            <Settings class="h-3.5 w-3.5" />
          </div>
        </a>
      {:else}
        <div class="space-y-2">
          <button
            type="button"
            class="group flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors {isActive(
              '/settings',
            )
              ? 'btn-primary text-white'
              : 'btn-secondary text-slate-700'}"
            on:click={() => (settingsMenuOpen = !settingsMenuOpen)}
            aria-expanded={settingsMenuOpen}
          >
            <div
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md {isActive(
                '/settings',
              )
                ? 'bg-white/10 text-white'
                : 'bg-slate-100 text-slate-600'}"
            >
              <Settings class="h-3.5 w-3.5" />
            </div>
            <p class="min-w-0 flex-1 truncate text-sm font-medium">Settings</p>
            {#if settingsMenuOpen}
              <ChevronDown class="h-4 w-4 shrink-0" />
            {:else}
              <ChevronRight class="h-4 w-4 shrink-0" />
            {/if}
          </button>

          {#if settingsMenuOpen}
            <div class="ml-4 border-l border-slate-200 pl-3">
              <div class="space-y-1">
                {#each settingsItems as item}
                  <a
                    href={item.href}
                    class="group flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors {isActive(
                      item.href,
                    )
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}"
                  >
                    <svelte:component this={item.icon} class="h-3.5 w-3.5 shrink-0" />
                    <span class="truncate">{item.label}</span>
                  </a>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </section>
  </div>
</aside>
