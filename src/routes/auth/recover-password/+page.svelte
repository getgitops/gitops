<script lang="ts">
  import { enhance } from '$app/forms';
  import { LoaderCircle, Mail } from '@lucide/svelte';
  import AuthShell from '#lib/components/AuthShell.svelte';
  import AuthNotice from '#lib/components/AuthNotice.svelte';
  import { _ } from '#lib/i18n';
  import { authErrorMessage } from '#lib/auth-errors';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
  let submitting = $state(false);
</script>

<svelte:head>
  <title>{$_('auth.recoverPasswordTitle')} - GitOps</title>
</svelte:head>

<AuthShell
  eyebrow={$_('auth.workspace')}
  title={$_('auth.recoverPasswordTitle')}
  subtitle={$_('auth.recoverPasswordSubtitle')}
>
  {#if form?.success}
    <AuthNotice tone="success">{$_('auth.recoverPasswordSuccess')}</AuthNotice>
  {:else}
    {#if form?.error}<AuthNotice tone="error">{authErrorMessage(form.error, $_)}</AuthNotice>{/if}
    <form
      method="POST"
      action="?/recover"
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
        />
      </div>
      <button type="submit" class="k-btn k-btn-primary w-full" disabled={submitting}>
        {#if submitting}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Mail
            class="h-4 w-4"
          />{/if}
        {submitting ? $_('auth.sendingResetLink') : $_('auth.sendResetLink')}
      </button>
    </form>
  {/if}

  {#snippet footer()}
    <a href="/auth/login" class="font-medium text-brand-400 hover:text-brand-300"
      >{$_('auth.goToSignIn')}</a
    >
  {/snippet}
</AuthShell>
