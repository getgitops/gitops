<script lang="ts">
  import RoleDetail from '$lib/components/RoleDetail.svelte';
  import { _ } from 'svelte-i18n';

  export let data: {
    project: { slug: string; organization: { slug: string } | null };
    role: any;
  };

  $: baseHref = `/org/${data.project.organization?.slug ?? ''}/projects/${data.project.slug}/settings/roles-permissions`;
</script>

<RoleDetail
  scope="project"
  role={data.role}
  title={`${$_('roleDetail.edit')} ${data.role.name}`}
  cancelHref={baseHref}
/>
