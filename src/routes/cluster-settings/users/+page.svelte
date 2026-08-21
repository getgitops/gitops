<script lang="ts">
  import Users from '$lib/components/Users.svelte';

  export let data: { users: any[]; roles: any[] };
</script>

<Users
  scope="cluster"
  initialUsers={data.users}
  roles={data.roles}
  title="Cluster Users"
  description="Create users and grant them access to this cluster."
/>
