<script lang="ts">
  import RoleDetail from '$lib/components/RoleDetail.svelte';

  export let data: {
    project: { slug: string; organization: { slug: string } | null };
    role: any;
  };

  $: baseHref = `/org/${data.project.organization?.slug ?? ''}/projects/${data.project.slug}/settings/roles-permissions`;
</script>

<RoleDetail
  scope="project"
  role={data.role}
  title={`Edit ${data.role.name}`}
  cancelHref={baseHref}
/>
