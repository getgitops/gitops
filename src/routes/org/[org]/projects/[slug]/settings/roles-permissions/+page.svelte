<script lang="ts">
  import RolePermissions from '$lib/components/RolePermissions.svelte';

  export let data: {
    project: { slug: string; organization: { slug: string } | null };
    roles: any[];
  };

  $: baseHref = `/org/${data.project.organization?.slug ?? ''}/projects/${data.project.slug}/settings/roles-permissions`;
</script>

<RolePermissions
  initialRoles={data.roles}
  title="Project Roles & Permissions"
  description="Manage roles and granular access policies inside this project."
  {baseHref}
/>
