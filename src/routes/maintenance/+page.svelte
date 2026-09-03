<script lang="ts">
  import { _ } from '$lib/i18n';

  export let data: { status: 'pending' | 'ready' | 'error'; message?: string };

  $: status = data.status;
  $: message = data.message;
</script>

<svelte:head>
  <title>{$_('maintenance.title')}</title>
  <meta http-equiv="refresh" content="5" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gray-50 px-4">
  <div class="max-w-md text-center">
    <h1 class="text-2xl font-semibold text-gray-900">
      {status === 'error' ? $_('maintenance.startupFailed') : $_('maintenance.gettingReady')}
    </h1>
    <p class="mt-2 text-gray-600">
      {status === 'error'
        ? (message ?? $_('maintenance.startupFailedDescription'))
        : $_('maintenance.startingDescription')}
    </p>
  </div>
</div>
