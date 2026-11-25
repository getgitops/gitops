<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import {
    CircleAlert,
    CircleCheck,
    Database,
    GitBranch,
    GitCommitHorizontal,
    KeyRound,
    LoaderCircle,
    RefreshCw,
    Timer,
    User,
  } from '@lucide/svelte';
  import { toast } from '#lib/components/ui';
  import { _, locale } from '#lib/i18n';

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

  let { data }: { data: { repository: RepositoryConfig | null; status: SyncStatus } } = $props();

  let status = $state<SyncStatus>(untrack(() => data.status));
  const repository = $derived(data.repository);
  let syncing = $state(false);

  const authLabels = $derived({
    token: $_('clusterSettings.database.authToken'),
    basic: $_('clusterSettings.database.authBasic'),
    none: $_('clusterSettings.database.authNone'),
  });

  const stateMeta = $derived(
    {
      synced: {
        label: 'Sincronizado',
        badge: 'k-badge-ok',
        dot: 'bg-ok',
        icon: CircleCheck,
        tone: 'text-ok',
      },
      syncing: {
        label: 'Sincronizando',
        badge: 'k-badge-info',
        dot: 'bg-info animate-pulse',
        icon: LoaderCircle,
        tone: 'text-info',
      },
      error: {
        label: 'Error',
        badge: 'k-badge-danger',
        dot: 'bg-danger',
        icon: CircleAlert,
        tone: 'text-red-400',
      },
      unconfigured: {
        label: 'Sin configurar',
        badge: '',
        dot: 'bg-fg-subtle',
        icon: CircleAlert,
        tone: 'text-fg-subtle',
      },
    }[status.state],
  );

  async function refreshStatus() {
    try {
      const response = await fetch('/gitdb/status');
      if (response.ok) status = await response.json();
    } catch {
      // conserva el último estado ante fallos puntuales
    }
  }

  $effect(() => {
    const timer = setInterval(refreshStatus, 10_000);
    return () => clearInterval(timer);
  });

  const runSync: SubmitFunction = () => {
    syncing = true;
    status = { ...status, state: 'syncing', label: $_('clusterSettings.database.syncInProgress') };
    return async ({ result, update }) => {
      await update({ reset: false });
      syncing = false;
      await refreshStatus();
      if (result.type === 'success') {
        toast.success($_('clusterSettings.database.repositorySynchronized'));
      } else {
        toast.error(
          $_('clusterSettings.database.syncFailed'),
          result.type === 'failure' && result.data?.error ? String(result.data.error) : undefined,
        );
      }
    };
  };

  function dateTime(value: string | null) {
    if (!value) return '—';
    return new Intl.DateTimeFormat($locale ?? 'es', {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(new Date(value));
  }

  function relative(value: string | null) {
    if (!value) return null;
    const seconds = (new Date(value).getTime() - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat($locale ?? 'es', { numeric: 'auto' });
    for (const [unit, size] of [
      ['day', 86_400],
      ['hour', 3_600],
      ['minute', 60],
    ] as [Intl.RelativeTimeFormatUnit, number][]) {
      if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
    }
    return rtf.format(Math.round(seconds), 'second');
  }
</script>

<svelte:head>
  <title>{$_('clusterSettings.database.title')} - {$_('clusterSettings.title')}</title>
</svelte:head>

<div class="space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="max-w-2xl">
      <h1 class="text-2xl font-semibold tracking-tight text-white">
        {$_('clusterSettings.database.title')}
      </h1>
      <p class="mt-1 text-sm text-fg-muted">{$_('clusterSettings.database.description')}</p>
    </div>
    <form method="POST" action="?/syncNow" use:enhance={runSync}>
      <button type="submit" class="k-btn k-btn-primary" disabled={syncing || !repository}>
        <RefreshCw class="h-4 w-4 {syncing ? 'animate-spin' : ''}" />
        {syncing ? $_('clusterSettings.database.syncing') : $_('clusterSettings.database.syncNow')}
      </button>
    </form>
  </header>

  <!-- Estado -->
  <section
    class="k-card relative overflow-hidden {status.state === 'error' ? 'border-red-500/30' : ''}"
    aria-label={$_('clusterSettings.database.status')}
  >
    <div
      class="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full blur-3xl {status.state ===
      'error'
        ? 'bg-red-500/15'
        : status.state === 'synced'
          ? 'bg-ok/10'
          : 'bg-info/10'}"
    ></div>
    <div class="relative flex flex-wrap items-center gap-4 px-6 py-5">
      <span class="grid h-11 w-11 place-items-center rounded-xl bg-white/4 {stateMeta.tone}">
        <stateMeta.icon class="h-5 w-5 {status.state === 'syncing' ? 'animate-spin' : ''}" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="font-semibold text-white">{status.label}</p>
        <p class="text-xs text-fg-subtle">
          {#if status.lastSyncAt}
            Última sincronización {relative(status.lastSyncAt)} ·
          {/if}
          Se comprueba cada {repository?.syncPollSeconds ?? '—'} s
        </p>
      </div>
      <span class="k-badge {stateMeta.badge}">
        <span class="h-1.5 w-1.5 rounded-full {stateMeta.dot}"></span>{stateMeta.label}
      </span>
    </div>

    <dl class="relative grid border-t border-white/8 sm:grid-cols-2 lg:grid-cols-4">
      <div class="border-white/8 px-6 py-4 sm:border-r">
        <dt class="flex items-center gap-1.5 text-xs text-fg-subtle">
          <GitCommitHorizontal class="h-3.5 w-3.5" />{$_('clusterSettings.database.lastCommit')}
        </dt>
        <dd class="mt-1 truncate font-mono text-sm text-white" title={status.lastCommit ?? ''}>
          {status.lastCommit ? status.lastCommit.slice(0, 12) : '—'}
        </dd>
      </div>
      <div class="border-white/8 px-6 py-4 lg:border-r">
        <dt class="text-xs text-fg-subtle">{$_('clusterSettings.database.lastSync')}</dt>
        <dd class="mt-1 text-sm text-white">{dateTime(status.lastSyncAt)}</dd>
      </div>
      <div class="border-white/8 px-6 py-4 sm:border-r">
        <dt class="text-xs text-fg-subtle">{$_('clusterSettings.database.lastAttempt')}</dt>
        <dd class="mt-1 text-sm text-white">{dateTime(status.lastAttemptAt)}</dd>
      </div>
      <div class="px-6 py-4">
        <dt class="text-xs text-fg-subtle">{$_('clusterSettings.database.aheadBehind')}</dt>
        <dd class="mt-1 text-sm tabular-nums text-white">
          <span title="Commits locales sin subir">↑ {status.ahead}</span>
          <span class="ml-3" title="Commits remotos sin bajar">↓ {status.behind}</span>
        </dd>
      </div>
    </dl>

    {#if status.lastError}
      <div class="relative border-t border-red-500/20 bg-red-500/6 px-6 py-3">
        <p class="text-xs font-medium text-red-300">{$_('clusterSettings.database.lastError')}</p>
        <p class="mt-1 break-all font-mono text-xs text-red-200">{status.lastError}</p>
      </div>
    {/if}
  </section>

  <!-- Repositorio -->
  <section class="k-card overflow-hidden" aria-labelledby="repo-title">
    <div class="flex items-center gap-2 border-b border-white/8 px-6 py-4">
      <Database class="h-4 w-4 text-brand-400" />
      <h2 id="repo-title" class="font-semibold text-white">
        {$_('clusterSettings.database.repository')}
      </h2>
      <span class="ml-auto text-xs text-fg-subtle">Configurado por variables de entorno</span>
    </div>

    {#if repository}
      <dl class="divide-y divide-white/6">
        <div class="grid gap-1 px-6 py-3 sm:grid-cols-[14rem_1fr] sm:items-center">
          <dt class="font-mono text-xs text-fg-subtle">GITDB_REPOSITORY_URL</dt>
          <dd class="break-all font-mono text-sm text-white">{repository.repositoryUrl}</dd>
        </div>
        <div class="grid gap-1 px-6 py-3 sm:grid-cols-[14rem_1fr] sm:items-center">
          <dt class="font-mono text-xs text-fg-subtle">GITDB_BRANCH</dt>
          <dd>
            <span class="k-badge font-mono"><GitBranch class="h-3 w-3" />{repository.branch}</span>
          </dd>
        </div>
        <div class="grid gap-1 px-6 py-3 sm:grid-cols-[14rem_1fr] sm:items-center">
          <dt class="text-xs text-fg-subtle">{$_('clusterSettings.database.authentication')}</dt>
          <dd class="flex flex-wrap items-center gap-2 text-sm text-white">
            <KeyRound class="h-3.5 w-3.5 text-fg-subtle" />{authLabels[repository.authMode]}
            {#if repository.hasSecret}
              <span class="k-badge k-badge-ok"
                >{$_('clusterSettings.database.credentialLoaded')}</span
              >
            {/if}
          </dd>
        </div>
        <div class="grid gap-1 px-6 py-3 sm:grid-cols-[14rem_1fr] sm:items-center">
          <dt class="font-mono text-xs text-fg-subtle">GITDB_USERNAME</dt>
          <dd class="font-mono text-sm text-white">{repository.username ?? '—'}</dd>
        </div>
        <div class="grid gap-1 px-6 py-3 sm:grid-cols-[14rem_1fr] sm:items-center">
          <dt class="text-xs text-fg-subtle">{$_('clusterSettings.database.commitAuthor')}</dt>
          <dd class="flex items-center gap-2 text-sm text-white">
            <User class="h-3.5 w-3.5 text-fg-subtle" />{repository.authorName}
            <span class="text-fg-subtle">&lt;{repository.authorEmail}&gt;</span>
          </dd>
        </div>
        <div class="grid gap-1 px-6 py-3 sm:grid-cols-[14rem_1fr] sm:items-center">
          <dt class="font-mono text-xs text-fg-subtle">GITDB_SYNC_POLL_SECONDS</dt>
          <dd class="flex items-center gap-2 text-sm text-white">
            <Timer class="h-3.5 w-3.5 text-fg-subtle" />
            {$_('clusterSettings.database.everySeconds')}
            <span class="tabular-nums">{repository.syncPollSeconds}</span>
            {$_('clusterSettings.database.seconds')}
          </dd>
        </div>
      </dl>
    {:else}
      <p class="flex items-center gap-2 px-6 py-5 text-sm text-red-300">
        <CircleAlert class="h-4 w-4 shrink-0" />{$_('clusterSettings.database.repositoryMissing')}
      </p>
    {/if}
  </section>
</div>
