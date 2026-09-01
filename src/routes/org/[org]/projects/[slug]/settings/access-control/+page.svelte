<script lang="ts">
  import Users from '$lib/components/Users.svelte';
  import { _ } from 'svelte-i18n';

  export let data: {
    users: any[];
    roles: any[];
    assignableUsers: any[];
    project: { name: string };
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
  };
</script>

<Users
  scope="project"
  initialUsers={data.users}
  roles={data.roles}
  assignableUsers={data.assignableUsers}
  title={$_('projectSettings.users.title')}
  description={`${$_('projectSettings.users.descriptionPrefix')} ${data.project.name}${$_('projectSettings.users.descriptionSuffix')}`}
  canCreate={data.canCreate}
  canUpdate={data.canUpdate}
  canDelete={data.canDelete}
/>
