<script lang="ts">
  import Users from '$lib/components/Users.svelte';
  import { _ } from 'svelte-i18n';

  export let data: {
    users: any[];
    roles: any[];
    assignableUsers: any[];
    project: { name: string };
  };
</script>

<Users
  scope="project"
  initialUsers={data.users}
  roles={data.roles}
  assignableUsers={data.assignableUsers}
  title={$_('projectSettings.users.title')}
  description={`${$_('projectSettings.users.descriptionPrefix')} ${data.project.name}${$_('projectSettings.users.descriptionSuffix')}`}
/>
