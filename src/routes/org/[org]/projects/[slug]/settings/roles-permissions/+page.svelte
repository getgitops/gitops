<script lang="ts">
  import RolePermissions from '$lib/components/RolePermissions.svelte';
  import { _ } from 'svelte-i18n';

  export let data: {
    project: { slug: string; organization: { slug: string } | null };
    roles: any[];
  };

  $: baseHref = `/org/${data.project.organization?.slug ?? ''}/projects/${data.project.slug}/settings/roles-permissions`;
</script>

<RolePermissions
  initialRoles={data.roles}
  title={$_('projectSettings.roles.title')}
  description={$_('projectSettings.roles.description')}
  {baseHref}
/>
