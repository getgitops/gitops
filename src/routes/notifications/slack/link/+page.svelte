<script lang="ts">
  import { enhance } from '$app/forms';
  import { Link2, LoaderCircle } from '@lucide/svelte';
  import AuthShell from '#lib/components/AuthShell.svelte';
  import AuthNotice from '#lib/components/AuthNotice.svelte';
  import { _ } from '#lib/i18n';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let submitting = $state(false);
  const result = $derived(form?.result ?? null);
</script>

<svelte:head>
  <title>{$_('notifications.slackLink.title')} - GitOps</title>
</svelte:head>

<AuthShell eyebrow="GitOps" title={$_('notifications.slackLink.title')}>
  {#if result === 'linked'}
    <AuthNotice tone="success">{$_('notifications.slackLink.done')}</AuthNotice>
  {:else if result}
    <AuthNotice tone="error">{$_(`notifications.slackLink.errors.${result}`)}</AuthNotice>
  {:else if data.link.state === 'ready'}
    <p class="mb-6 text-sm text-fg-muted" data-testid="slack-link-question">
      {$_('notifications.slackLink.question', {
        values: {
          slackUser: data.link.slackUserName ?? 'Slack',
          team: data.link.teamName,
          username: data.link.username,
          organization: data.link.organization,
        },
      })}
    </p>
    <form
      method="POST"
      use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          await update();
          submitting = false;
        };
      }}
    >
      <input type="hidden" name="token" value={data.token} />
      <button type="submit" class="k-btn k-btn-primary w-full" disabled={submitting}>
        {#if submitting}
          <LoaderCircle class="h-4 w-4 animate-spin" />
        {:else}
          <Link2 class="h-4 w-4" />
        {/if}
        {$_('notifications.slackLink.confirm')}
      </button>
    </form>
  {:else}
    <AuthNotice tone="error">{$_('notifications.slackLink.errors.invalid')}</AuthNotice>
  {/if}
</AuthShell>
