<script lang="ts">
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
    ShieldAlert,
  } from '@lucide/svelte';
  import { _ } from 'svelte-i18n';

  type NavIcon = typeof Building2;
  type NavItem = { label: string; href: string; icon: NavIcon };
  // `base` is the URL namespace a module owns, used to keep it highlighted and open on any
  // sub-route, including ones with no entry of their own
  type NavModule = { name: string; icon: NavIcon; items: NavItem[]; base?: string };
  type NavCategory = { name: string; modules: NavModule[] };

  export let pathname = '/';
  export let isConfigured = false;
  export let collapsed = true;
  export let organizationSlug: string | null = null;
  export let organizationName: string | null = null;
  export let canAccessClusterSettings = false;
  export let canManageOrganization = false;
  export let canManageProject = false;
  export let canReadOrgProjects = false;
  export let canReadOrgUsers = false;
  export let canReadOrgRoles = false;
  export let canReadOrgGlobal = false;
  export let canReadOrgBackups = false;
  export let canReadOrgServerKeys = false;
  export let canReadOrgAudit = false;
  export let canReadProjectInfo = false;
  export let canReadProjectUsers = false;
  export let canReadProjectRoles = false;
  export let canReadProjectServerKeys = false;
  export let canReadProjectAudit = false;
  export let canReadProjectVault = false;
  export let canReadProjectCodeReport = false;
  export let canReadProjectStateIac = false;
  export let currentProjectSlug: string | null = null;
  export let projects: {
    slug: string;
    modules?: { vault: boolean; codereport: boolean; stateiac: boolean };
  }[] = [];

  let currentPath = pathname;
  let openModules: Record<string, boolean> = {};
  let lastPath: string | null = null;

  $: currentPath = $page?.url?.pathname || pathname;
  // sourced from the server load (parsed from the URL), so it never lags behind or
  // blanks out during client-side navigation like $page.params could
  $: currentProjectOrgSlug = organizationSlug;
  $: currentProject = projects.find((project) => project.slug === currentProjectSlug) ?? null;

  $: projectBase = `/org/${currentProjectOrgSlug}/projects/${currentProjectSlug}`;

  // one JSON-like tree drives the whole sidebar: category > module > items
  $: categories = [
    {
      name: $_('sidebar.categories.inicio'),
      modules: [
        {
          name: $_('sidebar.modules.overview'),
          icon: LayoutDashboard,
          items: organizationSlug
            ? [
                {
                  label: $_('sidebar.items.overview'),
                  href: `/org/${organizationSlug}/overview`,
                  icon: LayoutDashboard,
                },
                {
                  label: $_('sidebar.items.cves'),
                  href: `/org/${organizationSlug}/cves`,
                  icon: ShieldAlert,
                },
              ]
            : [
                {
                  label: $_('sidebar.items.selectOrganization'),
                  href: '/cluster-settings/orgs',
                  icon: Building2,
                },
              ],
        },
      ],
    },
    ...(currentProject?.modules?.vault && canReadProjectVault
      ? [
          {
            name: $_('sidebar.categories.seguridad'),
            modules: [
              {
                name: $_('sidebar.modules.vault'),
                icon: Shield,
                items: [
                  {
                    label: $_('sidebar.modules.vault'),
                    href: `${projectBase}/vault`,
                    icon: Shield,
                  },
                ],
              },
            ],
          },
        ]
      : []),
    ...(currentProject?.modules?.codereport && canReadProjectCodeReport
      ? [
          {
            name: $_('sidebar.categories.analisis'),
            modules: [
              {
                name: $_('sidebar.modules.codeReport'),
                icon: BarChart3,
                base: `${projectBase}/code-report`,
                items: [
                  {
                    label: $_('sidebar.items.dashboard'),
                    href: `${projectBase}/code-report/dashboard`,
                    icon: LayoutDashboard,
                  },
                  {
                    label: $_('sidebar.items.services'),
                    href: `${projectBase}/code-report/services`,
                    icon: Layers,
                  },
                  {
                    label: $_('sidebar.items.cves'),
                    href: `/org/${currentProjectOrgSlug}/cves?project=${currentProjectSlug}`,
                    icon: ShieldAlert,
                  },
                  {
                    label: $_('sidebar.items.securityPolicies'),
                    href: `${projectBase}/code-report/security-policy`,
                    icon: Shield,
                  },
                  {
                    label: $_('sidebar.items.history'),
                    href: `${projectBase}/code-report/history`,
                    icon: GitBranch,
                  },
                  {
                    label: $_('sidebar.items.settings'),
                    href: `${projectBase}/code-report/settings`,
                    icon: Settings,
                  },
                ],
              },
            ],
          },
        ]
      : []),
    ...(currentProject?.modules?.stateiac && canReadProjectStateIac
      ? [
          {
            name: $_('sidebar.categories.gitops'),
            modules: [
              {
                name: $_('sidebar.modules.stateIac'),
                icon: GitBranch,
                items: [
                  {
                    label: $_('sidebar.modules.stateIac'),
                    href: `${projectBase}/state-iac`,
                    icon: GitBranch,
                  },
                ],
              },
            ],
          },
        ]
      : []),
    ...(currentProjectSlug && canManageProject
      ? (() => {
          const items = [
            {
              label: $_('sidebar.items.information'),
              href: `${projectBase}/settings/overview`,
              icon: Info,
              visible: canReadProjectInfo,
            },
            {
              label: $_('sidebar.items.accessControl'),
              href: `${projectBase}/settings/access-control`,
              icon: Users,
              visible: canReadProjectUsers,
            },
            {
              label: $_('sidebar.items.rolesAndPermissions'),
              href: `${projectBase}/settings/roles-permissions`,
              icon: Shield,
              visible: canReadProjectRoles,
            },
            {
              label: $_('sidebar.items.audit'),
              href: `${projectBase}/settings/audit`,
              icon: ScrollText,
              visible: canReadProjectAudit,
            },
            {
              label: $_('sidebar.items.serverKeys'),
              href: `${projectBase}/settings/server-access-keys`,
              icon: Shield,
              visible: canReadProjectServerKeys,
            },
          ]
            .filter((item) => item.visible)
            .map(({ visible, ...item }) => item);

          return items.length > 0
            ? [
                {
                  name: $_('sidebar.categories.proyecto'),
                  modules: [
                    {
                      name: $_('sidebar.modules.projectSettings'),
                      icon: FolderKanban,
                      base: `${projectBase}/settings`,
                      items,
                    },
                  ],
                },
              ]
            : [];
        })()
      : []),
    {
      name: $_('sidebar.categories.organization'),
      modules: [
        ...(organizationSlug && canManageOrganization
          ? (() => {
              const items = [
                {
                  label: $_('sidebar.items.projects'),
                  href: `/org/${organizationSlug}/settings/projects`,
                  icon: FolderKanban,
                  visible: canReadOrgProjects,
                },
                {
                  label: $_('sidebar.items.global'),
                  href: `/org/${organizationSlug}/settings/global`,
                  icon: Shield,
                  visible: canReadOrgGlobal,
                },
                {
                  label: $_('sidebar.items.accessControl'),
                  href: `/org/${organizationSlug}/settings/access-control`,
                  icon: Users,
                  visible: canReadOrgUsers,
                },
                {
                  label: $_('sidebar.items.rolesAndPermissions'),
                  href: `/org/${organizationSlug}/settings/roles-permissions`,
                  icon: Users,
                  visible: canReadOrgRoles,
                },
                {
                  label: $_('sidebar.items.systemAndBackup'),
                  href: `/org/${organizationSlug}/settings/system-backup`,
                  icon: Database,
                  visible: canReadOrgBackups,
                },
                {
                  label: $_('sidebar.items.serverAccessKeys'),
                  href: `/org/${organizationSlug}/settings/server-access-keys`,
                  icon: KeyRound,
                  visible: canReadOrgServerKeys,
                },
                {
                  label: $_('sidebar.items.audit'),
                  href: `/org/${organizationSlug}/settings/audit`,
                  icon: ScrollText,
                  visible: canReadOrgAudit,
                },
              ]
                .filter((item) => item.visible)
                .map(({ visible, ...item }) => item);

              return items.length > 0
                ? [
                    {
                      name: $_('sidebar.modules.organizationSettings'),
                      icon: Settings,
                      base: `/org/${organizationSlug}/settings`,
                      items,
                    },
                  ]
                : [];
            })()
          : []),
        ...(canAccessClusterSettings
          ? [
              {
                name: $_('sidebar.modules.clusterSettings'),
                icon: Building2,
                base: '/cluster-settings',
                items: [
                  {
                    label: $_('sidebar.items.organizations'),
                    href: '/cluster-settings/orgs',
                    icon: Building2,
                  },
                  {
                    label: $_('sidebar.items.rolesAndPermissions'),
                    href: '/cluster-settings/roles-permissions',
                    icon: Shield,
                  },
                  {
                    label: $_('sidebar.items.accessControl'),
                    href: '/cluster-settings/access-control',
                    icon: Users,
                  },
                  {
                    label: $_('sidebar.items.database'),
                    href: '/cluster-settings/database',
                    icon: Database,
                  },
                  {
                    label: $_('sidebar.items.auditLog'),
                    href: '/cluster-settings/audit',
                    icon: ScrollText,
                  },
                ],
              },
            ]
          : []),
      ],
    },
  ].filter((category) => category.modules.length > 0) satisfies NavCategory[];

  // navigating drops manual toggles, so the module owning the new route is the one left open
  $: if (currentPath !== lastPath) {
    lastPath = currentPath;
    openModules = {};
  }

  $: moduleOpenState = Object.fromEntries(
    categories.flatMap((category) =>
      category.modules.map((navModule) => [
        navModule.name,
        openModules[navModule.name] ?? isModuleActive(navModule),
      ]),
    ),
  ) as Record<string, boolean>;

  function isItemActive(href: string) {
    return currentPath.startsWith(href);
  }

  function isModuleActive(navModule: NavModule) {
    if (navModule.base && currentPath.startsWith(navModule.base)) return true;
    return navModule.items.some((item) => isItemActive(item.href));
  }

  function toggleModule(navModule: NavModule) {
    openModules = { ...openModules, [navModule.name]: !moduleOpenState[navModule.name] };
  }

  function toggleCollapsed() {
    collapsed = !collapsed;
  }
