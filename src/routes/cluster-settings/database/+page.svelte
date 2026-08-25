<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { CheckCircle, GitBranch, RefreshCw, Save, Timer } from 'lucide-svelte';
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
    configuredAt: string;
    updatedAt: string;
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

  export let data: {
    repository: RepositoryConfig | null;
    status: SyncStatus;
    limits: { min: number; max: number; default: number };
  };

  let status: SyncStatus = data.status;
  $: repository = data.repository;

  let repositoryUrl = data.repository?.repositoryUrl ?? '';
  let branch = data.repository?.branch ?? 'main';
  let authMode: 'none' | 'basic' | 'token' = data.repository?.authMode ?? 'token';
  let username = data.repository?.username ?? '';
  let secret = '';
  let authorName = data.repository?.authorName ?? 'gitvault-suite';
  let authorEmail = data.repository?.authorEmail ?? 'gitvault-suite@getgitops.local';
  let syncPollSeconds = data.repository?.syncPollSeconds ?? data.limits.default;

  let savingRepository = false;
  let savingPoll = false;
  let syncing = false;
  let error = '';
  let success = '';

  function flashSuccess(message: string) {
    success = message;
    setTimeout(() => {
      success = '';
    }, 2500);
  }

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

  const saveRepository: SubmitFunction = ({ cancel }) => {
    error = '';
    if (!repositoryUrl.trim()) {
      error = 'Repository URL is required.';
      cancel();
      return;
    }
    if (authMode !== 'none' && !repository?.hasSecret && !secret.trim()) {
      error = authMode === 'token' ? 'Token is required.' : 'Password is required.';
      cancel();
      return;
    }

    savingRepository = true;
    return async ({ result, update }) => {
      await update({ reset: false });
      savingRepository = false;
      await refreshStatus();

      if (result.type === 'success') {
        secret = '';
        flashSuccess('Repository configuration saved.');
        return;
      }

      error =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : 'Failed to save repository configuration.';
    };
  };

  const saveSyncPoll: SubmitFunction = () => {
    error = '';
    savingPoll = true;
    return async ({ result, update }) => {
      await update({ reset: false });
      savingPoll = false;
      await refreshStatus();

      if (result.type === 'success') {
        flashSuccess('Sync poll interval saved.');
        return;
      }

      error =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : 'Failed to save sync poll interval.';
    };
  };

  const runSync: SubmitFunction = () => {
    error = '';
    syncing = true;
    status = { ...status, state: 'syncing', label: 'Sync in progress' };
    return async ({ result, update }) => {
      await update({ reset: false });
      syncing = false;
      await refreshStatus();
      await invalidateAll();

      if (result.type === 'success') {
        flashSuccess('Repository synchronized.');
        return;
      }

      error =
        result.type === 'failure' && result.data?.error
          ? String(result.data.error)
          : 'Sync failed.';
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
  <title>Database - Cluster Settings</title>
</svelte:head>

<div class="space-y-6">
  <section>
    <h3 class="text-xl font-semibold text-slate-900">Database</h3>
    <p class="mt-2 text-sm text-slate-600">
      Configure the Git repository backing GitDB and how often the cluster synchronizes with it.
    </p>
  </section>

  {#if error}
    <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </div>
  {/if}

  {#if success}
    <div class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      <span class="inline-flex items-center gap-2"><CheckCircle class="h-4 w-4" /> {success}</span>
    </div>
  {/if}

  <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
    <div class="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
      <h4 class="text-sm font-semibold text-slate-900">Status</h4>
      <GitDbStatusBadge state={status.state} label={status.label} size="md" />
    </div>

    <dl class="grid gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Repository</dt>
        <dd class="mt-1 break-all text-sm text-slate-900">{status.repositoryUrl ?? '-'}</dd>
      </div>
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Branch</dt>
        <dd class="mt-1 text-sm text-slate-900">{status.branch ?? '-'}</dd>
      </div>
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Last commit</dt>
        <dd class="mt-1 font-mono text-sm text-slate-900">{status.lastCommit ?? '-'}</dd>
      </div>
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Last sync</dt>
        <dd class="mt-1 text-sm text-slate-900">{formatDate(status.lastSyncAt)}</dd>
      </div>
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Last attempt</dt>
        <dd class="mt-1 text-sm text-slate-900">{formatDate(status.lastAttemptAt)}</dd>
      </div>
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Ahead / Behind</dt>
        <dd class="mt-1 text-sm text-slate-900">{status.ahead} / {status.behind}</dd>
      </div>
    </dl>

    {#if status.lastError}
      <div class="border-t border-slate-200 px-4 py-3">
        <p class="text-xs font-medium uppercase tracking-wide text-red-600">Last error</p>
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
        {syncing ? 'Syncing...' : 'Sync now'}
      </button>
    </form>
  </section>

  <form
    method="POST"
    action="?/saveRepository"
    use:enhance={saveRepository}
    class="overflow-hidden rounded-md border border-slate-200 bg-white"
  >
    <div class="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
      <GitBranch class="h-4 w-4 text-slate-500" />
      <h4 class="text-sm font-semibold text-slate-900">Repository</h4>
    </div>

    <div class="space-y-4 px-4 py-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="block text-sm font-medium text-slate-700" for="repository-url">Repository URL</label>
          <input
            id="repository-url"
            name="repositoryUrl"
            type="text"
            bind:value={repositoryUrl}
            placeholder="https://github.com/org/gitdb-state.git"
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="repository-branch">Branch</label>
          <input
            id="repository-branch"
            name="branch"
            type="text"
            bind:value={branch}
            placeholder="main"
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="repository-auth-mode">Authentication</label>
          <select
            id="repository-auth-mode"
            name="authMode"
            bind:value={authMode}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          >
            <option value="token">Token</option>
            <option value="basic">User / Password</option>
            <option value="none">None (SSH key or public repo)</option>
          </select>
        </div>

        {#if authMode !== 'none'}
          <div>
            <label class="block text-sm font-medium text-slate-700" for="repository-username">
              {authMode === 'token' ? 'Username (optional)' : 'Username'}
            </label>
            <input
              id="repository-username"
              name="username"
              type="text"
              autocomplete="off"
              bind:value={username}
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700" for="repository-secret">
              {authMode === 'token' ? 'Token' : 'Password'}
            </label>
            <input
              id="repository-secret"
              name="secret"
              type="password"
              autocomplete="new-password"
              bind:value={secret}
              placeholder={repository?.hasSecret ? '•••••••• (stored, leave empty to keep)' : ''}
              class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
            />
            <p class="mt-1 text-xs text-slate-500">Stored encrypted; never sent back to the browser.</p>
          </div>
        {/if}

        <div>
          <label class="block text-sm font-medium text-slate-700" for="repository-author-name">Commit author name</label>
          <input
            id="repository-author-name"
            name="authorName"
            type="text"
            bind:value={authorName}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700" for="repository-author-email">Commit author email</label>
          <input
            id="repository-author-email"
            name="authorEmail"
            type="email"
            bind:value={authorEmail}
            class="field-input mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition"
          />
        </div>
      </div>
    </div>

    <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
      <button
        type="submit"
        disabled={savingRepository}
        class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
      >
        <Save class="h-4 w-4" />
        {savingRepository ? 'Saving...' : 'Save repository'}
      </button>
    </div>
  </form>

  <form
    method="POST"
    action="?/saveSyncPoll"
    use:enhance={saveSyncPoll}
    class="overflow-hidden rounded-md border border-slate-200 bg-white"
  >
    <div class="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
      <Timer class="h-4 w-4 text-slate-500" />
      <h4 class="text-sm font-semibold text-slate-900">Sync Poll</h4>
    </div>

    <div class="px-4 py-4">
      <label class="block text-sm font-medium text-slate-700" for="sync-poll">Interval (seconds)</label>
      <input
        id="sync-poll"
        name="syncPollSeconds"
        type="number"
        min={data.limits.min}
        max={data.limits.max}
        bind:value={syncPollSeconds}
        class="field-input mt-2 w-full max-w-xs rounded-md border px-3 py-2 text-sm outline-none transition"
      />
      <p class="mt-1 text-xs text-slate-500">
        How often the cluster pulls and pushes GitDB changes. Between {data.limits.min} and {data.limits.max} seconds.
      </p>
    </div>

    <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
      <button
        type="submit"
        disabled={savingPoll || !repository}
        class="btn-primary inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
      >
        <Save class="h-4 w-4" />
        {savingPoll ? 'Saving...' : 'Save interval'}
      </button>
    </div>
  </form>
</div>
