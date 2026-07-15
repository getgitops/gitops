<script lang="ts">
  import SubNavbar from '$lib/components/SubNavbar.svelte';
  import StorageSettingsPage from '../../settings/storage/+page.svelte';

  export let data: any;

  function selectBackend(event: CustomEvent<{ id: string }>) {
    document.cookie = `active_backend=${event.detail.id}; path=/; max-age=31536000`;
    window.location.href = '/pulumi-state';
  }
</script>

<svelte:head>
  <title>Storage Backends - Pulumi State</title>
</svelte:head>

<SubNavbar
  label="State"
  options={data.backends || []}
  activeId={data.activeBackendId || ''}
  path="/backends"
  on:change={selectBackend}
/>

<StorageSettingsPage />