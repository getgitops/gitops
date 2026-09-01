<script lang="ts">
  import Users from '$lib/components/Users.svelte';
  import { _ } from 'svelte-i18n';

  export let data: { users: any[]; roles: any[] };
</script>

<Users
  scope="cluster"
  initialUsers={data.users}
  roles={data.roles}
  title={$_('clusterSettings.users.title')}
  description={$_('clusterSettings.users.description')}
  canCreate={true}
  canUpdate={true}
  canDelete={true}
/>
