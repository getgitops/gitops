<script lang="ts">
  import { page } from '$app/stores';
  import { HardDrive, Shield, Download } from 'lucide-svelte';

  const menuItems = [
    { path: '/settings/storage', label: 'Storage Backend', icon: HardDrive },
    { path: '/settings/auth', label: 'Authentication', icon: Shield },
    { path: '/settings/system', label: 'System & Backup', icon: Download },
  ];
</script>

<svelte:head>
  <title>Settings - Pulumi Open State</title>
</svelte:head>

<div class="max-w-[1200px] mx-auto flex flex-col md:flex-row gap-8 items-start w-full">
  <aside class="w-full md:w-64 shrink-0">
    <h2 class="text-2xl font-bold text-gray-900 mb-6 px-3">Settings</h2>
    <nav class="flex flex-col gap-1">
      {#each menuItems as item}
        <a
          href={item.path}
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors {$page.url.pathname.startsWith(
            item.path,
          )
            ? 'bg-blue-50 text-blue-700'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}"
        >
          <svelte:component
            this={item.icon}
            class="w-4 h-4 {$page.url.pathname.startsWith(item.path)
              ? 'text-blue-600'
              : 'text-gray-400'}"
          />
          {item.label}
        </a>
      {/each}
    </nav>
  </aside>

  <div class="flex-1">
    <div
      class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]"
    >
      <slot />
    </div>
  </div>
</div>
