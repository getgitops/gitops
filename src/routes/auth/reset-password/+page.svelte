<script lang="ts">
  import { enhance } from '$app/forms';
  import { KeyRound, LoaderCircle } from '@lucide/svelte';
  import AuthShell from '#lib/components/AuthShell.svelte';
  import AuthNotice from '#lib/components/AuthNotice.svelte';
  import { _ } from '#lib/i18n';
  import { authErrorMessage } from '#lib/auth-errors';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let submitting = $state(false);
  const token = $derived(form?.token ?? data.token);
</script>

<svelte:head>
  <title>{$_('auth.resetPasswordTitle')} - GitOps</title>
</svelte:head>

<AuthShell
  eyebrow={$_('auth.workspace')}
  title={$_('auth.resetPasswordTitle')}
  subtitle={$_('auth.resetPasswordSubtitle')}
>
  {#if !token}
    <AuthNotice tone="error">{$_('auth.invalidResetLink')}</AuthNotice>
    <a href="/auth/recover-password" class="k-btn k-btn-secondary w-full"
      >{$_('auth.recoverPasswordTitle')}</a
    >
  {:else}
    {#if form?.error}<AuthNotice tone="error">{authErrorMessage(form.error, $_)}</AuthNotice>{/if}
    <form
      method="POST"
      action="?/reset"
      class="space-y-5"
      use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          await update();
          submitting = false;
        };
      }}
    >
      <input type="hidden" name="token" value={token} />
      <div>
        <label class="k-label" for="password">{$_('auth.newPassword')}</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="new-password"
          class="k-input"
        />
      </div>
      <div>
        <label class="k-label" for="passwordConfirmation">{$_('common.confirmPassword')}</label>
        <input
          id="passwordConfirmation"
          name="passwordConfirmation"
          type="password"
          autocomplete="new-password"
          class="k-input"
        />
      </div>
      <button type="submit" class="k-btn k-btn-primary w-full" disabled={submitting}>
        {#if submitting}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<KeyRound
            class="h-4 w-4"
          />{/if}
        {submitting ? $_('auth.resetting') : $_('auth.resetPassword')}
      </button>
    </form>
  {/if}

  {#snippet footer()}
    <a href="/auth/login" class="font-medium text-brand-400 hover:text-brand-300"
      >{$_('auth.goToSignIn')}</a
    >
  {/snippet}
</AuthShell>
