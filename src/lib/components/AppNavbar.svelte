<!-- Barra superior de la app (UI v3): logo, búsqueda ⌘K, documentación y menú de cuenta. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    BookOpen,
    Building2,
    ChevronDown,
    LogOut,
    Menu,
    Search,
    Settings,
    UserRound,
    X,
  } from '@lucide/svelte';
  import { DropdownMenu, MenuItem } from '#lib/components/ui';
  import { _ } from '#lib/i18n';

  type NavbarUser = { username: string; role: { name: string } | string | null };

  type Props = {
    user?: NavbarUser | null;
    /** Ajustes de GitOps (solo administradores). */
    settingsHref?: string | null;
    /** Abre la búsqueda global. */
    onsearch?: () => void;
    /** Menú lateral en móvil. */
    menuOpen?: boolean;
    onmenu?: () => void;
  };

  let { user = null, settingsHref = null, onsearch, menuOpen = false, onmenu }: Props = $props();

  const roleName = $derived(typeof user?.role === 'string' ? user.role : user?.role?.name);

  // en el servidor no sabemos la plataforma: se pinta ⌘ y se corrige al montar
  let modKey = $state('⌘');
  onMount(() => {
    if (!/Mac|iPhone|iPad/.test(navigator.platform)) modKey = 'Ctrl';
  });
</script>

<header
  class="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/8 bg-ink-950/80 px-3 backdrop-blur-xl sm:gap-4 sm:px-5"
>
  {#if onmenu}
    <button
      type="button"
      class="k-btn k-btn-ghost k-btn-icon md:hidden"
      aria-label={menuOpen ? $_('nav.closeMenu') : $_('nav.openMenu')}
      aria-expanded={menuOpen}
      aria-controls="app-sidebar"
      onclick={onmenu}
    >
      {#if menuOpen}<X class="h-4 w-4" />{:else}<Menu class="h-4 w-4" />{/if}
    </button>
  {/if}

  <a href="/" class="flex shrink-0 items-center">
    <img src="/brand/gitops-logo-dark.svg" alt="GitOps" class="h-6 w-auto" />
  </a>

  {#if user && onsearch}
    <div class="mx-auto hidden w-full max-w-md md:block">
      <button
        type="button"
        class="k-input flex h-9 items-center gap-2.5 text-left text-fg-subtle"
        aria-label={$_('nav.search')}
        aria-keyshortcuts="Meta+K Control+K"
        onclick={onsearch}
      >
        <Search class="h-4 w-4 shrink-0" />
        <span class="flex-1 truncate">{$_('nav.searchPlaceholder')}</span>
        <span class="flex gap-1"
          ><span class="k-kbd">{modKey}</span><span class="k-kbd">K</span></span
        >
      </button>
    </div>
  {/if}

  <div class="ml-auto flex items-center gap-1.5 md:ml-0">
    {#if user && onsearch}
      <button
        type="button"
        class="k-btn k-btn-ghost k-btn-icon md:hidden"
        aria-label={$_('nav.search')}
        onclick={onsearch}
      >
        <Search class="h-4 w-4" />
      </button>
    {/if}

    <a
      href="https://getgitops.com/docs"
      target="_blank"
      rel="noopener noreferrer"
      class="k-btn k-btn-ghost k-btn-sm hidden sm:inline-flex"
    >
      <BookOpen class="h-4 w-4" />
      {$_('nav.howTo')}
    </a>

    {#if user}
      <DropdownMenu label={$_('nav.account')} align="end" class="w-60 p-1.5">
        {#snippet trigger(props)}
          <button
            {...props}
            class="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-white/5 aria-expanded:bg-white/6"
            aria-label={$_('nav.account')}
          >
            <span
              class="grid h-7 w-7 place-items-center rounded-full bg-linear-to-br from-brand-400 to-brand-700 text-xs font-semibold uppercase text-white"
              >{user.username.slice(0, 2)}</span
            >
            <ChevronDown class="h-3.5 w-3.5 text-fg-subtle" />
          </button>
        {/snippet}
        <div class="px-2.5 py-2">
          <p class="truncate text-sm font-medium text-white">{user.username}</p>
          {#if roleName}<p class="truncate text-xs capitalize text-fg-subtle">{roleName}</p>{/if}
        </div>
        <div class="k-divider my-1" role="separator"></div>
        <MenuItem icon={UserRound} href="/profile">{$_('nav.profile')}</MenuItem>
        <MenuItem icon={Building2} href="/org">{$_('nav.changeOrganization')}</MenuItem>
        {#if settingsHref}
          <MenuItem icon={Settings} href={settingsHref}
            >{$_('sidebar.modules.clusterSettings')}</MenuItem
          >
        {/if}
        <div class="k-divider my-1" role="separator"></div>
        <MenuItem icon={LogOut} tone="danger" href="/auth/logout">{$_('nav.signOut')}</MenuItem>
      </DropdownMenu>
    {/if}
  </div>
</header>
