<script lang="ts">
  import RoleDetail from '$lib/components/RoleDetail.svelte';
  import { _ } from '$lib/i18n';

  export let data: { organization: { slug: string }; canCreate: boolean };
</script>

<RoleDetail
  scope="organization"
  title={$_('roleDetail.addOrganizationRole')}
  cancelHref={`/org/${data.organization.slug}/settings/roles-permissions`}
  canCreate={data.canCreate}
/>
