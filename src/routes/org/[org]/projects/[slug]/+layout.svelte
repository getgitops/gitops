<script lang="ts">
  import { page } from '$app/stores';
  import {
    ArrowLeft,
    FolderKanban,
    Info,
    LayoutDashboard,
    ScrollText,
    Shield,
    Users,
  } from 'lucide-svelte';

  export let data: { project: { id: string; name: string; slug: string } };

  $: project = data.project;
  $: orgSlug = $page.params.org;

  $: tabs = [
    {
      label: 'Overview',
      href: `/org/${orgSlug}/projects/${project.slug}/overview`,
      icon: LayoutDashboard,
    },
    { label: 'Información', href: `/org/${orgSlug}/projects/${project.slug}`, icon: Info },
    {
      label: 'Usuarios y Grupos',
      href: `/org/${orgSlug}/projects/${project.slug}/users-groups`,
      icon: Users,
    },
    {
      label: 'Roles y Permisos',
      href: `/org/${orgSlug}/projects/${project.slug}/roles-permissions`,
      icon: Shield,
    },
    {
      label: 'Auditoría',
      href: `/org/${orgSlug}/projects/${project.slug}/audit`,
      icon: ScrollText,
    },
  ];

  $: currentPath = $page.url.pathname;

  function isTabActive(href: string) {
    return currentPath === href;
  }
</script>

<div class="mx-auto w-full max-w-7xl">
  <div class="min-h-130 overflow-hidden border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
    <div class="border-b border-slate-200 px-6 py-4 sm:px-8">
      <a
        href={`/org/${orgSlug}/overview`}
        class="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft class="h-4 w-4" />
        Back to projects
      </a>

      <div class="mt-3 flex items-center gap-2">
        <FolderKanban class="h-5 w-5 text-slate-900" />
        <h2 class="text-lg font-semibold text-slate-900">{project.name}</h2>
      </div>

      <nav class="mt-4 flex flex-wrap gap-2">
        {#each tabs as tab}
          <a
            href={tab.href}
            class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {isTabActive(
              tab.href,
            )
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}"
          >
            <svelte:component this={tab.icon} class="h-3.5 w-3.5" />
            {tab.label}
          </a>
        {/each}
      </nav>
    </div>
    <div class="p-6 sm:p-8">
      <slot />
    </div>
  </div>
</div>
