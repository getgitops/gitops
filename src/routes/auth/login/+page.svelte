<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { LoaderCircle, LogIn } from '@lucide/svelte';
  import AuthShell from '#lib/components/AuthShell.svelte';
  import AuthNotice from '#lib/components/AuthNotice.svelte';
  import { _ } from '#lib/i18n';
  import { authErrorMessage } from '#lib/auth-errors';
  import type { ActionData } from './$types';

  let {
    data,
    form,
  }: {
    data: { registrationEnabled: boolean; googleSsoEnabled: boolean; ssoError: string | null };
    form: ActionData;
  } = $props();

  let submitting = $state(false);

  const loggedOut = $derived(page.url.searchParams.has('loggedOut'));
  const passwordReset = $derived(page.url.searchParams.has('passwordReset'));

  const SSO_ERROR_KEYS: Record<string, string> = {
    cancelled: 'auth.ssoErrorCancelled',
    not_configured: 'auth.ssoErrorNotConfigured',
    invalid_state: 'auth.ssoErrorInvalidState',
    email_not_verified: 'auth.ssoErrorEmailNotVerified',
    domain_not_allowed: 'auth.ssoErrorDomainNotAllowed',
    not_invited: 'auth.ssoErrorNotInvited',
    account_disabled: 'auth.ssoErrorNotInvited',
  };
  const ssoErrorMessage = $derived(
    data.ssoError ? $_(SSO_ERROR_KEYS[data.ssoError] ?? 'auth.ssoErrorGeneric') : '',
  );
</script>

<svelte:head>
  <title>{$_('auth.loginTitle')} - GitOps</title>
</svelte:head>

<AuthShell
  eyebrow={$_('auth.workspace')}
  title={$_('auth.signInTitle')}
  subtitle={$_('auth.signInSubtitle')}
>
  {#if loggedOut}<AuthNotice>{$_('auth.signedOut')}</AuthNotice>{/if}
  {#if passwordReset}<AuthNotice tone="success">{$_('auth.passwordResetSuccess')}</AuthNotice>{/if}
  {#if ssoErrorMessage}<AuthNotice tone="error">{ssoErrorMessage}</AuthNotice>{/if}

  {#if data.googleSsoEnabled}
    <a href="/auth/sso/google/start" data-sveltekit-reload class="k-btn k-btn-secondary w-full">
      <svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24Z"
        />
        <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3Z" />
        <path
          fill="#EA4335"
          d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"
        />
      </svg>
      {$_('auth.ssoContinueWithGoogle')}
    </a>
    <div class="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-fg-subtle">
      <span class="h-px flex-1 bg-white/10"></span>
      {$_('auth.ssoDivider')}
      <span class="h-px flex-1 bg-white/10"></span>
    </div>
  {/if}

  {#if form?.error}<AuthNotice tone="error">{authErrorMessage(form.error, $_)}</AuthNotice>{/if}

  <form
    method="POST"
    action="?/login"
    class="space-y-5"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        await update();
        submitting = false;
      };
    }}
  >
    <div>
      <label class="k-label" for="email">{$_('common.email')}</label>
      <input
        id="email"
        name="email"
        type="email"
        autocomplete="email"
        class="k-input"
        value={form?.email ?? ''}
        data-autofocus
      />
    </div>
    <div>
      <div class="flex items-baseline justify-between gap-2">
        <label class="k-label" for="password">{$_('common.password')}</label>
        <a href="/auth/recover-password" class="text-xs text-fg-subtle hover:text-brand-300"
          >{$_('auth.forgotPassword')}</a
        >
      </div>
      <input
        id="password"
        name="password"
        type="password"
        autocomplete="current-password"
        class="k-input"
      />
    </div>
    <button type="submit" class="k-btn k-btn-primary w-full" disabled={submitting}>
      {#if submitting}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<LogIn
          class="h-4 w-4"
        />{/if}
      {submitting ? $_('auth.signingIn') : $_('auth.signIn')}
    </button>
  </form>

  {#snippet footer()}
    {#if data.registrationEnabled}
      {$_('auth.needAccount')}
      <a href="/auth/registration" class="font-medium text-brand-400 hover:text-brand-300"
        >{$_('auth.register')}</a
      >
    {/if}
  {/snippet}
</AuthShell>