</script>

<aside class="flex h-full flex-col gap-5">
  <div class="border-b border-[#101e31] px-1 pb-5">
    <div class="flex items-center justify-between gap-3">
      {#if !collapsed && organizationName}
        <div class="min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#647189]">
            {$_('sidebar.organization')}
          </p>
          <h2 class="mt-2 truncate text-base font-semibold text-white">{organizationName}</h2>
        </div>
      {/if}

      <button
        type="button"
        class="btn-secondary inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-300"
        on:click={toggleCollapsed}
        aria-label={collapsed ? $_('sidebar.expandSidebar') : $_('sidebar.collapseSidebar')}
        title={collapsed ? $_('sidebar.expandSidebar') : $_('sidebar.collapseSidebar')}
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
      data-sveltekit-preload-data
    >
      <div class="flex h-8 w-8 items-center justify-center rounded-md bg-amber-200 text-amber-900">
        <Lock class="h-3.5 w-3.5" />
      </div>
      {#if !collapsed}
        <div class="min-w-0">
          <p class="text-sm font-medium">{$_('sidebar.setupPending')}</p>
        </div>
      {/if}
    </a>
  {/if}

  <div class="space-y-5">
    {#each categories as category, categoryIndex (category.name)}
      <section
        class:border-t={categoryIndex === categories.length - 1}
        class:pt-4={categoryIndex === categories.length - 1}
        class="border-[#101e31]"
      >
        {#if !collapsed}
          <div class="mb-2 px-1">
            <p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#647189]">
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
                aria-current={isItemActive(item.href) ? 'page' : undefined}
                class="group flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors {collapsed
                  ? 'justify-center'
                  : 'items-center'} {isItemActive(item.href)
                  ? 'border-[#14305c] bg-[#0e1c31] font-semibold text-white shadow-[inset_0_0_24px_rgba(36,87,255,0.12)]'
                  : 'border-[#142236] bg-[#071323]/65 text-slate-200 hover:border-[#263b58] hover:bg-[#0e1c31]'}"
                title={navModule.name}
                data-sveltekit-preload-data
              >
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {isItemActive(
                    item.href,
                  )
                    ? 'bg-[#082862] text-[#1875ff]'
                    : 'bg-transparent text-slate-300'}"
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
                data-sveltekit-preload-data
                class="group flex items-center justify-center rounded-lg border px-3 py-2.5 transition-colors {isModuleActive(
                  navModule,
                )
                  ? 'border-[#14305c] bg-[#0e1c31] text-white'
                  : 'border-[#142236] bg-[#071323]/65 text-slate-200 hover:border-[#263b58] hover:bg-[#0e1c31]'}"
                title={navModule.name}
              >
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {isModuleActive(
                    navModule,
                  )
                    ? 'bg-[#082862] text-[#1875ff]'
                    : 'bg-transparent text-slate-300'}"
                >
                  <svelte:component this={navModule.icon} class="h-3.5 w-3.5" />
                </div>
              </a>
            {:else}
              <div class="space-y-2">
                <button
                  type="button"
                  class="group flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors {isModuleActive(
                    navModule,
                  )
                    ? 'border-[#14305c] bg-[#0e1c31] text-white shadow-[inset_0_0_24px_rgba(36,87,255,0.12)]'
                    : 'border-[#142236] bg-[#071323]/65 text-slate-200 hover:border-[#263b58] hover:bg-[#0e1c31]'}"
                  on:click={() => toggleModule(navModule)}
                  aria-expanded={moduleOpenState[navModule.name]}
                >
                  <div
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {isModuleActive(
                      navModule,
                    )
                      ? 'bg-transparent text-slate-300'
                      : 'bg-transparent text-slate-300'}"
                  >
                    <svelte:component this={navModule.icon} class="h-3.5 w-3.5" />
                  </div>
                  <p class="min-w-0 flex-1 truncate text-sm font-medium">{navModule.name}</p>
                  {#if moduleOpenState[navModule.name]}
                    <ChevronDown class="h-4 w-4 shrink-0" />
                  {:else}
                    <ChevronRight class="h-4 w-4 shrink-0" />
                  {/if}
                </button>

                {#if moduleOpenState[navModule.name]}
                  <div class="ml-5 border-l border-[#142236] pl-3">
                    <div class="space-y-1">
                      {#each navModule.items as item (item.href)}
                        <a
                          href={item.href}
                          aria-current={isItemActive(item.href) ? 'page' : undefined}
                          class="group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors {isItemActive(
                            item.href,
                          )
                            ? 'bg-[#062059] font-semibold text-[#0d7dff] before:absolute before:-right-1 before:top-1/2 before:h-1 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-[#0d7dff]'
                            : 'text-slate-300 hover:bg-[#0e1c31] hover:text-white'}"
                        >
                          <svelte:component
                            this={item.icon}
                            class="h-3.5 w-3.5 shrink-0 {isItemActive(item.href)
                              ? 'text-[color:var(--primary)]'
                              : ''}"
                          />
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
