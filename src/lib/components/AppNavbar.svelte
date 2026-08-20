<script lang="ts">
  import { page } from '$app/stores';
  import { ChevronDown, FolderKanban, LogOut, UserRound } from 'lucide-svelte';

  export let user: { username: string; role: string } | null = null;
  export let projects: { id: string; name: string; slug: string }[] = [];
  export let organizationSlug = 'gitops';

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

  $: currentProject = projects.find((project) => project.slug === $page.params.slug) ?? null;
</script>

<svelte:window on:click={handleWindowClick} />

<header class="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
  <div class="mx-auto flex h-16 w-full items-center gap-4 px-4 sm:px-6">
    <a href="/" class="flex items-center">
      <img src="/gitops_logo.png" alt="GitOps" class="h-14 w-auto sm:h-16" />
    </a>

    {#if user}
      <div class="relative hidden md:block" bind:this={projectMenuRef}>
        <button
          type="button"
          on:click={toggleProjectDropdown}
          class="btn-secondary flex max-w-55 items-center gap-2 rounded-2xl px-3 py-1.5 text-sm font-medium text-slate-700"
        >
          <FolderKanban class="h-4 w-4 shrink-0 text-slate-500" />
          <span class="truncate">{currentProject ? currentProject.name : 'Select project'}</span>
          <ChevronDown class="h-3.5 w-3.5 shrink-0 text-slate-500" />
        </button>

        {#if showProjectDropdown}
          <div
            class="absolute left-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            {#if projects.length === 0}
              <p class="px-4 py-3 text-sm text-slate-500">No hay proyectos activos.</p>
            {:else}
              <div class="max-h-72 overflow-y-auto py-1">
                {#each projects as project (project.id)}
                  <a
                    href={`/org/${organizationSlug}/projects/${project.slug}/overview`}
                    on:click={closeProjectDropdown}
                    class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-slate-50 {currentProject?.id ===
                    project.id
                      ? 'text-slate-900'
                      : 'text-slate-600'}"
                  >
                    <FolderKanban class="h-3.5 w-3.5 shrink-0" />
                    <span class="truncate">{project.name}</span>
                  </a>
                {/each}
              </div>
            {/if}

            <a
              href={`/org/${organizationSlug}/overview`}
              on:click={closeProjectDropdown}
              class="block border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              View all projects
            </a>
          </div>
        {/if}
      </div>
    {/if}

    <div class="ml-auto flex items-center gap-3 sm:gap-4">
      <a
        href="/how-to"
        class="hidden rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 md:inline-flex"
      >
        How To
      </a>

      {#if user}
        <div class="relative ml-1" bind:this={userMenuRef}>
          <button
            on:click={toggleUserDropdown}
            class="btn-secondary flex items-center gap-2 rounded-2xl px-2 py-1.5 text-left"
          >
            <div
              class="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold uppercase text-white"
            >
              {user.username.slice(0, 2)}
            </div>
            <ChevronDown class="h-3.5 w-3.5 text-slate-500" />
          </button>

          {#if showUserDropdown}
            <div
              class="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
            >
              <div class="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <p class="truncate text-sm font-semibold text-slate-900">{user.username}</p>
                <p class="truncate text-xs text-slate-500 capitalize">{user.role.name} Account</p>
              </div>
              <a
                href="/profile"
                on:click={closeUserDropdown}
                class="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <UserRound class="h-4 w-4" />
                Profile
              </a>
              <form action="/api/auth/logout" method="POST" on:submit={closeUserDropdown}>
                <button
                  type="submit"
                  class="btn-ghost flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <LogOut class="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</header>
