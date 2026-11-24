<script lang="ts">
  import { enhance } from '$app/forms';
  import { MailCheck, MailX } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import type { NotificationLinkState } from '#lib/notifications/types';

  type Props = {
    /** Which link this page serves: texts live under `notifications.<kind>.*`. */
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

<div
  class="relative grid min-h-[calc(100vh-2rem)] place-items-center overflow-hidden px-4 py-10 sm:px-6"
>
  <div
    class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,#dbeafe_0%,transparent_45%),radial-gradient(circle_at_80%_0%,#e2e8f0_0%,transparent_35%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)]"
  ></div>

  <div
    class="w-full max-w-md border border-slate-200 bg-white/90 p-8 text-center shadow-xl backdrop-blur sm:rounded-2xl"
  >
    <img src="/gitops_logo_white.png" alt="GitOps" class="mx-auto mb-6 h-14 w-auto" />
    <div class="mb-4 flex justify-center text-slate-700">
      {#if kind === 'verify'}
        <MailCheck class="h-8 w-8" />
      {:else}
        <MailX class="h-8 w-8" />
      {/if}
    </div>
    <h1 class="text-2xl font-bold text-slate-900">{$_(`${base}.title`)}</h1>

    {#if link.state === 'ready'}
      <p class="mt-3 text-sm text-slate-600">
        {$_(`${base}.question`, {
          values: { email: link.email, organization: link.organization },
        })}
      </p>
      <form
        method="POST"
        class="mt-6"
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
          class="btn-primary inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          disabled={submitting}
        >
          {$_(`${base}.confirm`)}
        </button>
      </form>
    {:else if link.state === 'done'}
      <p
        class="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        role="status"
      >
        {$_(`${base}.done`, {
          values: { email: link.email, organization: link.organization },
        })}
      </p>
    {:else}
      <p
        class="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        role="alert"
      >
        {$_(`notifications.link.${link.state}`)}
      </p>
    {/if}
  </div>
</div>
