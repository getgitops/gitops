<script lang="ts">
  import { getHealthStatus } from '../domains/health/health';

  const health = getHealthStatus();
</script>

<svelte:head>
  <title>GitVault Suite</title>
</svelte:head>

<section class="p-8">
  <h1 class="text-3xl font-bold">GitVault Suite</h1>
  <p class="mt-4 text-lg">SvelteKit + Bun + DDD starter scaffold.</p>
  <p class="mt-2 text-sm text-gray-600">Domain status: {health}</p>
</section>
