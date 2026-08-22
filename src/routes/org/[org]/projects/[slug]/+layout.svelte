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
  } from 'lucide-svelte';

  export let data: { project: { id: string; name: string; slug: string } };

  $: project = data.project;
  $: orgSlug = $page.params.org;

  $: overviewHref = `/org/${orgSlug}/projects/${project.slug}/overview`;

  $: tabs = [
    {
      label: 'Overview',
      href: overviewHref,
      icon: LayoutDashboard,
      subtitle: 'Resumen general del proyecto.',
    },
    {
      label: 'Vault',
      href: `/org/${orgSlug}/projects/${project.slug}/vault`,
      icon: Shield,
      subtitle: 'Secretos, credenciales y controles de acceso del proyecto.',
    },
    {
      label: 'Open Report',
      href: `/org/${orgSlug}/projects/${project.slug}/code-report/services`,
      icon: BarChart3,
      subtitle: 'Reportes de vulnerabilidades y dependencias del proyecto.',
    },
    {
      label: 'State IaC',
      href: `/org/${orgSlug}/projects/${project.slug}/state-iac`,
      icon: GitBranch,
      subtitle: 'Estado de Pulumi y backends de almacenamiento del proyecto.',
    },
    {
      label: 'Información',
      href: `/org/${orgSlug}/projects/${project.slug}/settings/overview`,
      icon: Info,
      subtitle: 'Datos generales, módulos y zona de peligro del proyecto.',
    },
    {
      label: 'Usuarios y Grupos',
      href: `/org/${orgSlug}/projects/${project.slug}/settings/users-groups`,
      icon: Users,
      subtitle: 'Gestiona qué usuarios y grupos tienen acceso a este proyecto.',
    },
    {
      label: 'Roles y Permisos',
      href: `/org/${orgSlug}/projects/${project.slug}/settings/roles-permissions`,
      icon: Shield,
      subtitle: 'Define roles y permisos específicos para este proyecto.',
    },
    {
      label: 'Server Access Keys',
      href: `/org/${orgSlug}/projects/${project.slug}/settings/server-access-keys`,
      icon: KeyRound,
      subtitle: 'Credenciales para que herramientas externas reporten análisis a este proyecto.',
    },
    {
      label: 'Auditoría',
      href: `/org/${orgSlug}/projects/${project.slug}/settings/audit`,
      icon: ScrollText,
      subtitle: 'Historial de cambios y actividad relevante del proyecto.',
    },
  ];

  $: currentPath = $page.url.pathname;
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
