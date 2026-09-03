<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { ShieldCheck } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

  export let form: { email?: string; error?: string } | null = null;

  let isSubmitting = false;

  $: email = form?.email ?? '';
  $: loggedOut = $page.url.searchParams.has('loggedOut');
</script>

<svelte:head>
  <title>{$_('auth.loginTitle')} - GitOps</title>
</svelte:head>

<div
  class="relative grid min-h-[calc(100vh-2rem)] place-items-center overflow-hidden px-4 py-10 sm:px-6"
>
  <div
    class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,#dbeafe_0%,transparent_45%),radial-gradient(circle_at_80%_0%,#e2e8f0_0%,transparent_35%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)]"
  ></div>

  <div
    class="w-full max-w-md border border-slate-200 bg-white/90 p-8 shadow-xl backdrop-blur sm:rounded-2xl"
  >
    <div class="mb-8 flex flex-col items-center gap-4 text-center">
      <img src="/gitops_logo.png" alt="GitOps" class="h-24 w-auto shrink-0 sm:h-32" />

      <div>
        <p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          {$_('auth.workspace')}
        </p>
        <h1 class="mt-2 text-2xl font-bold text-slate-900">{$_('auth.signInTitle')}</h1>
        <p class="mt-2 text-sm text-slate-600">{$_('auth.signInSubtitle')}</p>
      </div>
    </div>

    {#if loggedOut}
      <div
        class="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
      >
        {$_('auth.signedOut')}
      </div>
    {/if}

    {#if form?.error}
      <div class="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {form.error}
      </div>
    {/if}

    <form
      method="POST"
      action="?/login"
      use:enhance={() => {
        isSubmitting = true;
        return async ({ update }) => {
          await update();
          isSubmitting = false;
        };
      }}
      class="space-y-4"
    >
      <div>
        <label class="mb-1.5 block text-sm font-medium text-slate-700" for="email"
          >{$_('common.email')}</label
        >
        <input
          id="email"
          name="email"
          type="email"
          autocomplete="email"
          value={email}
          class="field-input w-full rounded-md border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition"
        />
      </div>

      <div>
        <label class="mb-1.5 block text-sm font-medium text-slate-700" for="password"
          >{$_('common.password')}</label
        >
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          class="field-input w-full rounded-md border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        class="btn-primary inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold"
      >
        <ShieldCheck class="h-4 w-4" />
        {isSubmitting ? $_('auth.signingIn') : $_('auth.signIn')}
      </button>
    </form>
  </div>
</div>
