<script lang="ts">
  import RoleDetail from '#lib/components/RoleDetail.svelte';
  import { _ } from '#lib/i18n';

  export let data: { role: any };
</script>

<RoleDetail
  scope="cluster"
  role={data.role}
  title={`${$_('roleDetail.edit')} ${data.role.name}`}
  cancelHref="/gitops-settings/roles-permissions"
/>
