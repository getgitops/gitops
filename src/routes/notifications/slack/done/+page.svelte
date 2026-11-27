<script lang="ts">
  import { ExternalLink } from '@lucide/svelte';
  import AuthShell from '#lib/components/AuthShell.svelte';
  import AuthNotice from '#lib/components/AuthNotice.svelte';
  import { _ } from '#lib/i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const errorKey = $derived(`notifications.errors.${data.error}`);
</script>

<svelte:head>
  <title>{$_('notifications.slackDone.title')} - GitOps</title>
</svelte:head>

<AuthShell eyebrow="GitOps" title={$_('notifications.slackDone.title')}>
  {#if data.connected}
    <AuthNotice tone="success">
      {$_('notifications.slackDone.connected', { values: { name: data.name } })}
    </AuthNotice>
    <p class="mt-4 text-sm text-fg-muted">{$_('notifications.slackDone.next')}</p>
  {:else}
    <AuthNotice tone="error">
      {$_(errorKey) === errorKey ? $_('notifications.errors.slack_exchange_failed') : $_(errorKey)}
    </AuthNotice>
    <p class="mt-4 text-sm text-fg-muted">{$_('notifications.slackDone.retry')}</p>
  {/if}
  {#if data.slackUrl}
    <a href={data.slackUrl} class="k-btn k-btn-primary mt-6 w-full" data-testid="slack-back">
      <ExternalLink class="h-4 w-4" />{$_('notifications.slackDone.back')}
    </a>
  {/if}
</AuthShell>
