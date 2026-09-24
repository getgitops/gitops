<script lang="ts">
  import RolePermissions from '$lib/components/RolePermissions.svelte';
  import { _ } from '$lib/i18n';

  export let data: { roles: any[] };
</script>

<RolePermissions
  initialRoles={data.roles}
  title={$_('clusterSettings.roles.title')}
  description={$_('clusterSettings.roles.description')}
  baseHref="/cluster-settings/roles-permissions"
/>
