<script lang="ts">
  import type { ComponentType } from 'svelte';
  import { page } from '$app/stores';
  import {
    BarChart3,
    Building2,
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
    Layers,
    HardDrive,
    Bot,
    ShieldAlert,
  } from '@lucide/svelte';

  type NavItem = { label: string; href: string; icon: ComponentType };
  type NavModule = { name: string; icon: ComponentType; items: NavItem[] };
  type NavCategory = { name: string; modules: NavModule[] };

  export let pathname = '/';
  export let isConfigured = false;
  export let collapsed = true;
  export let organizationSlug: string | null = null;
  export let organizationName: string | null = null;
  export let currentProjectSlug: string | null = null;
  export let projects: {
    slug: string;
    modules?: { vault: boolean; codereport: boolean; stateiac: boolean };
  }[] = [];

  let currentPath = pathname;
  let openModules: Record<string, boolean> = {};

  $: currentPath = $page?.url?.pathname || pathname;
  // sourced from the server load (parsed from the URL), so it never lags behind or
  // blanks out during client-side navigation like $page.params could
  $: currentProjectOrgSlug = organizationSlug;
  $: currentProject = projects.find((project) => project.slug === currentProjectSlug) ?? null;

  $: projectBase = `/org/${currentProjectOrgSlug}/projects/${currentProjectSlug}`;

  // one JSON-like tree drives the whole sidebar: category > module > items
  $: categories = [
    {
      name: 'Inicio',
      modules: [
        {
          name: 'Overview',
          icon: LayoutDashboard,
          items: organizationSlug
            ? [
                {
                  label: 'Overview',
                  href: `/org/${organizationSlug}/overview`,
                  icon: LayoutDashboard,
                },
                {
                  label: 'CVEs',
                  href: `/org/${organizationSlug}/cves`,
                  icon: ShieldAlert,
                },
              ]
            : [
                {
                  label: 'Seleccionar organización',
                  href: '/cluster-settings/orgs',
                  icon: Building2,
                },
              ],
        },
      ],
    },
    ...(currentProject?.modules?.vault
      ? [
          {
            name: 'Seguridad',
            modules: [
              {
                name: 'Vault',
                icon: Shield,
                items: [{ label: 'Vault', href: `${projectBase}/vault`, icon: Shield }],
              },
            ],
          },
        ]
      : []),
    ...(currentProject?.modules?.codereport
      ? [
          {
            name: 'Analisis',
            modules: [
              {
                name: 'Code Report',
                icon: BarChart3,
                items: [
                  {
                    label: 'Dashboard',
                    href: `${projectBase}/code-report/dashboard`,
                    icon: LayoutDashboard,
                  },
                  { label: 'Services', href: `${projectBase}/code-report/services`, icon: Layers },
                  {
                    label: 'CVEs',
                    href: `/org/${currentProjectOrgSlug}/cves?project=${currentProjectSlug}`,
                    icon: ShieldAlert,
                  },
                  {
                    label: 'Security Policies',
                    href: `${projectBase}/code-report/security-policy`,
                    icon: Shield,
                  },
                  { label: 'History', href: `${projectBase}/code-report/history`, icon: GitBranch },
                  { label: 'Settings', href: `${projectBase}/code-report/settings`, icon: Settings },
                ],
              },
            ],
          },
        ]
      : []),
    ...(currentProject?.modules?.stateiac
      ? [
          {
            name: 'GitOps',
            modules: [
              {
                name: 'State IaC',
                icon: GitBranch,
                items: [
                  { label: 'Stacks', href: `${projectBase}/state-iac/stacks`, icon: Layers },
                  { label: 'Backends', href: `${projectBase}/state-iac/backends`, icon: HardDrive },
                  {
                    label: 'Deployments',
                    href: `${projectBase}/state-iac/deployments`,
                    icon: GitBranch,
                  },
                ],
              },
            ],
          },
        ]
      : []),
    ...(currentProjectSlug
      ? [
          {
            name: 'Proyecto',
            modules: [
              {
                name: 'Project Settings',
                icon: FolderKanban,
                items: [
                  { label: 'Información', href: `${projectBase}/settings/overview`, icon: Info },
                  {
                    label: 'Users and Groups',
                    href: `${projectBase}/settings/users-groups`,
                    icon: Users,
                  },
                  {
                    label: 'Roles and Permissions',
                    href: `${projectBase}/settings/roles-permissions`,
                    icon: Shield,
                  },
                  { label: 'Audit', href: `${projectBase}/settings/audit`, icon: ScrollText },
                  {
                    label: 'Server Keys',
                    href: `${projectBase}/settings/server-keys`,
                    icon: Shield,
                  },
                ],
              },
            ],
          },
        ]
      : []),
    {
      name: 'Sistema',
      modules: [
        ...(organizationSlug
          ? [
              {
                name: 'Organization Settings',
                icon: Settings,
                items: [
                  {
                    label: 'Projects',
                    href: `/org/${organizationSlug}/settings/projects`,
                    icon: FolderKanban,
                  },
                  {
                    label: 'Global',
                    href: `/org/${organizationSlug}/settings/global`,
                    icon: Shield,
                  },
                  {
                    label: 'Users',
                    href: `/org/${organizationSlug}/settings/users`,
                    icon: Users,
                  },
                  {
                    label: 'Roles & Permissions',
                    href: `/org/${organizationSlug}/settings/roles-permissions`,
                    icon: Users,
                  },
                  {
                    label: 'System & Backup',
                    href: `/org/${organizationSlug}/settings/system-backup`,
                    icon: Database,
                  },
                  {
                    label: 'Server Access Keys',
                    href: `/org/${organizationSlug}/settings/server-access-keys`,
                    icon: KeyRound,
                  },
                ],
              },
            ]
          : []),
        {
          name: 'Cluster Settings',
          icon: Building2,
          items: [
            { label: 'Organizations', href: '/cluster-settings/orgs', icon: Building2 },
            {
              label: 'Roles & Permissions',
              href: '/cluster-settings/roles-permissions',
              icon: Shield,
            },
            { label: 'Users', href: '/cluster-settings/users', icon: Users },
            { label: 'Database', href: '/cluster-settings/database', icon: Database },
          ],
        },
      ],
    },
  ] satisfies NavCategory[];

  function isItemActive(href: string) {
    return currentPath.startsWith(href);
  }

  function isModuleActive(navModule: NavModule) {
    return navModule.items.some((item) => isItemActive(item.href));
  }

  function toggleModule(navModule: NavModule) {
    openModules = { ...openModules, [navModule.name]: !(openModules[navModule.name] ?? true) };
  }

  function toggleCollapsed() {
    collapsed = !collapsed;
  }
