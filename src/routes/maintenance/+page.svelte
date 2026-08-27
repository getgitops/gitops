<script lang="ts">
  export let data: { status: 'pending' | 'ready' | 'error'; message?: string };

  $: status = data.status;
  $: message = data.message;
</script>

<svelte:head>
  <title>Maintenance</title>
  <meta http-equiv="refresh" content="5" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gray-50 px-4">
  <div class="max-w-md text-center">
    <h1 class="text-2xl font-semibold text-gray-900">
      {status === 'error' ? 'Startup failed' : 'Getting things ready…'}
    </h1>
    <p class="mt-2 text-gray-600">
      {status === 'error'
        ? (message ?? 'The server failed to start. Check the server logs.')
        : 'The server is starting up. This page will refresh automatically.'}
    </p>
  </div>
</div>
