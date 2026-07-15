<script lang="ts">
  import { ChevronDown, LogOut, Layers, UserRound } from 'lucide-svelte';

  export let isConfigured = false;
  export let backends: { id: string; name: string }[] = [];
  export let activeBackendId = '';
  export let user: { username: string; role: string } | null = null;

  let showUserDropdown = false;

  function toggleUserDropdown() {
    showUserDropdown = !showUserDropdown;
  }

  function closeUserDropdown() {
    showUserDropdown = false;
  }

  function selectBackend(event: Event) {
    const id = (event.target as HTMLSelectElement).value;
    document.cookie = `active_backend=${id}; path=/; max-age=31536000`;
    window.location.href = '/projects';
  }
</script>

<header class="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
  <div class="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
    <a href="/" class="flex items-center gap-3">
      <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
        <Layers class="h-5 w-5" />
      </span>
      <div class="leading-tight">
        <p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Workspace</p>
        <h1 class="text-base font-bold text-slate-900 sm:text-lg">GitVault Suite</h1>
      </div>
    </a>

    <a
      href="/how-to"
      class="hidden rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 md:inline-flex"
    >
      How To
    </a>

    <div class="flex items-center gap-3 sm:gap-4">
      {#if isConfigured && backends.length > 0}
        {#if backends.length > 1}
          <select
            value={activeBackendId}
            on:change={selectBackend}
            class="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200 sm:block"
            aria-label="Select Storage Backend"
          >
            {#each backends as backend}
              <option value={backend.id}>{backend.name}</option>
            {/each}
          </select>
        {:else}
          <span class="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 sm:inline-flex">
            {backends[0].name}
          </span>
        {/if}
      {/if}

      {#if user}
        <div class="relative ml-1">
          <button
            on:click={toggleUserDropdown}
            class="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2 py-1.5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold uppercase text-white">
              {user.username.slice(0, 2)}
            </div>
            <ChevronDown class="h-3.5 w-3.5 text-slate-500" />
          </button>

          {#if showUserDropdown}
            <button
              type="button"
              class="fixed inset-0 z-40 cursor-default"
              on:click={closeUserDropdown}
              aria-label="Close user menu"
            ></button>

            <div class="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div class="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <p class="truncate text-sm font-semibold text-slate-900">{user.username}</p>
                <p class="truncate text-xs text-slate-500 capitalize">{user.role} Account</p>
              </div>
                <a
                  href="/profile"
                  class="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <UserRound class="h-4 w-4" />
                  Profile
                </a>
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  class="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
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