<script lang="ts">
  import { enhance } from '$app/forms';
  import { LoaderCircle, ShieldCheck } from '@lucide/svelte';
  import AuthShell from '#lib/components/AuthShell.svelte';
  import AuthNotice from '#lib/components/AuthNotice.svelte';
  import { _ } from '#lib/i18n';
  import { authErrorMessage } from '#lib/auth-errors';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let submitting = $state(false);
</script>

<svelte:head>
  <title>{$_('auth.acceptInvitationTitle')} - GitOps</title>
</svelte:head>

<AuthShell eyebrow={$_('auth.invitationLabel')} title={$_('auth.acceptInvitationTitle')}>
  {#snippet intro()}
    {#if data.username}
      {$_('auth.setPasswordPrefix')}
      <span class="font-medium text-white">{data.username}</span>
      {$_('auth.setPasswordSuffix')}
    {/if}
  {/snippet}

  {#if data.error}
    <AuthNotice tone="error">{data.error}</AuthNotice>
    <a href="/auth/login" class="k-btn k-btn-secondary w-full">{$_('auth.goToSignIn')}</a>
  {:else}
    {#if form?.error}<AuthNotice tone="error">{authErrorMessage(form.error, $_)}</AuthNotice>{/if}
    <form
      method="POST"
      action="?/accept"
      class="space-y-5"
      use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          await update();
          submitting = false;
        };
      }}
    >
      <input type="hidden" name="token" value={data.token} />
      <div>
        <label class="k-label" for="email">{$_('common.email')}</label>
        <input id="email" type="email" class="k-input" value={data.email ?? ''} disabled />
      </div>
      <div>
        <label class="k-label" for="password">{$_('common.password')}</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="new-password"
          class="k-input"
        />
      </div>
      <div>
        <label class="k-label" for="confirmPassword">{$_('common.confirmPassword')}</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autocomplete="new-password"
          class="k-input"
        />
      </div>
      <button type="submit" class="k-btn k-btn-primary w-full" disabled={submitting}>
        {#if submitting}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<ShieldCheck
            class="h-4 w-4"
          />{/if}
        {submitting ? $_('auth.activating') : $_('auth.activateAccount')}
      </button>
    </form>
  {/if}
</AuthShell>
