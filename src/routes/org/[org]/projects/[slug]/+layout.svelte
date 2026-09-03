<script lang="ts">
  import { page } from '$app/stores';
  import {
    BarChart3,
    ChevronRight,
    GitBranch,
    Info,
    KeyRound,
    LayoutDashboard,
    ScrollText,
    Shield,
    Users,
  } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

  export let data: {
    project: {
      id: string;
      name: string;
      slug: string;
      organization?: { slug?: string | null } | null;
    };
  };

  $: project = data.project;
  $: orgSlug = project.organization?.slug ?? $page?.params?.org ?? '';

  $: overviewHref = `/org/${orgSlug}/projects/${project.slug}/overview`;

  $: tabs = [
    {
      label: $_('project.layout.overview'),
      href: overviewHref,
      icon: LayoutDashboard,
      subtitle: $_('project.layout.overviewSubtitle'),
    },
    {
      label: 'Vault',
      href: `/org/${orgSlug}/projects/${project.slug}/vault`,
      icon: Shield,
      subtitle: $_('project.layout.vaultSubtitle'),
    },
    {
      label: 'Open Report',
      href: `/org/${orgSlug}/projects/${project.slug}/code-report/dashboard`,
      icon: BarChart3,
      subtitle: $_('project.layout.codeReportSubtitle'),
    },
    {
      label: 'State IaC',
      href: `/org/${orgSlug}/projects/${project.slug}/state-iac`,
      icon: GitBranch,
      subtitle: $_('project.layout.stateIacSubtitle'),
    },
    {
      label: $_('project.layout.information'),
      href: `/org/${orgSlug}/projects/${project.slug}/settings/overview`,
      icon: Info,
      subtitle: $_('project.layout.informationSubtitle'),
    },
    {
      label: $_('project.layout.accessControl'),
      href: `/org/${orgSlug}/projects/${project.slug}/settings/access-control`,
      icon: Users,
      subtitle: $_('project.layout.accessControlSubtitle'),
    },
    {
      label: $_('project.layout.rolesAndPermissions'),
      href: `/org/${orgSlug}/projects/${project.slug}/settings/roles-permissions`,
      icon: Shield,
      subtitle: $_('project.layout.rolesAndPermissionsSubtitle'),
    },
    {
      label: 'Server Access Keys',
      href: `/org/${orgSlug}/projects/${project.slug}/settings/server-access-keys`,
      icon: KeyRound,
      subtitle: $_('project.layout.serverAccessKeysSubtitle'),
    },
    {
      label: $_('project.layout.audit'),
      href: `/org/${orgSlug}/projects/${project.slug}/settings/audit`,
      icon: ScrollText,
      subtitle: $_('project.layout.auditSubtitle'),
    },
  ];

  $: currentPath = $page?.url?.pathname;
  $: currentTab = tabs.find((tab) => tab.href === currentPath) ?? tabs[0];
</script>

<div class="mx-auto w-full max-w-7xl space-y-4">
  <div class="w-full rounded-md border border-slate-200 bg-white px-6 py-4 shadow-sm sm:px-8">
    <div class="flex items-center gap-1.5 text-sm">
      <a href={overviewHref} class="font-medium text-slate-900 hover:underline">
        {project.name}
      </a>
      <ChevronRight class="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span class="text-slate-600">{currentTab.label}</span>
    </div>

    <p class="mt-1 text-sm text-slate-500">{currentTab.subtitle}</p>
  </div>

  <slot />
</div>
