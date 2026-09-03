<script lang="ts">
  import { Building2, ChevronDown, FolderKanban, LogOut, UserRound } from '@lucide/svelte';
  import { _ } from '$lib/i18n';

  type NavbarUser = { username: string; role: { name: string } | string | null };

  export let user: NavbarUser | null = null;
  export let projects: { id: string; name: string; slug: string }[] = [];
  export let organizationSlug: string | null = 'gitops';
  export let projectSlug = '';

  let showUserDropdown = false;
  let showProjectDropdown = false;

  let userMenuRef: HTMLDivElement | undefined;
  let projectMenuRef: HTMLDivElement | undefined;

  function toggleUserDropdown() {
    showUserDropdown = !showUserDropdown;
  }

  function closeUserDropdown() {
    showUserDropdown = false;
  }

  function toggleProjectDropdown() {
    showProjectDropdown = !showProjectDropdown;
  }

  function closeProjectDropdown() {
    showProjectDropdown = false;
  }

  // header uses backdrop-blur, which traps fixed-position overlays inside it, so a viewport-wide
  // backdrop can't be used to detect outside clicks — listen on the window instead.
  function handleWindowClick(event: MouseEvent) {
    const target = event.target as Node;

    if (showUserDropdown && userMenuRef && !userMenuRef.contains(target)) {
      showUserDropdown = false;
    }

    if (showProjectDropdown && projectMenuRef && !projectMenuRef.contains(target)) {
      showProjectDropdown = false;
    }
  }

  $: currentProject = projects.find((project) => project.slug === projectSlug) ?? null;
  $: roleName = typeof user?.role === 'string' ? user.role : user?.role?.name;
</script>

<svelte:window on:click={handleWindowClick} />

<header class="sticky top-0 z-30 border-b border-[#142236] bg-[#020813]/95 backdrop-blur-xl">
  <div class="mx-auto flex h-[84px] w-full items-center gap-6 px-6 sm:px-8">
    <a href="/" class="flex items-center">
      <img src="/gitops_logo_white.png" alt="GitOps" class="h-8 w-auto" />
    </a>

    {#if user}
      <div class="relative hidden md:block" bind:this={projectMenuRef}>
        <button
          type="button"
          on:click={toggleProjectDropdown}
          class="btn-secondary flex max-w-56 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-100"
        >
          <FolderKanban class="h-4 w-4 shrink-0 text-slate-400" />
          <span class="truncate">{currentProject ? currentProject.name : $_('nav.selectProject')}</span>
          <ChevronDown class="h-3.5 w-3.5 shrink-0 text-slate-400" />
        </button>

        {#if showProjectDropdown}
          <div
            class="absolute left-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-[#1b2b42] bg-[#081526] shadow-2xl shadow-black/30"
          >
            {#if !organizationSlug}
              <p class="px-4 py-3 text-sm text-slate-400">
                {$_('nav.noOrganizationSelected')} <a href="/cluster-settings/orgs" class="underline"
                  >{$_('nav.chooseOne')}</a
                >.
              </p>
            {:else if projects.length === 0}
              <p class="px-4 py-3 text-sm text-slate-400">{$_('nav.noActiveProjects')}</p>
            {:else}
              <div class="max-h-72 overflow-y-auto py-1">
                {#each projects as project (project.id)}
                  <a
                    href={`/org/${organizationSlug}/projects/${project.slug}/overview`}
                    on:click={closeProjectDropdown}
                    class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[#102139] {currentProject?.id ===
                    project.id
                      ? 'text-white'
                      : 'text-slate-300'}"
                  >
                    <FolderKanban class="h-3.5 w-3.5 shrink-0" />
                    <span class="truncate">{project.name}</span>
                  </a>
                {/each}
              </div>
            {/if}

            {#if organizationSlug}
              <a
                href={`/org/${organizationSlug}/overview`}
                on:click={closeProjectDropdown}
                class="block border-t border-[#142236] bg-[#071323] px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-[#102139]"
              >
                {$_('nav.viewAllProjects')}
              </a>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <div class="ml-auto flex items-center gap-3 sm:gap-4">
      <a
        href="https://getgitops.com/docs"
        target="_blank"
        rel="noopener noreferrer"
        class="hidden rounded-lg border border-[#1b2b42] bg-[#071323]/70 px-3.5 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-[#294467] hover:text-white md:inline-flex"
      >
        {$_('nav.howTo')}
      </a>

      {#if user}
        <div class="relative ml-1" bind:this={userMenuRef}>
          <button
            on:click={toggleUserDropdown}
            class="btn-secondary flex items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 text-left"
          >
            <div
              class="flex h-9 w-9 items-center justify-center rounded-full bg-[#202945] text-xs font-bold uppercase text-white ring-1 ring-white/10"
            >
              {user.username.slice(0, 2)}
            </div>
            <ChevronDown class="h-3.5 w-3.5 text-slate-400" />
          </button>

          {#if showUserDropdown}
            <div
              class="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-[#1b2b42] bg-[#081526] shadow-2xl shadow-black/30"
            >
              <div class="border-b border-[#142236] bg-[#071323] px-4 py-3">
                <p class="truncate text-sm font-semibold text-white">{user.username}</p>
                <p class="truncate text-xs text-slate-400 capitalize">{roleName} {$_('nav.account')}</p>
              </div>
              <a
                href="/profile"
                on:click={closeUserDropdown}
                class="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-[#102139]"
              >
                <UserRound class="h-4 w-4" />
                {$_('nav.profile')}
              </a>
              <a
                href="/org"
                on:click={closeUserDropdown}
                class="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-[#102139]"
              >
                <Building2 class="h-4 w-4" />
                {$_('nav.changeOrganization')}
              </a>
              <a
                href="/auth/logout"
                on:click={closeUserDropdown}
                class="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10"
              >
                <LogOut class="h-4 w-4" />
                {$_('nav.signOut')}
              </a>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</header>
