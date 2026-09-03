<script lang="ts">
  import RoleDetail from '$lib/components/RoleDetail.svelte';
  import { _ } from '$lib/i18n';

  export let data: {
    organization: { slug: string };
    role: any;
    canUpdate: boolean;
    canDelete: boolean;
  };
</script>

<RoleDetail
  scope="organization"
  role={data.role}
  title={`${$_('roleDetail.edit')} ${data.role.name}`}
  cancelHref={`/org/${data.organization.slug}/settings/roles-permissions`}
  canUpdate={data.canUpdate}
  canDelete={data.canDelete}
/>
