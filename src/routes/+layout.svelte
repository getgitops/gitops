<script lang="ts">
  import '../app.css';
  import { Layers, Settings, ChevronDown, LogOut } from 'lucide-svelte';
  import { page } from '$app/stores';
  import Footer from '$lib/components/Footer.svelte';

  export let data: any;

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

<div class="min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col">
  {#if $page.url.pathname !== '/login'}
    <header class="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div class="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
        <div class="flex items-center gap-8">
          <a href="/" class="flex items-center gap-3">
            <Layers class="w-7 h-7 text-blue-600" />
            <h1 class="text-xl font-bold tracking-tight">Pulumi Open State</h1>
          </a>

          <nav class="hidden sm:flex items-center gap-6">
            {#if data.isConfigured}
              <a
                href="/projects"
                class="text-sm font-semibold {$page.url.pathname.startsWith('/projects')
                  ? 'text-gray-900'
                  : 'text-gray-500 hover:text-gray-900'} transition-colors"
              >
                Projects
              </a>
            {/if}
            <a
              href="/how-to"
              class="text-sm font-semibold {$page.url.pathname.startsWith('/how-to')
                ? 'text-gray-900'
                : 'text-gray-500 hover:text-gray-900'} transition-colors"
            >
              How To
            </a>
          </nav>
        </div>

        <div class="flex items-center gap-4">
          {#if data.isConfigured && data.backends.length > 1}
            <div class="mr-2">
              <select
                value={data.activeBackendId}
                on:change={selectBackend}
                class="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full px-3 py-1.5 outline-none font-medium"
                aria-label="Select Storage Backend"
              >
                {#each data.backends as backend}
                  <option value={backend.id}>{backend.name}</option>
                {/each}
              </select>
            </div>
          {:else if data.isConfigured && data.backends.length === 1}
            <div class="mr-2 hidden sm:block">
              <span
                class="px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-600 text-sm rounded-lg font-medium inline-block"
              >
                {data.backends[0].name}
              </span>
            </div>
          {/if}

          {#if data.user && data.user.role === 'admin'}
            <a
              href="/settings"
              class="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Settings"
            >
              <Settings class="w-5 h-5" />
            </a>
          {/if}

          {#if data.user}
            <div class="relative ml-2">
              <button
                on:click={toggleUserDropdown}
                class="flex items-center gap-2 p-1 pl-1.5 pr-1.5 hover:bg-gray-100 rounded-lg transition-colors border border-transparent hover:border-gray-200"
              >
                <div
                  class="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold uppercase text-xs"
                >
                  {data.user.username.slice(0, 2)}
                </div>
                <ChevronDown class="w-3.5 h-3.5 text-gray-500" />
              </button>

              {#if showUserDropdown}
                <button
                  type="button"
                  class="fixed inset-0 z-40"
                  on:click={closeUserDropdown}
                  aria-label="Close user menu"
                ></button>
                <div
                  class="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden py-1"
                >
                  <div class="px-4 py-3 border-b border-gray-100 mb-1 bg-gray-50">
                    <p class="text-sm font-bold text-gray-900 truncate">{data.user.username}</p>
                    <p class="text-xs text-gray-500 truncate capitalize">
                      {data.user.role} Account
                    </p>
                  </div>
                  <form action="/api/auth/logout" method="POST">
                    <button
                      type="submit"
                      class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                    >
                      <LogOut class="w-4 h-4" /> Sign Out
                    </button>
                  </form>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </header>
  {/if}

  <main class="flex-1 max-w-[1600px] mx-auto w-full px-6 py-8">
    <slot />
  </main>

  <Footer />
</div>
