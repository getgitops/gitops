<script lang="ts">
  import { AlertTriangle, Cloud, CircleAlert, GitBranch, Lock, RefreshCw } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import StackDetail from '#lib/components/state-iac/StackDetail.svelte';
  import { Select } from '#lib/components/ui';
  import { _, locale } from '#lib/i18n';
  import { relativeTime } from '#lib/state-iac/format';
  import { refreshStacks } from '#lib/state-iac/refresh';
  import StateIacSkeleton from '#lib/components/state-iac/StateIacSkeleton.svelte';
  import type { EnvironmentView, StackListing, StackPanel } from '#lib/state-iac/types';

  type Props = {
    data: {
      project: { name: string };
      base: string;
      organizationSettingsHref: string;
      canReadStates: boolean;
      canReadHistory: boolean;
      /** Streamed: the bucket is read after the page is already on screen. */
      listing: Promise<StackListing>;
      panel: Promise<StackPanel>;
    };
  };
  let { data }: Props = $props();

  let refreshing = $state(false);
  const MAX_STRIP = 8;

  const href = (key: string) => `${data.base}?${new URLSearchParams({ stack: key })}`;
  const label = (env: EnvironmentView) => `${env.project ?? '?'} / ${env.stack}`;
  const rel = (value: string | null | undefined) => relativeTime(value, $locale);
  const SYMBOL = { succeeded: '✓', failed: '✗', 'in-progress': '…', unknown: '?' } as const;

  const optionsOf = (environments: EnvironmentView[]) =>
    environments.map((env) => ({
      value: env.key,
      label: label(env),
      hint: [
        rel(env.lastUpdate?.at ?? env.updatedAt),
        env.lastUpdate ? SYMBOL[env.lastUpdate.result] : null,
      ]
        .filter(Boolean)
        .join(' · '),
    }));

  const DOT = { ok: 'bg-ok', warn: 'bg-warn', critical: 'bg-danger' } as const;

  function choose(key: string) {
    // same page, other stack: the URL is built from the stack list the server sent
    void goto(href(key));
  }

  async function refresh() {
    refreshing = true;
    await refreshStacks(new URL(page.url.href));
    refreshing = false;
  }
</script>

<svelte:head>
  <title>{$_('project.stateIac.title')} - {data.project.name}</title>
</svelte:head>

