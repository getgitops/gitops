<script lang="ts">
  import { CircleCheck, Sparkles } from '@lucide/svelte';
  import { changelog } from '#lib/changelog';
  import { locale } from '#lib/i18n';
  import packageJson from '../../../package.json';

  const es = $derived($locale !== 'en');
  const current = packageJson.version;

  function date(value: string) {
    return new Intl.DateTimeFormat($locale ?? 'es', {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00Z`));
  }

  // los textos usan `código` como en markdown: se pinta como <code>
  function parts(text: string) {
    return text.split('`').map((value, index) => ({ value, code: index % 2 === 1 }));
  }
</script>

<svelte:head>
  <title>{es ? 'Novedades' : 'Changelog'} · GitOps</title>
</svelte:head>

<div class="mx-auto w-full max-w-4xl space-y-8">
  <header class="relative">
    <div
      class="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-brand-500/15 blur-3xl"
    ></div>
    <p class="relative text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-400">
      GitOps {current}
    </p>
    <h1 class="relative mt-1 text-3xl font-semibold tracking-tight text-white">
      {es ? 'Novedades' : 'Changelog'}
    </h1>
    <p class="relative mt-2 max-w-2xl text-sm text-fg-muted">
      {es
        ? 'Lo que ha cambiado en cada versión de GitOps.'
        : 'What changed in each GitOps release.'}
    </p>
  </header>

  <ol class="relative space-y-6">
    <!-- línea de tiempo -->
    <span
      class="absolute bottom-2 left-[5.5px] top-2 w-px bg-white/10 sm:left-[149.5px]"
      aria-hidden="true"
    ></span>

    {#each changelog as entry, index (entry.version)}
      {@const content = es ? entry.es : entry.en}
      {@const isCurrent = entry.version === current}
      <li class="relative grid gap-3 pl-7 sm:grid-cols-[8.5rem_1fr] sm:gap-8 sm:pl-0">
        <span
          class="absolute left-0 top-2 h-3 w-3 rounded-full ring-4 ring-ink-950 sm:left-[9rem] {isCurrent
            ? 'bg-brand-500'
            : 'bg-ink-700'}"
          aria-hidden="true"
        ></span>

        <div class="sm:sticky sm:top-6 sm:self-start sm:pt-0.5 sm:text-right">
          <span class="k-badge {isCurrent ? 'k-badge-brand' : ''} font-mono font-semibold"
            >v{entry.version}</span
          >
          <p class="mt-1.5 text-xs text-fg-subtle">
            <time datetime={entry.date}>{date(entry.date)}</time>
          </p>
        </div>

        <article
          class="k-card relative overflow-hidden p-6 sm:ml-6 {isCurrent
            ? 'border-brand-500/30'
            : ''}"
          aria-labelledby="release-{index}"
        >
          {#if isCurrent}
            <div
              class="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-500/15 blur-3xl"
            ></div>
            <p
              class="relative mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-400"
            >
              <Sparkles class="h-3.5 w-3.5" />{es ? 'Versión actual' : 'Current version'}
            </p>
          {/if}
          <h2 id="release-{index}" class="relative text-lg font-semibold text-white">
            {content.title}
          </h2>
          <p class="relative mt-1.5 text-sm leading-6 text-fg-muted">{content.summary}</p>

          <ul class="relative mt-5 space-y-2.5 border-t border-white/8 pt-5">
            {#each content.changes as change, changeIndex (changeIndex)}
              <li class="flex gap-3 text-sm leading-6 text-fg">
                <CircleCheck
                  class="mt-1 h-4 w-4 shrink-0 {isCurrent ? 'text-brand-400' : 'text-fg-subtle'}"
                />
                <span>
                  {#each parts(change) as part, partIndex (partIndex)}
                    {#if part.code}
                      <code class="rounded bg-white/6 px-1.5 py-0.5 font-mono text-[12px] text-fg"
                        >{part.value}</code
                      >
                    {:else}{part.value}{/if}
                  {/each}
                </span>
              </li>
            {/each}
          </ul>
        </article>
      </li>
    {/each}
  </ol>
</div>
