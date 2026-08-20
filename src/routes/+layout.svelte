<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import AppNavbar from '$lib/components/AppNavbar.svelte';
  import AppSidebar from '$lib/components/AppSidebar.svelte';
  import Footer from '$lib/components/Footer.svelte';

  export let data: any;

  let sidebarCollapsed = false;
  let sidebarStateReady = false;

  onMount(() => {
    sidebarCollapsed = localStorage.getItem('gitvault-sidebar-collapsed') === '1';
    sidebarStateReady = true;
  });

  $: if (sidebarStateReady) {
    localStorage.setItem('gitvault-sidebar-collapsed', sidebarCollapsed ? '1' : '0');
  }
</script>

<div
  class="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col"
  style={`--sidebar-width:${sidebarCollapsed ? '96px' : '340px'}`}
>
  {#if $page.url.pathname !== '/login'}
    <AppNavbar
      user={data.user}
      projects={data.projects}
      organizationSlug={data.organization.slug}
      projectSlug={$page.params.slug ?? ''}
    />

    <div
      class="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-6 sm:px-6 lg:block lg:px-0"
    >
      <aside
        class="app-shell-sidebar w-full lg:fixed lg:left-0 lg:top-16 lg:z-20 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto lg:border-r lg:border-slate-200 lg:bg-slate-50 lg:px-4 lg:py-6"
      >
        <AppSidebar
          pathname={$page.url.pathname}
          isConfigured={data.isConfigured}
          organizationSlug={data.organization.slug}
          projects={data.projects}
          bind:collapsed={sidebarCollapsed}
        />
      </aside>

      <main class="app-shell-main min-w-0 flex-1 lg:pr-6">
        <slot />
      </main>
    </div>
  {:else}
    <slot />
  {/if}

  {#if $page.url.pathname !== '/login'}
    <Footer />
  {/if}
</div>
