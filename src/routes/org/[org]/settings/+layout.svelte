<script lang="ts">
  import { createPageStore } from '#lib/page-store';
  import { Settings } from '@lucide/svelte';
  import { _ } from '#lib/i18n';

  export let data: {
    organization?: { name?: string | null; slug?: string | null } | null;
    canReadOrgUsers?: boolean;
    canReadOrgRoles?: boolean;
    canReadOrgGlobal?: boolean;
    canReadOrgServerKeys?: boolean;
    canReadOrgAudit?: boolean;
    canReadOrgEvents?: boolean;
    canReadOrganizationAlerts?: boolean;
  };

  $: orgSlug = data.organization?.slug ?? $page?.params?.org ?? '';
  $: currentPath = $page?.url?.pathname ?? '';
  $: tabs = [
    { label: 'Settings', href: `/org/${orgSlug}/settings/global`, visible: data.canReadOrgGlobal },
    {
      label: 'Access Control',
      href: `/org/${orgSlug}/settings/access-control`,
      visible: data.canReadOrgUsers,
    },
    {
      label: 'Roles',
      href: `/org/${orgSlug}/settings/roles-permissions`,
      visible: data.canReadOrgRoles,
    },
    {
      label: 'Server Access Keys',
      href: `/org/${orgSlug}/settings/server-access-keys`,
      visible: data.canReadOrgServerKeys,
      soon: true,
    },
    {
      label: 'Alerts',
      href: `/org/${orgSlug}/settings/alerts`,
      visible: data.canReadOrganizationAlerts,
    },
    {
      label: 'Audit Logs',
      href: `/org/${orgSlug}/settings/audit`,
      visible: data.canReadOrgAudit,
    },
    { label: 'Events', href: `/org/${orgSlug}/settings/events`, visible: data.canReadOrgEvents },
    {
      label: 'Encryption',
      href: `/org/${orgSlug}/settings/encryption`,
      visible: data.canReadOrgGlobal,
      soon: true,
    },
  ];

  const page = createPageStore();
</script>

<svelte:head>
  <title>{$_('orgSettings.title')} - GitOps</title>
</svelte:head>

<div class="organization-settings-page">
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <a href="/org">Organizations</a>
    <span>/</span>
    <span>{data.organization?.name ?? 'Organization'}</span>
  </nav>

  <header class="settings-header">
    <div class="settings-title">
      <div class="page-symbol"><Settings class="h-5 w-5" /></div>
      <div>
        <h1>{data.organization?.name ?? 'Organization'}</h1>
        <p>Configuración, acceso y operación de tu organización</p>
      </div>
    </div>
  </header>

  <nav class="settings-tabs" aria-label="Organization settings">
    {#each tabs.filter((tab) => tab.visible) as tab (tab.href)}
      <a href={tab.href} class:active={currentPath.startsWith(tab.href)}>
        {tab.label}
        {#if tab.soon}<span class="tab-soon">Soon</span>{/if}
      </a>
    {/each}
  </nav>

  <main class="settings-content">
    <slot />
  </main>
</div>

<style>
  .organization-settings-page {
    width: 100%;
    max-width: 1320px;
    margin: 0 auto;
  }

  .breadcrumbs {
    display: flex;
    height: 16px;
    align-items: center;
    gap: 8px;
    color: #625e65;
    font-size: 14px;
  }

  .breadcrumbs span:last-child {
    color: #a9a4ac;
  }

  .settings-header {
    display: flex;
    min-height: 92px;
    align-items: center;
    margin-top: 10px;
  }

  .settings-title {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .page-symbol {
    display: flex;
    width: 50px;
    height: 50px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgb(249 93 17 / 0.26);
    border-radius: 12px;
    background: linear-gradient(145deg, rgb(249 93 17 / 0.18), rgb(249 93 17 / 0.05));
    color: #ff8a4c;
  }

  h1 {
    color: #ececf0;
    font-size: 28px;
    font-weight: 570;
    letter-spacing: -0.45px;
  }

  .settings-title p {
    margin-top: 5px;
    color: #77737a;
    font-size: 16px;
  }

  .settings-tabs {
    display: flex;
    height: 48px;
    align-items: flex-end;
    gap: 28px;
    margin-top: 5px;
    border-bottom: 1px solid #292b33;
  }

  .settings-tabs a {
    position: relative;
    display: flex;
    height: 42px;
    align-items: center;
    color: #6f7480;
    font-size: 15px;
    white-space: nowrap;
  }

  .settings-tabs a:hover {
    color: #d3cfd5;
  }

  .settings-tabs a.active {
    color: #ff9a63;
  }

  .settings-tabs a.active::after {
    position: absolute;
    right: 0;
    bottom: -1px;
    left: 0;
    height: 1px;
    content: '';
    background: #f95d11;
    box-shadow: 0 -2px 8px rgb(249 93 17 / 0.35);
  }

  .tab-soon {
    margin-left: 7px;
    padding: 3px 6px;
    border: 1px solid rgb(249 93 17 / 0.18);
    border-radius: 999px;
    background: rgb(249 93 17 / 0.08);
    color: #d98a5c;
    font-size: 10px;
  }

  .settings-content {
    margin-top: 24px;
  }

  .settings-content :global(h3) {
    color: #ece8ee !important;
    font-size: 21px !important;
  }

  .settings-content :global(h3 + p) {
    color: #7f7983 !important;
    font-size: 15px !important;
  }

  .settings-content :global(table) {
    font-size: 14px;
  }

  .settings-content :global(thead tr) {
    border-color: rgb(255 255 255 / 0.08) !important;
    color: #817b85 !important;
  }

  .settings-content :global(tbody tr) {
    border-color: rgb(255 255 255 / 0.065) !important;
  }

  .settings-content :global(table + *) {
    color: #aaa4ad;
  }

  .settings-content :global(.field-input) {
    border-color: rgb(255 255 255 / 0.09) !important;
    background: rgb(255 255 255 / 0.025) !important;
    color: #e9e5ea !important;
    box-shadow: none !important;
  }

  .settings-content :global(.field-input:focus) {
    border-color: rgb(249 93 17 / 0.42) !important;
    box-shadow: 0 0 0 3px rgb(249 93 17 / 0.1) !important;
  }

  .settings-content :global(.btn-primary) {
    border-color: #f95d11 !important;
    background: linear-gradient(180deg, #ff7430, #e74d08) !important;
    box-shadow: 0 8px 24px rgb(249 93 17 / 0.15);
  }

  .settings-content :global(.btn-secondary) {
    border-color: rgb(255 255 255 / 0.09) !important;
    background: rgb(255 255 255 / 0.025) !important;
  }

  .settings-content :global(section.overflow-x-auto),
  .settings-content :global(div.relative.flex-1.overflow-visible) {
    border-color: rgb(255 255 255 / 0.085) !important;
    background: rgb(255 255 255 / 0.025) !important;
  }

  @media (max-width: 760px) {
    .settings-tabs {
      gap: 20px;
      overflow-x: auto;
    }
  }
</style>
