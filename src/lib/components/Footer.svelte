<script lang="ts">
  import { onMount } from 'svelte';
  import { FileText, GitBranch } from '@lucide/svelte';
  import GitDbStatusBadge from './GitDbStatusBadge.svelte';

  const POLL_MS = 15_000;

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

<footer class="app-shell-footer mt-auto border-t border-slate-200 bg-white/80 backdrop-blur">
  <div class="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
    <div class="flex items-center gap-3 text-sm text-slate-500">
      <span class="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
        <FileText class="h-4 w-4" />
      </span>
      <p>
        Released under the
        <a
          href="https://getgitops.com/license"
          target="_blank"
          rel="noopener noreferrer"
          class="font-medium text-slate-700 transition-colors hover:text-slate-950"
        >
          Elastic License 2.0
        </a>
      </p>
    </div>

    <div class="flex items-center gap-5">
      <a
        href="/cluster-settings/database"
        class="inline-flex items-center rounded-full border border-slate-200 px-3 py-1.5 transition-colors hover:bg-slate-50"
        aria-label="GitDB sync status"
      >
        <GitDbStatusBadge state={status.state} label={status.label} />
      </a>

      <a
        href="https://getgitops.com"
        target="_blank"
        rel="noopener noreferrer"
        class="text-sm text-slate-500 transition-colors hover:text-slate-950"
      >
        Developed by <span class="font-semibold text-slate-700">GetGitOps.com</span>
      </a>

      <a
        href="https://getgitops.com"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
        aria-label="GetGitOps.com"
      >
        <GitBranch class="h-4 w-4" />
      </a>
    </div>
  </div>
</footer>
