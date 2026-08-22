<script lang="ts">
  import RoleDetail from '$lib/components/RoleDetail.svelte';

  export let data: { role: any };
</script>

<RoleDetail
  scope="cluster"
  role={data.role}
  title={`Edit ${data.role.name}`}
  cancelHref="/cluster-settings/roles-permissions"
/>
