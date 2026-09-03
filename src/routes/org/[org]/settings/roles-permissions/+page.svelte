<script lang="ts">
  import RolePermissions from '$lib/components/RolePermissions.svelte';
  import { _ } from '$lib/i18n';

  export let data: {
    organization: { id: string; slug: string };
    roles: any[];
    canCreate: boolean;
  };
</script>

<RolePermissions
  initialRoles={data.roles}
  title={$_('orgSettings.roles.title')}
  description={$_('orgSettings.roles.description')}
  baseHref={`/org/${data.organization.slug}/settings/roles-permissions`}
  canCreate={data.canCreate}
/>
