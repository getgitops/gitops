<script lang="ts">
  import { enhance } from '$app/forms';
  import { LoaderCircle, UserPlus } from '@lucide/svelte';
  import AuthShell from '#lib/components/AuthShell.svelte';
  import AuthNotice from '#lib/components/AuthNotice.svelte';
  import { _ } from '#lib/i18n';
  import { authErrorMessage } from '#lib/auth-errors';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let submitting = $state(false);
</script>

<svelte:head>
  <title>{$_('auth.registrationTitle')} - GitOps</title>
</svelte:head>

<AuthShell
  eyebrow={$_('auth.workspace')}
  title={$_('auth.registrationTitle')}
  subtitle={$_('auth.registrationSubtitle')}
>
  {#if !data.registrationEnabled}
    <AuthNotice>{$_('auth.registrationDisabled')}</AuthNotice>
    <a href="/auth/login" class="k-btn k-btn-primary w-full">{$_('auth.goToSignIn')}</a>
  {:else}
    {#if form?.error}<AuthNotice tone="error">{authErrorMessage(form.error, $_)}</AuthNotice>{/if}
    <form
      method="POST"
      action="?/register"
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
        <label class="k-label" for="username">{$_('common.username')}</label>
        <input
          id="username"
          name="username"
          type="text"
          autocomplete="username"
          class="k-input"
          value={form?.username ?? ''}
        />
      </div>
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
      <div class="grid gap-5 sm:grid-cols-2">
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
          <label class="k-label" for="passwordConfirmation">{$_('common.confirmPassword')}</label>
          <input
            id="passwordConfirmation"
            name="passwordConfirmation"
            type="password"
            autocomplete="new-password"
            class="k-input"
          />
        </div>
      </div>
      <button type="submit" class="k-btn k-btn-primary w-full" disabled={submitting}>
        {#if submitting}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<UserPlus
            class="h-4 w-4"
          />{/if}
        {submitting ? $_('auth.registering') : $_('auth.register')}
      </button>
    </form>
  {/if}

  {#snippet footer()}
    {#if data.registrationEnabled}
      {$_('auth.alreadyHaveAccount')}
      <a href="/auth/login" class="font-medium text-brand-400 hover:text-brand-300"
        >{$_('auth.signIn')}</a
      >
    {/if}
  {/snippet}
</AuthShell>
