<script lang="ts">
  import {
    ArrowRight,
    BarChart3,
    FolderKanban,
    GitBranch,
    KeyRound,
    Shield,
    UserPlus,
  } from '@lucide/svelte';
  import { page } from '$app/stores';
  import { _ } from 'svelte-i18n';

  type ProjectModules = {
    vault: boolean;
    codereport: boolean;
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
  $: orgSlug = $page?.params?.org ?? '';

  $: moduleInfo = [
    {
      key: 'vault',
      label: 'Vault',
      description: $_('project.vault.description'),
      href: `/org/${orgSlug}/projects/${project.slug}/vault`,
      icon: Shield,
    },
    {
      key: 'codereport',
      label: 'Code Report',
      description: $_('project.layout.codeReportSubtitle'),
      href: `/org/${orgSlug}/projects/${project.slug}/code-report`,
      icon: BarChart3,
    },
    {
      key: 'stateiac',
      label: 'State IaC',
      description: $_('project.layout.stateIacSubtitle'),
      href: `/org/${orgSlug}/projects/${project.slug}/state-iac`,
      icon: GitBranch,
    },
  ] satisfies ModuleInfo[];

  $: activeModules = moduleInfo.filter((module) => project.modules[module.key]);

  $: quickActions = [
    {
      label: $_('project.overview.inviteMembers'),
      description: $_('project.overview.inviteMembersDescription'),
      icon: UserPlus,
    },
    {
      label: $_('project.overview.addSecretToken'),
      description: $_('project.overview.addSecretTokenDescription'),
      icon: KeyRound,
    },
  ];
</script>

<svelte:head>
  <title>{$_('project.layout.overview')} - {project.name}</title>
</svelte:head>

<div class="space-y-6">
  <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
    <div class="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
      <div class="flex items-center gap-3">
        <FolderKanban class="h-5 w-5 text-slate-900" />
        <div>
          <h3 class="text-lg font-semibold text-slate-900">{project.name}</h3>
          <p class="text-xs text-slate-500">{$_('common.slug')}: {project.slug}</p>
        </div>
      </div>

      <span
        class="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium {project.status ===
        'active'
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-slate-100 text-slate-600'}"
      >
        {project.status === 'active' ? $_('common.active') : $_('common.inactive')}
      </span>
    </div>

    <div class="px-4 py-4">
      <p class="text-xs font-medium uppercase tracking-wide text-slate-500">{$_('project.overview.description')}</p>
      <p class="mt-1 text-sm text-slate-700">{project.description || $_('project.overview.noDescription')}</p>
    </div>
  </section>

  <section>
    <h3 class="text-sm font-semibold text-slate-900">{$_('project.overview.activeModules')}</h3>

    {#if activeModules.length === 0}
      <div
        class="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600"
      >
        {$_('project.overview.noActiveModules')}
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
    <h3 class="text-sm font-semibold text-slate-900">{$_('project.overview.guides')}</h3>
    <p class="mt-1 text-xs text-slate-500">{$_('project.overview.guidesDescription')}</p>

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
            <p class="text-sm font-semibold text-slate-900">{$_('project.overview.guidePrefix')} {module.label}</p>
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
    <h3 class="text-sm font-semibold text-slate-900">{$_('project.overview.quickAccess')}</h3>

    <div class="mt-3 grid gap-4 sm:grid-cols-2">
      {#each quickActions as action (action.label)}
        <button
          type="button"
          disabled
          title={$_('common.comingSoon')}
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
                {$_('common.comingSoon')}
              </span>
            </div>
            <p class="mt-1 text-xs leading-5 text-slate-600">{action.description}</p>
          </div>
        </button>
      {/each}
    </div>
  </section>
</div>
