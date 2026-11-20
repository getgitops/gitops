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
  <aside
    class="border-b border-[#2457ff]/30 bg-[#0b1830]"
    aria-label={$_('whatsNew.title', { values: { version: packageJson.version } })}
  >
    <div class="mx-auto flex w-full max-w-[1600px] items-start gap-4 px-6 py-3 sm:px-8">
      <div
        class="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#2457ff] shadow-[0_0_12px_rgba(36,87,255,.8)]"
      ></div>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-white">
          {$_('whatsNew.title', { values: { version: packageJson.version } })}
        </p>
        <p class="mt-0.5 text-sm text-slate-300">
          {content.summary}
          <a href="/changelog" class="ml-1 font-medium text-[#8aa7ff] hover:text-white">
            {$_('whatsNew.viewChangelog')}
          </a>
        </p>
      </div>
      <button
        type="button"
        on:click={closeBanner}
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        aria-label={$_('whatsNew.close')}
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  </aside>
{/if}
