<script lang="ts">
  import Users from '$lib/components/Users.svelte';

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
  title="Project Users"
  description={`Assign existing organization users to ${data.project.name}.`}
/>
