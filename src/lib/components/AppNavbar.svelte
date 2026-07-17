<script lang="ts">
  import { ChevronDown, LogOut, UserRound } from 'lucide-svelte';

  export let user: { username: string; role: string } | null = null;

  let showUserDropdown = false;

  function toggleUserDropdown() {
    showUserDropdown = !showUserDropdown;
  }

  function closeUserDropdown() {
    showUserDropdown = false;
  }

</script>

<header class="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
  <div class="mx-auto flex h-16 w-full items-center justify-between gap-4 px-4 sm:px-6">
    <a href="/" class="flex items-center">
      <img src="/gitops_logo.png" alt="GitOps" class="h-14 w-auto sm:h-16" />
    </a>

    <a
      href="/how-to"
      class="hidden rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 md:inline-flex"
    >
      How To
    </a>

    <div class="flex items-center gap-3 sm:gap-4">
      {#if user}
        <div class="relative ml-1">
          <button
            on:click={toggleUserDropdown}
            class="btn-secondary flex items-center gap-2 rounded-2xl px-2 py-1.5 text-left"
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