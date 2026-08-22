<script lang="ts">
  import RolePermissions from '$lib/components/RolePermissions.svelte';

  export let data: { organization: { id: string; slug: string }; roles: any[] };
</script>

<RolePermissions
  initialRoles={data.roles}
  baseHref={`/org/${data.organization.slug}/settings/roles-permissions`}
/>
