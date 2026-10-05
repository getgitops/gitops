<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import type { ActionData } from './$types';
  import { ShieldCheck } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

  export let data: {
    registrationEnabled: boolean;
    sso: { organizationSlug: string; organizationName: string; google: boolean } | null;
    ssoError: string | null;
  };
  export let form: ActionData;

  let isSubmitting = false;

  $: email = form?.email ?? '';
  $: loggedOut = $page.url.searchParams.has('loggedOut');
  $: passwordReset = $page.url.searchParams.has('passwordReset');

  const SSO_ERROR_KEYS: Record<string, string> = {
    cancelled: 'auth.ssoErrorCancelled',
    not_configured: 'auth.ssoErrorNotConfigured',
    invalid_state: 'auth.ssoErrorInvalidState',
    email_not_verified: 'auth.ssoErrorEmailNotVerified',
    domain_not_allowed: 'auth.ssoErrorDomainNotAllowed',
    not_invited: 'auth.ssoErrorNotInvited',
    account_disabled: 'auth.ssoErrorNotInvited',
  };
  $: ssoErrorMessage = data.ssoError
    ? $_(SSO_ERROR_KEYS[data.ssoError] ?? 'auth.ssoErrorGeneric')
    : '';
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
      <img src="/gitops_logo_white.png" alt="GitOps" class="h-14 w-auto shrink-0 sm:h-16" />

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

    {#if passwordReset}
      <div
        class="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
      >
        {$_('auth.passwordResetSuccess')}
      </div>
    {/if}

    {#if ssoErrorMessage}
      <div class="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {ssoErrorMessage}
      </div>
    {/if}

    {#if data.sso?.google}
      <a
        href="/auth/sso/google/start?org={encodeURIComponent(data.sso.organizationSlug)}"
        data-sveltekit-reload
        class="inline-flex w-full items-center justify-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3Z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
        </svg>
        {$_('auth.ssoContinueWithGoogle')}
      </a>
      <p class="mt-2 text-center text-xs text-slate-500">
        {$_('auth.ssoOrganizationHint', { values: { organization: data.sso.organizationName } })}
      </p>

      <div class="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
        <span class="h-px flex-1 bg-slate-200"></span>
        {$_('auth.ssoDivider')}
        <span class="h-px flex-1 bg-slate-200"></span>
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
        <div class="mb-1.5 flex items-center justify-between">
          <label class="block text-sm font-medium text-slate-700" for="password"
            >{$_('common.password')}</label
          >
          <a href="/auth/recover-password" class="text-xs font-medium text-slate-500 underline hover:text-slate-700">
            {$_('auth.forgotPassword')}
          </a>
        </div>
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

    {#if data.registrationEnabled}
      <p class="mt-6 text-center text-sm text-slate-600">
        {$_('auth.needAccount')}
        <a href="/auth/registration" class="font-medium text-slate-900 underline">{$_('auth.register')}</a>
      </p>
    {/if}
  </div>

  <a
    href="https://getgitops.com"
    class="mt-6 rounded-full border border-slate-300 bg-white/70 px-4 py-1.5 text-sm font-medium text-slate-600 backdrop-blur transition hover:border-slate-400 hover:text-slate-900"
  >
    {$_('auth.backToWebsite')}
  </a>
</div>
