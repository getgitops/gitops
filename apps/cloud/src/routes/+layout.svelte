<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import AppNavbar from '$lib/components/AppNavbar.svelte';
  import AppSidebar from '$lib/components/AppSidebar.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import { setupI18n } from '$lib/i18n';

  export let data: any;

  let sidebarCollapsed = false;
  let sidebarStateReady = false;

  setupI18n();

  $: isBareLayout =
    $page?.url?.pathname?.startsWith('/auth/') || $page?.url?.pathname?.startsWith('/bootstrap');

  onMount(() => {
    sidebarCollapsed = localStorage.getItem('gitops-sidebar-collapsed') === '1';
    sidebarStateReady = true;
  });

  $: if (sidebarStateReady) {
    localStorage.setItem('gitops-sidebar-collapsed', sidebarCollapsed ? '1' : '0');
  }
</script>

<div
  class="min-h-screen bg-[#020813] text-slate-100 font-sans flex flex-col"
  style={`--sidebar-width:${sidebarCollapsed ? '84px' : '292px'}`}
>
  {#if !isBareLayout}
    <AppNavbar
      user={data.user}
      projects={data.projects}
      organizationSlug={data.organization?.slug ?? null}
      projectSlug={data.currentProjectSlug ?? ''}
    />

    <div
      class="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-6 sm:px-6 md:block md:px-0"
    >
      <aside class="app-shell-sidebar w-full md:fixed md:left-0 md:top-[84px] md:z-20 md:h-[calc(100vh-84px)] md:overflow-y-auto md:border-r md:border-[#142236] md:bg-[#020813] md:px-6 md:py-7">
        <AppSidebar
          pathname={$page?.url?.pathname}
          isConfigured={data.isConfigured}
          organizationSlug={data.organization?.slug ?? null}
          organizationName={data.organization?.name ?? null}
          projects={data.projects}
          canAccessClusterSettings={data.canAccessClusterSettings}
          canManageOrganization={data.canManageOrganization}
          canManageProject={data.canManageProject}
          canReadOrgProjects={data.canReadOrgProjects}
          canReadOrgUsers={data.canReadOrgUsers}
          canReadOrgRoles={data.canReadOrgRoles}
          canReadOrgGlobal={data.canReadOrgGlobal}
          canReadOrgBackups={data.canReadOrgBackups}
          canReadOrgServerKeys={data.canReadOrgServerKeys}
          canReadOrgAudit={data.canReadOrgAudit}
          canReadProjectInfo={data.canReadProjectInfo}
          canReadProjectUsers={data.canReadProjectUsers}
          canReadProjectRoles={data.canReadProjectRoles}
          canReadProjectServerKeys={data.canReadProjectServerKeys}
          canReadProjectAudit={data.canReadProjectAudit}
          canReadProjectVault={data.canReadProjectVault}
          canReadProjectCodeReport={data.canReadProjectCodeReport}
          canReadProjectStateIac={data.canReadProjectStateIac}
          currentProjectSlug={data.currentProjectSlug ?? null}
          bind:collapsed={sidebarCollapsed}
        />
      </aside>

      <main class="app-shell-main min-w-0 flex-1 md:pr-6">
        <slot />
      </main>
    </div>
  {:else}
    <slot />
  {/if}

  {#if !isBareLayout}
    <Footer
      showSyncStatus={data.canViewGitDbStatus}
      syncStatusHref={data.canAccessClusterSettings ? '/cluster-settings/database' : null}
    />
  {/if}
</div>
