<script lang="ts">
  import { Layers, ShieldCheck } from 'lucide-svelte';

  let error = '';
  let isSubmitting = false;
  let username = 'admin';
  let password = 'admin';

  async function submitLogin(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    isSubmitting = true;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const payload = await response.json().catch(() => ({}));

      if (response.ok && payload?.success) {
        window.location.href = '/projects';
        return;
      }

      error = payload?.error || 'Invalid credentials';
    } catch {
      error = 'Could not reach server. Please try again.';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<svelte:head>
  <title>Login - GitVault Suite</title>
</svelte:head>

<div class="relative grid min-h-[calc(100vh-2rem)] place-items-center overflow-hidden px-4 py-10 sm:px-6">
  <div class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,#dbeafe_0%,transparent_45%),radial-gradient(circle_at_80%_0%,#e2e8f0_0%,transparent_35%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)]"></div>

  <div class="w-full max-w-md border border-slate-200 bg-white/90 p-8 shadow-xl backdrop-blur sm:rounded-2xl">
    <div class="mb-8 flex items-start justify-between gap-4">
      <div>
        <p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Workspace</p>
        <h1 class="mt-2 text-2xl font-bold text-slate-900">Sign in to GitVault Suite</h1>
        <p class="mt-2 text-sm text-slate-600">Continue with your private admin workspace.</p>
      </div>
      <div class="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
        <Layers class="h-6 w-6" />
      </div>
    </div>

    {#if error}
      <div class="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    {/if}

    <form
      method="POST"
      action="/api/auth/login"
      on:submit={submitLogin}
      class="space-y-4"
    >
      <div>
        <label class="mb-1.5 block text-sm font-medium text-slate-700" for="username">Username</label>
        <input
          id="username"
          name="username"
          type="text"
          bind:value={username}
          class="w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
        />
      </div>

      <div>
        <label class="mb-1.5 block text-sm font-medium text-slate-700" for="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          bind:value={password}
          class="w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        class="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-500"
      >
        <ShieldCheck class="h-4 w-4" />
        {isSubmitting ? 'Signing in...' : 'Sign in'}
      </button>
    </form>

    <div class="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
      Default credentials for first start: <span class="font-medium text-slate-700">admin / admin</span>
    </div>
  </div>
</div>
