<script lang="ts">
  import RolePermissions from '$lib/components/RolePermissions.svelte';

  export let data: { roles: any[] };
</script>

<RolePermissions
  scope="cluster"
  initialRoles={data.roles}
  title="Cluster Roles & Permissions"
  description="Manage roles and granular access policies across the cluster."
/>