</script>

<aside class="flex h-full flex-col gap-4">
  <div class="border-b border-slate-200 px-1 pb-4">
    <div class="flex items-center justify-between gap-3">
      {#if !collapsed && organizationName}
        <div class="min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Organization
          </p>
          <h2 class="mt-1 truncate text-sm font-semibold text-slate-900">{organizationName}</h2>
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
      href={organizationSlug
        ? `/org/${organizationSlug}/settings/storage`
        : '/cluster-settings/orgs'}
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
    {#each categories as category (category.name)}
      <section
        class:border-t={category.name === 'Sistema'}
        class:pt-4={category.name === 'Sistema'}
        class="border-slate-200"
      >
        {#if !collapsed}
          <div class="mb-2 px-1">
            <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              {category.name}
            </p>
          </div>
        {/if}

        <div class="space-y-2">
          {#each category.modules as navModule (navModule.name)}
            {#if navModule.items.length === 1}
              {@const item = navModule.items[0]}
              <a
                href={item.href}
                class="group flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors {collapsed
                  ? 'justify-center'
                  : 'items-center'} {isItemActive(item.href)
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}"
                title={navModule.name}
              >
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md {isItemActive(
                    item.href,
                  )
                    ? 'bg-white/10 text-white'
                    : 'bg-slate-100 text-slate-600'}"
                >
                  <svelte:component this={navModule.icon} class="h-3.5 w-3.5" />
                </div>

                {#if !collapsed}
                  <p class="min-w-0 flex-1 truncate text-sm font-medium">{navModule.name}</p>
                {/if}
              </a>
            {:else if collapsed}
              <a
                href={navModule.items[0].href}
                class="group flex items-center justify-center rounded-md border px-3 py-2.5 transition-colors {isModuleActive(
                  navModule,
                )
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}"
                title={navModule.name}
              >
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md {isModuleActive(
                    navModule,
                  )
                    ? 'bg-white/10 text-white'
                    : 'bg-slate-100 text-slate-600'}"
                >
                  <svelte:component this={navModule.icon} class="h-3.5 w-3.5" />
                </div>
              </a>
            {:else}
              <div class="space-y-2">
                <button
                  type="button"
                  class="group flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors {isModuleActive(
                    navModule,
                  )
                    ? 'btn-primary text-white'
                    : 'btn-secondary text-slate-700'}"
                  on:click={() => toggleModule(navModule)}
                  aria-expanded={openModules[navModule.name] ?? true}
                >
                  <div
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md {isModuleActive(
                      navModule,
                    )
                      ? 'bg-white/10 text-white'
                      : 'bg-slate-100 text-slate-600'}"
                  >
                    <svelte:component this={navModule.icon} class="h-3.5 w-3.5" />
                  </div>
                  <p class="min-w-0 flex-1 truncate text-sm font-medium">{navModule.name}</p>
                  {#if openModules[navModule.name] ?? true}
                    <ChevronDown class="h-4 w-4 shrink-0" />
                  {:else}
                    <ChevronRight class="h-4 w-4 shrink-0" />
                  {/if}
                </button>

                {#if openModules[navModule.name] ?? true}
                  <div class="ml-4 border-l border-slate-200 pl-3">
                    <div class="space-y-1">
                      {#each navModule.items as item (item.href)}
                        <a
                          href={item.href}
                          class="group flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors {isItemActive(
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
          {/each}
        </div>
      </section>
    {/each}
  </div>
</aside>
