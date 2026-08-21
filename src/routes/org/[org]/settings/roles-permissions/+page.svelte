<script lang="ts">
  import RolePermissions from '$lib/components/RolePermissions.svelte';

  export let data: { organization: { id: string }; roles: any[] };
</script>

<RolePermissions scope="organization" scopeId={data.organization.id} initialRoles={data.roles} />
