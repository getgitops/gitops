<script lang="ts">
  import { onMount } from 'svelte';
  import { FileText } from '@lucide/svelte';
  import GitDbStatusBadge from './GitDbStatusBadge.svelte';
  import { _ } from 'svelte-i18n';

  const POLL_MS = 15_000;

  export let showSyncStatus = false;
  export let syncStatusHref: string | null = null;

  let status: { state: 'synced' | 'syncing' | 'error' | 'unconfigured'; label: string } = {
    state: 'unconfigured',
    label: 'Checking sync status...',
  };

  async function refresh() {
    try {
      const response = await fetch('/gitdb/status');
      if (!response.ok) return;
      status = await response.json();
    } catch {
      // transient network failures keep the last known status
    }
  }

  onMount(() => {
    void refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  });
</script>

<footer class="app-shell-footer mt-auto border-t border-[#142236] bg-[#05101d]/82 backdrop-blur">
  <div class="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-6 py-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
    <div class="flex items-center gap-3 text-sm text-slate-400">
      <span class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#1b2b42] bg-[#071323] text-slate-300">
        <FileText class="h-4 w-4" />
      </span>
      <p>
        {$_('footer.releasedUnder')}
        <a
          href="https://getgitops.com/license"
          target="_blank"
          rel="noopener noreferrer"
          class="font-medium text-slate-300 transition-colors hover:text-white"
        >
          {$_('footer.license')}
        </a>
      </p>
    </div>

    <div class="flex items-center gap-5">
      {#if showSyncStatus}
        {#if syncStatusHref}
          <a
            href={syncStatusHref}
            class="inline-flex items-center rounded-lg border border-[#1b2b42] bg-[#071323] px-3 py-2 transition-colors hover:bg-[#102139]"
            aria-label={$_('footer.gitdbSyncStatus')}
          >
            <GitDbStatusBadge state={status.state} label={status.label} />
          </a>
        {:else}
          <span
            class="inline-flex items-center rounded-lg border border-[#1b2b42] bg-[#071323] px-3 py-2"
            aria-label={$_('footer.gitdbSyncStatus')}
          >
            <GitDbStatusBadge state={status.state} label={status.label} />
          </span>
        {/if}
      {/if}

      <a
        href="https://getgitops.com"
        target="_blank"
        rel="noopener noreferrer"
        class="text-sm text-slate-400 transition-colors hover:text-white"
      >
        {$_('footer.developedBy')} <span class="font-semibold text-[#0d7dff]">GetGitOps.com</span>
      </a>

      <a
        href="https://github.com/getgitops/gitops"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#1b2b42] bg-[#071323] text-slate-300 transition-colors hover:border-[#294467] hover:bg-[#102139] hover:text-white"
        aria-label="GitHub getgitops/gitops"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path
            d="M12 2C6.48 2 2 6.58 2 12.24c0 4.52 2.87 8.35 6.84 9.71.5.09.68-.22.68-.49v-1.73c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.56 2.35 1.11 2.92.85.09-.67.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.35 9.35 0 0 1 12 6.96c.85 0 1.7.12 2.5.35 1.9-1.32 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9v2.79c0 .27.18.59.69.49A10.17 10.17 0 0 0 22 12.24C22 6.58 17.52 2 12 2Z"
          />
        </svg>
      </a>
    </div>
  </div>
</footer>
