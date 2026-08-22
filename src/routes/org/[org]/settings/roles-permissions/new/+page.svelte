<script lang="ts">
  import RoleDetail from '$lib/components/RoleDetail.svelte';

  export let data: { organization: { slug: string } };
</script>

<RoleDetail
  scope="organization"
  title="Add Organization Role"
  cancelHref={`/org/${data.organization.slug}/settings/roles-permissions`}
/>
