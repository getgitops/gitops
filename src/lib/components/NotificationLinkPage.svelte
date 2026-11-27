<script lang="ts">
  import { enhance } from '$app/forms';
  import { LoaderCircle, MailCheck, MailX } from '@lucide/svelte';
  import AuthShell from '#lib/components/AuthShell.svelte';
  import AuthNotice from '#lib/components/AuthNotice.svelte';
  import { _ } from '#lib/i18n';
  import type { NotificationLinkState } from '#lib/notifications/types';

  type Props = {
    kind: 'verify' | 'unsubscribe';
    token: string;
    link: NotificationLinkState;
  };
  let { kind, token, link }: Props = $props();
  let submitting = $state(false);
  let base = $derived(`notifications.${kind}`);
</script>

<svelte:head>
  <title>{$_(`${base}.title`)} - GitOps</title>
</svelte:head>

<AuthShell eyebrow="GitOps" title={$_(`${base}.title`)}>
  {#if link.state === 'ready'}
    <p class="mb-6 text-sm text-fg-muted">
      {$_(`${base}.question`, {
        values: { email: link.email, organization: link.organization },
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
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        class="k-btn w-full {kind === 'verify' ? 'k-btn-primary' : 'k-btn-danger'}"
        disabled={submitting}
      >
        {#if submitting}
          <LoaderCircle class="h-4 w-4 animate-spin" />
        {:else if kind === 'verify'}
          <MailCheck class="h-4 w-4" />
        {:else}
          <MailX class="h-4 w-4" />
        {/if}
        {$_(`${base}.confirm`)}
      </button>
    </form>
  {:else if link.state === 'done'}
    <AuthNotice tone="success">
      {$_(`${base}.done`, {
        values: { email: link.email, organization: link.organization },
      })}
    </AuthNotice>
  {:else}
    <AuthNotice tone="error">{$_(`notifications.link.${link.state}`)}</AuthNotice>
  {/if}
</AuthShell>
