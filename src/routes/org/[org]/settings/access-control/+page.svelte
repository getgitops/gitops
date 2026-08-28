<script lang="ts">
  import Users from '$lib/components/Users.svelte';
  import { _ } from 'svelte-i18n';

  export let data: { users: any[]; roles: any[]; canCreate: boolean; canDelete: boolean };
</script>

<Users
  scope="organization"
  initialUsers={data.users}
  roles={data.roles}
  title={$_('orgSettings.users.title')}
  description={$_('orgSettings.users.description')}
  canCreate={data.canCreate}
  canDelete={data.canDelete}
/>
