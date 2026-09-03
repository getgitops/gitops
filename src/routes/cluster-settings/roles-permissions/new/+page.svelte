<script lang="ts">
  import RoleDetail from '$lib/components/RoleDetail.svelte';
  import { _ } from '$lib/i18n';
</script>

<RoleDetail
  scope="cluster"
  title={$_('roleDetail.addClusterRole')}
  cancelHref="/cluster-settings/roles-permissions"
/>
