<script lang="ts">
  import {
    ArrowRight,
    BarChart3,
    FolderKanban,
    GitBranch,
    KeyRound,
    Shield,
    UserPlus,
  } from 'lucide-svelte';
  import { page } from '$app/stores';

  type ProjectModules = {
    vault: boolean;
    openreport: boolean;
    stateiac: boolean;
  };

  type ProjectRow = {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    status: 'active' | 'inactive';
    modules: ProjectModules;
  };

  type ModuleInfo = {
    key: keyof ProjectModules;
    label: string;
    description: string;
    href: string;
    icon: typeof Shield;
  };

  export let data: { project: ProjectRow };

  $: project = data.project;
  $: orgSlug = $page.params.org;

  $: moduleInfo = [
    {
      key: 'vault',
      label: 'Vault',
      description: 'Secretos, credenciales y controles de acceso.',
      href: `/org/${orgSlug}/projects/${project.slug}/vault`,
      icon: Shield,
    },
    {
      key: 'openreport',
      label: 'Open Report',
      description: 'Reportes de vulnerabilidades y dependencias.',
      href: `/org/${orgSlug}/projects/${project.slug}/report`,
      icon: BarChart3,
    },
    {
      key: 'stateiac',
      label: 'State IaC',
      description: 'Estado y backends de Pulumi.',
      href: `/org/${orgSlug}/projects/${project.slug}/state-iac`,
      icon: GitBranch,
    },
  ] satisfies ModuleInfo[];

  $: activeModules = moduleInfo.filter((module) => project.modules[module.key]);

  const quickActions = [
    {
      label: 'Invite members',
      description: 'Invita usuarios a colaborar en este proyecto.',
      icon: UserPlus,
    },
    {
      label: 'Add Secret Token',
      description: 'Genera un token para integraciones y CI/CD.',
      icon: KeyRound,
    },
  ];
</script>

<svelte:head>
  <title>Overview - {project.name}</title>
</svelte:head>

<div class="space-y-6">
  <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
    <div class="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
      <div class="flex items-center gap-3">
        <FolderKanban class="h-5 w-5 text-slate-900" />
        <div>
          <h3 class="text-lg font-semibold text-slate-900">{project.name}</h3>
          <p class="text-xs text-slate-500">Slug: {project.slug}</p>
        </div>
      </div>

      <span
        class="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium {project.status ===
        'active'
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-slate-100 text-slate-600'}"
      >
        {project.status === 'active' ? 'Active' : 'Inactive'}
      </span>
    </div>

    <div class="px-4 py-4">
      <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Descripción</p>
      <p class="mt-1 text-sm text-slate-700">{project.description || 'Sin descripción.'}</p>
    </div>
  </section>

  <section>
    <h3 class="text-sm font-semibold text-slate-900">Módulos activos</h3>

    {#if activeModules.length === 0}
      <div
        class="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600"
      >
        Este proyecto no tiene módulos activos. Actívalos desde la configuración del proyecto.
      </div>
    {:else}
      <div class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each activeModules as module (module.key)}
          <a
            href={module.href}
            class="group flex items-start gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 hover:shadow-md"
          >
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700"
            >
              <svelte:component this={module.icon} class="h-4 w-4" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-slate-900">{module.label}</p>
              <p class="mt-1 text-xs leading-5 text-slate-600">{module.description}</p>
            </div>
            <ArrowRight
              class="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-slate-900"
            />
          </a>
        {/each}
      </div>
    {/if}
  </section>

  <section>
    <h3 class="text-sm font-semibold text-slate-900">Guías</h3>
    <p class="mt-1 text-xs text-slate-500">Aprende a sacarle partido a cada módulo.</p>

    <div class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each moduleInfo as module (module.key)}
        <a
          href={module.href}
          class="group flex items-start gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 hover:shadow-md"
        >
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700"
          >
            <svelte:component this={module.icon} class="h-4 w-4" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-slate-900">Guía de {module.label}</p>
            <p class="mt-1 text-xs leading-5 text-slate-600">{module.description}</p>
          </div>
          <ArrowRight
            class="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-slate-900"
          />
        </a>
      {/each}
    </div>
  </section>

  <section>
    <h3 class="text-sm font-semibold text-slate-900">Acceso rápido</h3>

    <div class="mt-3 grid gap-4 sm:grid-cols-2">
      {#each quickActions as action (action.label)}
        <button
          type="button"
          disabled
          title="Próximamente"
          class="flex items-start gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-left opacity-75"
        >
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600"
          >
            <svelte:component this={action.icon} class="h-4 w-4" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-sm font-semibold text-slate-900">{action.label}</p>
              <span
                class="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600"
              >
                Próximamente
              </span>
            </div>
            <p class="mt-1 text-xs leading-5 text-slate-600">{action.description}</p>
          </div>
        </button>
      {/each}
    </div>
  </section>
</div>
