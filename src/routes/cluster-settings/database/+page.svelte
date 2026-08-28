<script lang="ts">
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { CheckCircle, GitBranch, RefreshCw, Timer } from '@lucide/svelte';
  import { _ } from 'svelte-i18n';
  import GitDbStatusBadge from '$lib/components/GitDbStatusBadge.svelte';

  type RepositoryConfig = {
    repositoryUrl: string;
    branch: string;
    authMode: 'none' | 'basic' | 'token';
    username: string | null;
    hasSecret: boolean;
    authorName: string;
    authorEmail: string;
    syncPollSeconds: number;
  };

  type SyncStatus = {
    state: 'synced' | 'syncing' | 'error' | 'unconfigured';
    label: string;
    repositoryUrl: string | null;
    branch: string | null;
    syncPollSeconds: number | null;
    lastSyncAt: string | null;
    lastAttemptAt: string | null;
    lastError: string | null;
    lastCommit: string | null;
    ahead: number;
    behind: number;
  };

  export let data: { repository: RepositoryConfig | null; status: SyncStatus };

  let status: SyncStatus = data.status;
  $: repository = data.repository;

  let syncing = false;
  let error = '';
  let success = '';

  $: AUTH_LABELS = {
    token: $_('clusterSettings.database.authToken'),
    basic: $_('clusterSettings.database.authBasic'),
    none: $_('clusterSettings.database.authNone'),
  };

  async function refreshStatus() {
    try {
      const response = await fetch('/gitdb/status');
      if (response.ok) status = await response.json();
    } catch {
      // keep the last known status on transient failures
    }
  }

  onMount(() => {
    const timer = setInterval(refreshStatus, 10_000);
    return () => clearInterval(timer);
  });

  const runSync: SubmitFunction = () => {
    error = '';
    syncing = true;
    status = { ...status, state: 'syncing', label: $_('clusterSettings.database.syncInProgress') };
    return async ({ result, update }) => {
      await update({ reset: false });
      syncing = false;
      await refreshStatus();

      if (result.type === 'success') {
        success = $_('clusterSettings.database.repositorySynchronized');
        setTimeout(() => (success = ''), 2500);
        return;
      }

      error =
        result.type === 'failure' && result.data?.error ? String(result.data.error) : $_('clusterSettings.database.syncFailed');
    };
  };

  function formatDate(value: string | null) {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }
</script>

<svelte:head>
  <title>{$_('clusterSettings.database.title')} - {$_('clusterSettings.title')}</title>
</svelte:head>

<div class="space-y-6">
  <section>
    <h3 class="text-xl font-semibold text-slate-900">{$_('clusterSettings.database.title')}</h3>
    <p class="mt-2 text-sm text-slate-600">
      {$_('clusterSettings.database.description')}
    </p>
  </section>

  {#if error}
    <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </div>
  {/if}

  {#if success}
    <div
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
    >
      <span class="inline-flex items-center gap-2"><CheckCircle class="h-4 w-4" /> {success}</span>
    </div>
  {/if}

  <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
    <div class="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
      <h4 class="text-sm font-semibold text-slate-900">{$_('clusterSettings.database.status')}</h4>
      <GitDbStatusBadge state={status.state} label={status.label} size="md" />
    </div>

    <dl class="grid gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">{$_('clusterSettings.database.lastCommit')}</dt>
        <dd class="mt-1 font-mono text-sm text-slate-900">{status.lastCommit ?? '-'}</dd>
      </div>
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">{$_('clusterSettings.database.lastSync')}</dt>
        <dd class="mt-1 text-sm text-slate-900">{formatDate(status.lastSyncAt)}</dd>
      </div>
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">{$_('clusterSettings.database.lastAttempt')}</dt>
        <dd class="mt-1 text-sm text-slate-900">{formatDate(status.lastAttemptAt)}</dd>
      </div>
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">{$_('clusterSettings.database.aheadBehind')}</dt>
        <dd class="mt-1 text-sm text-slate-900">{status.ahead} / {status.behind}</dd>
      </div>
    </dl>

    {#if status.lastError}
      <div class="border-t border-slate-200 px-4 py-3">
        <p class="text-xs font-medium uppercase tracking-wide text-red-600">{$_('clusterSettings.database.lastError')}</p>
        <p class="mt-1 break-all text-sm text-red-700">{status.lastError}</p>
      </div>
    {/if}

    <form
      method="POST"
      action="?/syncNow"
      use:enhance={runSync}
      class="flex items-center justify-end border-t border-slate-200 px-4 py-3"
    >
      <button
        type="submit"
        disabled={syncing || !repository}
        class="btn-secondary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
      >
        <RefreshCw class="h-4 w-4 {syncing ? 'animate-spin' : ''}" />
        {syncing ? $_('clusterSettings.database.syncing') : $_('clusterSettings.database.syncNow')}
      </button>
    </form>
  </section>

  <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
    <div class="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
      <GitBranch class="h-4 w-4 text-slate-500" />
      <h4 class="text-sm font-semibold text-slate-900">{$_('clusterSettings.database.repository')}</h4>
    </div>

    {#if repository}
      <dl class="grid gap-4 px-4 py-4 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">
            GITDB_REPOSITORY_URL
          </dt>
          <dd class="mt-1 break-all font-mono text-sm text-slate-900">{repository.repositoryUrl}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">GITDB_BRANCH</dt>
          <dd class="mt-1 font-mono text-sm text-slate-900">{repository.branch}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">{$_('clusterSettings.database.authentication')}</dt>
          <dd class="mt-1 text-sm text-slate-900">
            {AUTH_LABELS[repository.authMode]}
            {#if repository.hasSecret}
              <span class="ml-1 text-xs text-emerald-700">· {$_('clusterSettings.database.credentialLoaded')}</span>
            {/if}
          </dd>
        </div>
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">GITDB_USERNAME</dt>
          <dd class="mt-1 font-mono text-sm text-slate-900">{repository.username ?? '-'}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">{$_('clusterSettings.database.commitAuthor')}</dt>
          <dd class="mt-1 text-sm text-slate-900">
            {repository.authorName} &lt;{repository.authorEmail}&gt;
          </dd>
        </div>
      </dl>
    {:else}
      <div class="px-4 py-4 text-sm text-red-700">
        {$_('clusterSettings.database.repositoryMissing')}
      </div>
    {/if}
  </section>

  <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
    <div class="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
      <Timer class="h-4 w-4 text-slate-500" />
      <h4 class="text-sm font-semibold text-slate-900">{$_('clusterSettings.database.syncPoll')}</h4>
    </div>

    <div class="px-4 py-4">
      <p class="text-sm text-slate-900">
        {$_('clusterSettings.database.everySeconds')} <span class="font-semibold">{repository?.syncPollSeconds ?? '-'}</span> {$_('clusterSettings.database.seconds')}
      </p>
      <p class="mt-1 text-xs text-slate-500">
        {$_('clusterSettings.database.configuredWith')} <span class="font-mono">GITDB_SYNC_POLL_SECONDS</span>.
      </p>
    </div>
  </section>
</div>
