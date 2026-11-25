<!--
  Pie del sidebar (sustituye al footer de página): versión y novedades, estado de GitDB y botón
  para colapsar.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { PanelLeftClose, PanelLeftOpen } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import packageJson from '../../../package.json';

  type SyncState = 'synced' | 'syncing' | 'error' | 'unconfigured';

  type Props = {
    collapsed?: boolean;
    showSyncStatus?: boolean;
    syncStatusHref?: string | null;
    ontogglecollapse?: () => void;
  };

  let {
    collapsed = false,
    showSyncStatus = false,
    syncStatusHref = null,
    ontogglecollapse,
  }: Props = $props();

  const POLL_MS = 15_000;

  let status = $state<{ state: SyncState; label: string }>({
    state: 'unconfigured',
    label: 'Checking sync status...',
  });
  let latestRelease = $state<{ tag_name: string; html_url: string } | null>(null);

  const dotClass: Record<SyncState, string> = {
    synced: 'bg-ok',
    syncing: 'bg-warn animate-pulse',
    error: 'bg-danger',
    unconfigured: 'bg-fg-subtle',
  };

  function versionParts(version: string) {
    return version
      .replace(/^v/i, '')
      .split(/[.-]/, 3)
      .map((part) => Number.parseInt(part, 10) || 0);
  }

  function isNewerVersion(candidate: string, current: string) {
    const candidateParts = versionParts(candidate);
    const currentParts = versionParts(current);
    for (let index = 0; index < 3; index += 1) {
      if (candidateParts[index] !== currentParts[index]) {
        return candidateParts[index] > currentParts[index];
      }
    }
    return false;
  }

  async function refresh() {
    try {
      const response = await fetch('/gitdb/status');
      if (!response.ok) return;
      status = await response.json();
    } catch {
      // un fallo de red puntual mantiene el último estado conocido
    }
  }

  async function checkForUpdates() {
    try {
      const response = await fetch('https://api.github.com/repos/getgitops/gitops/releases/latest');
      if (!response.ok) return;
      const release = (await response.json()) as { tag_name?: string; html_url?: string };
      if (
        release.tag_name &&
        release.html_url &&
        isNewerVersion(release.tag_name, packageJson.version)
      ) {
        latestRelease = { tag_name: release.tag_name, html_url: release.html_url };
      }
    } catch {
      latestRelease = null;
    }
  }

  onMount(() => {
    void checkForUpdates();
    if (!showSyncStatus) return;
    void refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  });
</script>

{#if !collapsed}
  <div class="rounded-xl border border-brand-500/25 bg-brand-500/6 p-3">
    <p class="text-xs font-medium text-brand-200">GitOps {packageJson.version}</p>
    {#if latestRelease}
      <a
        href={latestRelease.html_url}
        target="_blank"
        rel="noopener noreferrer"
        class="mt-0.5 block text-xs text-fg-subtle hover:text-white"
        >{$_('footer.updateAvailable')}: {latestRelease.tag_name}</a
      >
    {:else}
      <a href="/changelog" class="mt-0.5 block text-xs text-fg-subtle hover:text-white"
        >{$_('sidebar.whatsNew')}</a
      >
    {/if}
  </div>
{/if}

<div class="flex items-center gap-2 border-t border-white/8 pt-3 {collapsed ? 'flex-col' : ''}">
  {#if showSyncStatus}
    <svelte:element
      this={syncStatusHref ? 'a' : 'span'}
      href={syncStatusHref ?? undefined}
      class="flex min-w-0 items-center gap-1.5 rounded-md text-xs text-fg-subtle {syncStatusHref
        ? 'hover:text-white'
        : ''} {collapsed ? 'p-1.5' : 'flex-1'}"
      title={collapsed ? status.label : undefined}
      aria-label={collapsed ? `${$_('footer.gitdbSyncStatus')}: ${status.label}` : undefined}
    >
      <span class="h-1.5 w-1.5 shrink-0 rounded-full {dotClass[status.state]}"></span>
      {#if !collapsed}<span class="truncate">GitDB · {status.label}</span>{/if}
    </svelte:element>
  {:else if !collapsed}
    <span class="flex-1"></span>
  {/if}
  {#if ontogglecollapse}
    <button
      type="button"
      class="k-btn k-btn-ghost k-btn-icon k-btn-sm hidden md:inline-flex"
      onclick={ontogglecollapse}
      aria-label={collapsed ? $_('sidebar.expandSidebar') : $_('sidebar.collapseSidebar')}
      title={collapsed ? $_('sidebar.expandSidebar') : $_('sidebar.collapseSidebar')}
    >
      {#if collapsed}<PanelLeftOpen class="h-4 w-4" />{:else}<PanelLeftClose
          class="h-4 w-4"
        />{/if}
    </button>
  {/if}
</div>
