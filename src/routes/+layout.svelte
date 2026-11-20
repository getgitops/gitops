<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { createPageStore } from '#lib/page-store';
  import AppNavbar from '#lib/components/AppNavbar.svelte';
  import AppSidebar from '#lib/components/AppSidebar.svelte';
  import { setupI18n } from '#lib/i18n';

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

  const page = createPageStore();
</script>

<div
  class="app-shell min-h-screen bg-[#0c0d12] font-sans text-[#e6e7eb]"
  style={`--sidebar-width:${sidebarCollapsed ? '76px' : '220px'}`}
>
  {#if !isBareLayout}
    <AppNavbar
      projects={data.projects}
      organizationSlug={data.organization?.slug ?? null}
      projectSlug={data.currentProjectSlug ?? ''}
      compact={sidebarCollapsed}
    />

    <aside class="app-shell-sidebar">
      <AppSidebar
        pathname={$page?.url?.pathname}
        isConfigured={data.isConfigured}
        organizationSlug={data.organization?.slug ?? null}
        organizationName={data.organization?.name ?? null}
        organizations={data.organizations}
        canCreateOrganization={data.canCreateOrganization}
        projects={data.projects}
        user={data.user}
        canAdministerOrganization={data.canAdministerOrganization}
        canReadOrgProjects={data.canReadOrgProjects}
        canReadOrgUsers={data.canReadOrgUsers}
        canReadOrgRoles={data.canReadOrgRoles}
        canReadOrgGlobal={data.canReadOrgGlobal}
        canReadOrgBackups={data.canReadOrgBackups}
        canReadOrgServerKeys={data.canReadOrgServerKeys}
        canReadOrgAudit={data.canReadOrgAudit}
        canReadOrgEvents={data.canReadOrgEvents}
        canReadOrganizationAlerts={data.canReadOrganizationAlerts}
        canReadProjectVault={data.canReadProjectVault}
        canReadProjectCodeReport={data.canReadProjectCodeReport}
        canReadProjectStateIac={data.canReadProjectStateIac}
        canViewGitDbStatus={data.canViewGitDbStatus}
        currentProjectSlug={data.currentProjectSlug ?? null}
        bind:collapsed={sidebarCollapsed}
      />
    </aside>

    <main class="app-shell-main">
      <slot />
    </main>
  {:else}
    <slot />
  {/if}
</div>
