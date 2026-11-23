<script lang="ts">
  import { locale } from '#lib/i18n';
  import { changelog } from '#lib/changelog';
</script>

<svelte:head>
  <title>Changelog · GitOps</title>
</svelte:head>

<section class="mx-auto w-full max-w-4xl px-2 py-2 sm:px-0 sm:py-4">
  <header class="mb-8">
    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#7f9cff]">GitOps</p>
    <h1 class="mt-2 text-3xl font-semibold tracking-tight text-white">
      {$locale === 'es' ? 'Novedades' : 'Changelog'}
    </h1>
  </header>

  <div class="space-y-5">
    {#each changelog as entry (entry.version)}
      {@const content = $locale === 'es' ? entry.es : entry.en}
      <article class="rounded-2xl border border-[#142236] bg-[#071323] p-6 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-xl font-semibold text-white">{content.title}</h2>
          <span
            class="rounded-full border border-[#2457ff]/30 bg-[#2457ff]/10 px-3 py-1 text-xs font-semibold text-[#9db2ff]"
          >
            v{entry.version}
          </span>
        </div>
        <p class="mt-2 text-sm text-slate-400">{entry.date}</p>
        <p class="mt-4 text-sm leading-6 text-slate-300">{content.summary}</p>
        <ul class="mt-4 space-y-2">
          {#each content.changes as change}
            <li class="flex gap-3 text-sm leading-6 text-slate-300">
              <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2457ff]"></span>
              <span>{change}</span>
            </li>
          {/each}
        </ul>
      </article>
    {/each}
  </div>
</section>
