<script lang="ts">
  import { CircleAlert, CircleCheck, Copy, ExternalLink, Hash, Info } from '@lucide/svelte';
  import { toast } from '#lib/components/ui';
  import { _ } from '#lib/i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success($_('clusterSettings.slack.copied'));
    } catch {
      toast.error($_('alerts.wizard.failed'));
    }
  }
</script>

<svelte:head>
  <title>{$_('clusterSettings.slack.title')} - {$_('clusterSettings.title')}</title>
</svelte:head>

<div class="space-y-6">
  <header class="max-w-2xl">
    <h1 class="text-2xl font-semibold tracking-tight text-white">
      {$_('clusterSettings.slack.title')}
    </h1>
    <p class="mt-1 text-sm text-fg-muted">{$_('clusterSettings.slack.description')}</p>
  </header>

  <section class="k-card">
    <div class="flex items-start gap-4 px-6 py-5">
      <span
        class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-400"
        ><Hash class="h-5 w-5" /></span
      >
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-semibold text-white">{$_('clusterSettings.slack.statusTitle')}</h2>
          {#if data.status.configured}
            <span class="k-badge k-badge-ok" data-testid="slack-status">
              <CircleCheck class="h-3.5 w-3.5" />{$_('clusterSettings.slack.configured')}
            </span>
          {:else if data.status.reason === 'invalid'}
            <span class="k-badge k-badge-danger" data-testid="slack-status">
              <CircleAlert class="h-3.5 w-3.5" />{$_('clusterSettings.slack.invalid')}
            </span>
          {:else}
            <span class="k-badge" data-testid="slack-status">
              {$_('clusterSettings.slack.notConfigured')}
            </span>
          {/if}
        </div>
        <p class="mt-1 text-sm text-fg-muted">
          {data.status.configured
            ? $_('clusterSettings.slack.configuredHelp')
            : $_('clusterSettings.slack.notConfiguredHelp')}
        </p>
      </div>
    </div>
  </section>

  <section class="k-card space-y-5 px-6 py-5">
    <h2 class="font-semibold text-white">{$_('clusterSettings.slack.setupTitle')}</h2>

    <ol class="list-decimal space-y-5 pl-5 text-sm text-fg-muted marker:text-fg-subtle">
      <li class="space-y-2">
        <p>{$_('clusterSettings.slack.step1')}</p>
        <a
          href={data.manifestUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="k-btn k-btn-primary k-btn-sm"
          data-testid="slack-manifest-link"
        >
          <ExternalLink class="h-4 w-4" />{$_('clusterSettings.slack.createApp')}
        </a>
        <details class="text-xs">
          <summary class="cursor-pointer text-fg-subtle hover:text-white">
            {$_('clusterSettings.slack.showManifest')}
          </summary>
          <div class="relative mt-2">
            <pre
              class="max-h-72 overflow-auto rounded-lg bg-ink-900 p-3 font-mono text-xs text-white">{data.manifest}</pre>
            <button
              type="button"
              class="k-btn k-btn-ghost k-btn-icon k-btn-sm absolute right-2 top-2"
              aria-label={$_('clusterSettings.slack.copy')}
              title={$_('clusterSettings.slack.copy')}
              onclick={() => copy(data.manifest)}><Copy class="h-4 w-4" /></button
            >
          </div>
        </details>
      </li>
      <li class="space-y-2">
        <p>{$_('clusterSettings.slack.step2')}</p>
        <div class="flex items-center gap-2">
          <code
            class="min-w-0 flex-1 truncate rounded-lg bg-ink-900 px-3 py-2 font-mono text-xs text-white"
            data-testid="slack-redirect-uri">{data.redirectUri}</code
          >
          <button
            type="button"
            class="k-btn k-btn-ghost k-btn-icon k-btn-sm"
            aria-label={$_('clusterSettings.slack.copy')}
            title={$_('clusterSettings.slack.copy')}
            onclick={() => copy(data.redirectUri)}><Copy class="h-4 w-4" /></button
          >
        </div>
        {#if !data.https}
          <p class="flex items-start gap-1.5 text-xs text-warn">
            <CircleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />{$_(
              'clusterSettings.slack.httpsWarning',
            )}
          </p>
        {/if}
      </li>
      <li class="space-y-2">
        <p>{$_('clusterSettings.slack.step3')}</p>
        <pre
          class="overflow-auto rounded-lg bg-ink-900 p-3 font-mono text-xs text-white">SLACK_CLIENT_ID=…
SLACK_CLIENT_SECRET=…</pre>
      </li>
    </ol>

    <p class="flex items-start gap-1.5 border-t border-white/8 pt-4 text-xs text-fg-subtle">
      <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />{$_('clusterSettings.slack.manualNote')}
    </p>
  </section>
</div>
