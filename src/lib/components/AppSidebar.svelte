<script lang="ts">
  import {
    BarChart3,
    GitBranch,
    Lock,
    PanelLeftClose,
    PanelLeftOpen,
    Settings,
    Shield,
  } from 'lucide-svelte';

  export let pathname = '/';
  export let isConfigured = false;
  export let collapsed = false;

  const sections = [
    {
      title: 'Seguridad',
      items: [
        {
          label: 'Vault',
          href: '/vault',
          icon: Shield,
        },
      ],
    },
    {
      title: 'Analisis',
      items: [
        {
          label: 'Open Report',
          href: '/open-report',
          icon: BarChart3,
        },
      ],
    },
    {
      title: 'GitOps',
      items: [
        {
          label: 'Pulumi State',
          href: '/projects',
          icon: GitBranch,
        },
      ],
    },
  ];

  const settingsItems = [
    {
      label: 'Settings',
      href: '/settings/storage',
      icon: Settings,
    },
  ];

  function isActive(path: string) {
    if (path === '/projects') {
      return pathname.startsWith('/projects');
    }

    if (path === '/settings/storage') {
      return pathname.startsWith('/settings');
    }

    return pathname.startsWith(path);
  }

  function toggleCollapsed() {
    collapsed = !collapsed;
  }
</script>

<aside class="flex h-full flex-col gap-4">
  <div class="border-b border-slate-200 px-1 pb-4">
    <div class="flex items-center justify-between gap-3">
      {#if !collapsed}
        <div class="min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Modules</p>
          <h2 class="mt-1 text-sm font-semibold text-slate-900">Navigation</h2>
        </div>
      {/if}

      <button
        type="button"
        class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        on:click={toggleCollapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {#if collapsed}
          <PanelLeftOpen class="h-4 w-4" />
        {:else}
          <PanelLeftClose class="h-4 w-4" />
        {/if}
      </button>
    </div>
  </div>

  {#if !isConfigured}
    <a
      href="/settings/storage"
      class="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950 transition-colors hover:border-amber-300 hover:bg-amber-100 {collapsed ? 'justify-center' : 'items-start'}"
      title="Configure a storage backend"
    >
      <div class="flex h-8 w-8 items-center justify-center rounded-md bg-amber-200 text-amber-900">
        <Lock class="h-3.5 w-3.5" />
      </div>
      {#if !collapsed}
        <div class="min-w-0">
          <p class="text-sm font-medium">Setup pending</p>
        </div>
      {/if}
    </a>
  {/if}

  <div class="space-y-4">
    {#each sections as section}
      <section>
        {#if !collapsed}
          <div class="mb-2 px-1">
            <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{section.title}</p>
          </div>
        {/if}

        <div class="space-y-2">
          {#each section.items as item}
            <a
              href={item.href}
              class="group flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors {collapsed ? 'justify-center' : 'items-center'} {isActive(item.href)
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}"
              title={item.label}
            >
              <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md {isActive(item.href)
                ? 'bg-white/10 text-white'
                : 'bg-slate-100 text-slate-600'}">
                <svelte:component this={item.icon} class="h-3.5 w-3.5" />
              </div>

              {#if !collapsed}
                <p class="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</p>
              {/if}
            </a>
          {/each}
        </div>
      </section>
    {/each}

    <section class="border-t border-slate-200 pt-4">
      {#if !collapsed}
        <div class="mb-2 px-1">
          <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Sistema</p>
        </div>
      {/if}

      <div class="space-y-2">
        {#each settingsItems as item}
          <a
            href={item.href}
            class="group flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors {collapsed ? 'justify-center' : 'items-center'} {isActive(item.href)
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}"
            title={item.label}
          >
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md {isActive(item.href)
              ? 'bg-white/10 text-white'
              : 'bg-slate-100 text-slate-600'}">
              <svelte:component this={item.icon} class="h-3.5 w-3.5" />
            </div>

            {#if !collapsed}
              <p class="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</p>
            {/if}
          </a>
        {/each}
      </div>
    </section>
  </div>
</aside>