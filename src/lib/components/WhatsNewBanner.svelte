<script lang="ts">
  import { onMount } from 'svelte';
  import { X } from '@lucide/svelte';
  import packageJson from '../../../package.json';
  import { _, locale } from '#lib/i18n';
  import { getChangelogEntry, shouldShowWhatsNew } from '#lib/changelog';

  const COOKIE_NAME = 'gitops-whats-new-seen';
  const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

  let visible = false;

  function readSeenVersion(): string | null {
    const cookie = document.cookie.split('; ').find((item) => item.startsWith(`${COOKIE_NAME}=`));

    return cookie ? decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1)) : null;
  }

  function closeBanner() {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(packageJson.version)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
    visible = false;
  }

  onMount(() => {
    visible = shouldShowWhatsNew(packageJson.version, readSeenVersion());
  });

  const entry = getChangelogEntry(packageJson.version);
  $: content = entry ? ($locale === 'es' ? entry.es : entry.en) : null;
</script>

{#if visible && entry && content}
  <section
    class="mb-6 rounded-xl border border-brand-500/25 bg-brand-500/6"
    aria-label={$_('whatsNew.title', { values: { version: packageJson.version } })}
  >
    <div class="flex items-start gap-3 px-4 py-3">
      <div
        class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500 shadow-[0_0_12px_rgba(249,93,17,.7)]"
      ></div>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-white">
          {$_('whatsNew.title', { values: { version: packageJson.version } })}
        </p>
        <p class="mt-0.5 text-sm text-fg-muted">
          {content.summary}
          <a href="/changelog" class="ml-1 font-medium text-brand-400 hover:text-brand-300">
            {$_('whatsNew.viewChangelog')}
          </a>
        </p>
      </div>
      <button
        type="button"
        on:click={closeBanner}
        class="k-btn k-btn-ghost k-btn-icon k-btn-sm shrink-0"
        aria-label={$_('whatsNew.close')}
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  </section>
{/if}