{#snippet failure(code: string)}
  <p
    class="k-card flex items-start gap-2 border-danger/30 px-4 py-3 text-sm text-red-200"
    role="alert"
    data-testid="state-iac-error"
  >
    <CircleAlert class="mt-0.5 h-4 w-4 shrink-0 text-danger" />
    {$_(`stateIac.errors.${code}`)}
  </p>
{/snippet}

<div class="space-y-6">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-white">
        {$_('project.stateIac.title')}
      </h1>
      <p class="mt-1 text-sm text-fg-muted">{$_('stateIac.stacks.projectDescription')}</p>
    </div>
  </div>

  {#await data.listing}
    <StateIacSkeleton variant="toolbar" />
    <StateIacSkeleton variant="detail" />
  {:then listing}
    {#if listing.kind === 'empty'}
      <div class="k-card border-dashed px-6 py-10 text-center" data-testid="stacks-empty">
        <GitBranch class="mx-auto h-8 w-8 text-fg-subtle" />
        <p class="mt-3 text-sm font-medium text-fg">{$_('stateIac.stacks.emptyTitle')}</p>
        <p class="mx-auto mt-1 max-w-md text-sm text-fg-muted">
          {$_('stateIac.stacks.emptyDescription')}
        </p>
      </div>
    {:else if listing.kind === 'notfound'}
      <div class="k-card border-dashed px-6 py-10 text-center" data-testid="stack-not-found">
        <GitBranch class="mx-auto h-8 w-8 text-fg-subtle" />
        <p class="mt-3 text-sm font-medium text-fg">{$_('stateIac.dashboard.notFoundTitle')}</p>
        <p class="mx-auto mt-1 max-w-md text-sm text-fg-muted">
          {$_('stateIac.dashboard.notFoundDescription')}
        </p>
        <a href={data.base} class="k-btn k-btn-secondary mt-4"
          >{$_('stateIac.dashboard.backToStacks')}</a
        >
      </div>
    {:else if listing.kind === 'error'}
      {@render failure(listing.code)}
    {:else}
      <div class="flex flex-wrap items-end gap-3" data-testid="stack-toolbar">
        <div class="min-w-64 flex-1 sm:max-w-md">
          <label for="stack-selector" class="k-label">{$_('stateIac.dashboard.selectStack')}</label>
          <Select
            id="stack-selector"
            searchable
            mono
            searchPlaceholder={$_('stateIac.dashboard.searchStack')}
            value={listing.selectedKey}
            options={optionsOf(listing.environments)}
            onchange={choose}
          />
        </div>
        <p
          class="flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs {listing
            .backend.lastError
            ? 'border-danger/30 text-red-200'
            : 'text-fg-muted'}"
          data-testid="backend-chip"
        >
          {#if listing.backend.lastError}
            <AlertTriangle class="h-4 w-4 shrink-0 text-danger" />
          {:else}
            <Cloud class="h-4 w-4 shrink-0 text-fg-subtle" />
          {/if}
          <span class="font-medium text-fg">{listing.backend.name}</span>
          <span class="font-mono text-fg-subtle">{listing.backend.location}</span>
          {#if listing.backend.lastError}
            <span
              >{$_('stateIac.dashboard.backendError', {
                values: { error: $_(`stateIac.errors.${listing.backend.lastError}`) },
              })}</span
            >
          {/if}
        </p>
        {#if listing.locked}
          <span class="k-badge k-badge-warn h-9 gap-1 px-2.5 text-xs"
            ><Lock class="h-3.5 w-3.5" />{$_('stateIac.stacks.locked')}</span
          >
        {/if}
        <button
          type="button"
          class="k-btn k-btn-secondary ml-auto"
          onclick={refresh}
          disabled={refreshing}
        >
          <RefreshCw class="h-4 w-4 {refreshing ? 'animate-spin' : ''}" />
          {$_('stateIac.stacks.refresh')}
        </button>
      </div>

      <section aria-label={$_('stateIac.dashboard.environmentsLabel')}>
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="environments">
          {#each listing.environments.slice(0, MAX_STRIP) as env (env.key)}
            <li>
              <a
                href={href(env.key)}
                class="k-card k-card-hover block p-3 {env.key === listing.selectedKey
                  ? 'border-brand-500/60'
                  : ''}"
                aria-current={env.key === listing.selectedKey ? 'true' : undefined}
                data-testid="environment"
                data-stack="{env.project}/{env.stack}"
              >
                <span class="flex items-center gap-2 text-sm font-medium text-fg">
                  <span class="h-2 w-2 shrink-0 rounded-full {DOT[env.health.level]}"></span>
                  <span class="truncate font-mono">{label(env)}</span>
                </span>
                <span class="mt-1 block text-xs text-fg-muted">
                  {$_(`stateIac.dashboard.health.${env.health.level}`)}
                  · {$_('stateIac.dashboard.resourcesShort', {
                    values: { count: env.resourceCount },
                  })}
                </span>
                <span class="block text-xs text-fg-subtle">
                  {rel(env.lastUpdate?.at ?? env.updatedAt) ?? $_('stateIac.dashboard.noDeploys')}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </section>

      {#await data.panel}
        <StateIacSkeleton variant="detail" />
      {:then panel}
        {#if panel.kind === 'ready'}
          {#key listing.selectedKey}
            <StackDetail
              compact
              dashboard={panel.dashboard}
              warnings={listing.warnings}
              detail={panel.detail}
              canReadStates={data.canReadStates}
              canReadHistory={data.canReadHistory}
              backHref={data.base}
              apiBase={panel.apiBase}
              scopeQuery={panel.scopeQuery}
            />
          {/key}
        {:else if panel.kind === 'error'}
          {@render failure(panel.code)}
        {/if}
      {/await}
    {/if}
  {/await}
</div>
