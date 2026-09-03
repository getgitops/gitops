<script lang="ts">
  import { page } from '$app/stores';
  import { Code2, Database, Grid2X2, Settings, Shield, Users } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

  const tabs = [
    { label: 'Organizaciones', href: '/cluster-settings/orgs' },
    { label: 'Roles y permisos', href: '/cluster-settings/roles-permissions' },
    { label: 'Control de acceso', href: '/cluster-settings/access-control' },
    { label: 'Base de datos', href: '/cluster-settings/database' },
    { label: 'Registro de auditoría', href: '/cluster-settings/audit' },
  ];

  $: currentPath = $page.url.pathname;
</script>

<svelte:head>
  <title>{$_('clusterSettings.title')} - GitOps</title>
</svelte:head>

<div class="mx-auto w-full max-w-[1180px]">
  <div class="min-h-[795px] overflow-hidden rounded-xl border border-[#18283c] bg-[#05101d]/78 shadow-[0_28px_80px_rgba(0,0,0,0.28)] backdrop-blur">
    <div class="relative overflow-hidden px-8 pt-12 pb-9 sm:px-9">
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_78%_6%,rgba(36,87,255,0.22),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.025),transparent_68%)]"></div>
      <div class="relative flex items-center justify-between gap-8 border-b border-[#1a2a3e] pb-10">
        <div class="flex items-center gap-6">
          <span class="flex h-[60px] w-[60px] items-center justify-center rounded-lg border border-[#12346e] bg-[#082057] text-[#0d7dff] shadow-[0_0_32px_rgba(36,87,255,0.2)]">
            <Grid2X2 class="h-7 w-7" />
          </span>
          <div>
            <h2 class="text-2xl font-bold tracking-tight text-white">{$_('clusterSettings.title')}</h2>
            <p class="mt-2 text-sm text-slate-400">Gestiona la configuración y seguridad de tu clúster.</p>
          </div>
        </div>

        <div class="relative hidden h-[136px] w-[510px] shrink-0 lg:block" aria-hidden="true">
          <div class="absolute top-7 right-32 h-24 w-42 rotate-0 rounded-[18px] border border-[#0a55ff] bg-[#081b45] shadow-[0_0_46px_rgba(36,87,255,0.5)] [transform:skewY(-26deg)]"></div>
          <div class="absolute top-11 right-26 h-18 w-32 rounded-[14px] border border-[#104cff] bg-[#0a1f4a] [transform:skewY(-26deg)]"></div>
          <div class="absolute top-0 right-42 flex h-28 w-24 items-center justify-center rounded-t-[46px] rounded-b-2xl border border-[#166aff] bg-linear-to-b from-[#0d43ff]/75 to-[#061a45]/90 text-[#0d8bff] shadow-[0_0_55px_rgba(36,87,255,0.64)]">
            <Shield class="h-[52px] w-[52px]" />
          </div>
          <div class="absolute top-8 left-13 flex h-12 w-12 items-center justify-center rounded-lg border border-cyan-500/60 bg-cyan-500/8 text-cyan-300"><Users class="h-6 w-6" /></div>
          <div class="absolute bottom-5 left-0 flex h-12 w-12 items-center justify-center rounded-lg border border-teal-500/60 bg-teal-500/8 text-teal-300"><Database class="h-6 w-6" /></div>
          <div class="absolute top-10 right-11 flex h-12 w-12 items-center justify-center rounded-lg border border-blue-500/60 bg-blue-500/8 text-blue-300"><Code2 class="h-6 w-6" /></div>
          <div class="absolute right-0 bottom-4 flex h-12 w-12 items-center justify-center rounded-lg border border-indigo-500/60 bg-indigo-500/8 text-indigo-300"><Settings class="h-6 w-6" /></div>
          <div class="absolute top-15 left-25 h-px w-32 border-t border-dashed border-cyan-400/60"></div>
          <div class="absolute top-22 right-57 h-px w-36 border-t border-dashed border-blue-500/60"></div>
          <div class="absolute right-12 bottom-10 h-px w-48 border-t border-dashed border-blue-500/55"></div>
        </div>
      </div>
    </div>

    <nav class="flex gap-8 overflow-x-auto border-b border-[#142236] px-8 text-sm text-slate-400 sm:px-9" aria-label="Cluster settings">
      {#each tabs as tab (tab.href)}
        <a
          href={tab.href}
          class="shrink-0 border-b-2 px-4 pb-5 transition-colors {currentPath.startsWith(tab.href)
            ? 'border-[#0d7dff] text-[#0d7dff]'
            : 'border-transparent hover:text-slate-200'}"
        >
          {tab.label}
        </a>
      {/each}
    </nav>

    <div class="min-w-0 px-8 py-9 sm:px-9">
      <slot />
    </div>
  </div>
</div>
