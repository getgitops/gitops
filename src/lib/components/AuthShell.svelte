<!--
  Marco de las páginas de acceso (/auth/*): panel de marca a la izquierda en pantallas grandes y
  la tarjeta con el formulario a la derecha. Cada página aporta título, avisos y formulario.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Activity, BarChart3, LockKeyhole } from '@lucide/svelte';
  import { _ } from '#lib/i18n';

  type Props = {
    title: string;
    eyebrow?: string;
    subtitle?: string;
    /** Subtítulo con marcado (p. ej. un nombre en negrita); sustituye a `subtitle`. */
    intro?: Snippet;
    children: Snippet;
    /** Enlaces bajo la tarjeta ("¿No tienes cuenta?"…). */
    footer?: Snippet;
  };

  let { title, eyebrow, subtitle, intro, children, footer }: Props = $props();

  const features = $derived([
    { icon: BarChart3, title: 'Code Report', text: $_('auth.shell.codeReport') },
    { icon: LockKeyhole, title: 'Vault', text: $_('auth.shell.vault') },
    { icon: Activity, title: 'Monitoring', text: $_('auth.shell.monitoring') },
  ]);
</script>

<div class="grid min-h-screen bg-ink-950 text-fg lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
  <!-- marca -->
  <aside
    class="relative hidden overflow-hidden border-r border-white/8 lg:flex lg:flex-col lg:justify-between lg:p-12"
    aria-hidden="true"
  >
    <div class="k-hero-glow absolute inset-0"></div>
    <div class="k-bg-grid absolute inset-0"></div>
    <img src="/brand/gitops-logo-dark.svg" alt="" class="relative h-8 w-auto self-start" />
    <div class="relative max-w-md">
      <h2 class="text-4xl font-bold leading-tight tracking-tight">
        <span class="k-text-gradient">{$_('auth.shell.headline')}</span>
        <span class="k-text-gradient-brand">{$_('auth.shell.headlineBrand')}</span>
      </h2>
      <ul class="mt-10 space-y-5">
        {#each features as feature (feature.title)}
          <li class="flex items-start gap-3">
            <span
              class="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/4 text-brand-400"
              ><feature.icon class="h-4 w-4" /></span
            >
            <span>
              <span class="block text-sm font-medium text-white">{feature.title}</span>
              <span class="block text-sm text-fg-muted">{feature.text}</span>
            </span>
          </li>
        {/each}
      </ul>
    </div>
    <p class="relative text-xs text-fg-subtle">© GitOps · getgitops.com</p>
  </aside>

  <!-- formulario -->
  <main class="flex flex-col items-center justify-center px-4 py-12 sm:px-8">
    <div class="w-full max-w-sm">
      <img src="/brand/gitops-logo-dark.svg" alt="GitOps" class="mb-10 h-7 w-auto lg:hidden" />
      {#if eyebrow}
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-brand-400">{eyebrow}</p>
      {/if}
      <h1 class="mt-2 text-2xl font-semibold tracking-tight text-white">{title}</h1>
      {#if intro}
        <p class="mt-2 text-sm text-fg-muted">{@render intro()}</p>
      {:else if subtitle}
        <p class="mt-2 text-sm text-fg-muted">{subtitle}</p>
      {/if}

      <div class="mt-8">{@render children()}</div>

      {#if footer}
        <div class="mt-8 text-center text-sm text-fg-muted">{@render footer()}</div>
      {/if}
      <p class="mt-10 text-center">
        <a href="https://getgitops.com" class="text-xs text-fg-subtle hover:text-white"
          >{$_('auth.backToWebsite')}</a
        >
      </p>
    </div>
  </main>
</div>
