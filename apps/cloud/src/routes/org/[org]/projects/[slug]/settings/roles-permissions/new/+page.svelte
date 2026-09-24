<script lang="ts">
  import RoleDetail from '$lib/components/RoleDetail.svelte';
  import { _ } from '$lib/i18n';

  export let data: {
    project: { slug: string; organization: { slug: string } | null };
    canCreate: boolean;
  };

  $: baseHref = `/org/${data.project.organization?.slug ?? ''}/projects/${data.project.slug}/settings/roles-permissions`;
</script>

<RoleDetail
  scope="project"
  title={$_('roleDetail.addProjectRole')}
  cancelHref={baseHref}
  canCreate={data.canCreate}
/>
