<script lang="ts">
  import RolePermissions from '$lib/components/RolePermissions.svelte';

  export let data: { project: { id: string }; roles: any[] };
</script>

<RolePermissions
  scope="project"
  scopeId={data.project.id}
  initialRoles={data.roles}
  title="Project Roles & Permissions"
  description="Manage roles and granular access policies for this project."
/>
