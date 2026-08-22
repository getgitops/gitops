<script lang="ts">
  import RoleDetail from '$lib/components/RoleDetail.svelte';

  export let data: { organization: { slug: string }; role: any };
</script>

<RoleDetail
  scope="organization"
  role={data.role}
  title={`Edit ${data.role.name}`}
  cancelHref={`/org/${data.organization.slug}/settings/roles-permissions`}
/>
