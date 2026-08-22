<script lang="ts">
  import Users from '$lib/components/Users.svelte';

  export let data: { users: any[]; roles: any[] };
</script>

<Users
  scope="organization"
  initialUsers={data.users}
  roles={data.roles}
  title="Organization Users"
  description="Create users and grant them access to this organization."
/>
