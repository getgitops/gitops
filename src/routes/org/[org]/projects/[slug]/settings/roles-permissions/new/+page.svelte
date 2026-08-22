<script lang="ts">
  import RoleDetail from '$lib/components/RoleDetail.svelte';

  export let data: { project: { slug: string; organization: { slug: string } | null } };

  $: baseHref = `/org/${data.project.organization?.slug ?? ''}/projects/${data.project.slug}/settings/roles-permissions`;
</script>

<RoleDetail scope="project" title="Add Project Role" cancelHref={baseHref} />
