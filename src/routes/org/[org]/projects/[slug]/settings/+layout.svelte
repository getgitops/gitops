<script lang="ts">
  import { page } from '$app/state';
  import { _ } from '#lib/i18n';
  import { avatarColor, initials } from '#lib/projects/avatar';
  import type { Snippet } from 'svelte';

  /**
   * Project settings shell: same header, tabs and content styles as the organization settings, so
   * the shared pages (users, roles, alerts…) look the same in both. Each tab shows only with its
   * read permission (flags computed by the root layout).
   */
  let {
    data,
    children,
  }: {
    data: {
      project: {
        id: string;
        name: string;
        slug: string;
        organization?: { name?: string | null; slug?: string | null } | null;
      };
      canReadProjectInfo?: boolean;
      canReadProjectUsers?: boolean;
      canReadProjectRoles?: boolean;
      canReadProjectAlerts?: boolean;
      canReadProjectServerKeys?: boolean;
      canReadProjectAudit?: boolean;
    };
    children: Snippet;
  } = $props();

  const project = $derived(data.project);
  const orgSlug = $derived(project.organization?.slug ?? page.params.org ?? '');
  const base = $derived(`/org/${orgSlug}/projects/${project.slug}/settings`);
  const currentPath = $derived(page.url.pathname);

  const tabs = $derived([
    {
      label: $_('projectSettings.tabs.global'),
      href: `${base}/global`,
      visible: data.canReadProjectInfo,
    },
    {
      label: $_('projectSettings.tabs.accessControl'),
      href: `${base}/access-control`,
      visible: data.canReadProjectUsers,
    },
    {
      label: $_('projectSettings.tabs.roles'),
      href: `${base}/roles-permissions`,
      visible: data.canReadProjectRoles,
    },
    {
      label: $_('projectSettings.tabs.alerts'),
      href: `${base}/alerts`,
      visible: data.canReadProjectAlerts,
    },
    {
      label: $_('projectSettings.tabs.serverKeys'),
      href: `${base}/server-access-keys`,
      visible: data.canReadProjectServerKeys,
    },
    {
      label: $_('projectSettings.tabs.audit'),
      href: `${base}/audit`,
      visible: data.canReadProjectAudit,
    },
  ]);
</script>

<svelte:head>
  <title>{$_('projectSettings.title')} - {project.name}</title>
</svelte:head>

<div class="project-settings-page">
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <a href="/org">Organizations</a>
    <span>/</span>
    <a href={`/org/${orgSlug}/overview`}>{project.organization?.name ?? 'Organization'}</a>
    <span>/</span>
    <a href={`/org/${orgSlug}/projects/${project.slug}/overview`}>{project.name}</a>
    <span>/</span>
    <span>{$_('projectSettings.title')}</span>
  </nav>

  <header class="settings-header">
    <div class="settings-title">
      <div class="page-symbol project-symbol" style="--color: {avatarColor(project.id)}">
        {initials(project.name)}
      </div>
      <div>
        <h1>{project.name}</h1>
        <p>{$_('projectSettings.subtitle')}</p>
      </div>
    </div>
  </header>

  <nav class="settings-tabs" aria-label={$_('projectSettings.title')}>
    {#each tabs.filter((tab) => tab.visible) as tab (tab.href)}
      <a href={tab.href} class:active={currentPath.startsWith(tab.href)}>{tab.label}</a>
    {/each}
  </nav>

  <main class="settings-content">
    {@render children()}
  </main>
</div>

<style>
  .project-settings-page {
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

  /* the project's own avatar color instead of the settings gear */
  .project-symbol {
    border-color: color-mix(in srgb, var(--color) 40%, transparent);
    background: color-mix(in srgb, var(--color) 16%, transparent);
    color: color-mix(in srgb, var(--color) 70%, white);
    font-size: 17px;
    font-weight: 700;
  }

  .breadcrumbs a:hover {
    color: #d3cfd5;
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
