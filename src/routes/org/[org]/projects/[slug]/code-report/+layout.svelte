<script lang="ts">
  import { page } from '$app/stores';
  import { Settings, ShieldAlert, Activity, FileKey, CheckSquare, Boxes, History } from 'lucide-svelte';

  export let data: {
    project?: {
      slug?: string | null;
      organization?: { slug?: string | null } | null;
    };
  };

  $: orgSlug = data?.project?.organization?.slug ?? $page?.params?.org ?? '';
  $: projectSlug = data?.project?.slug ?? $page?.params?.slug ?? '';
  
  $: basePath = `/org/${orgSlug}/projects/${projectSlug}/code-report`;

  $: tabs = [
    { label: 'Dashboard', href: `${basePath}/dashboard`, icon: Activity },
    { label: 'Servicios', href: `${basePath}/services`, icon: Boxes },
    { label: 'CVEs', href: `/org/${orgSlug}/cves`, icon: ShieldAlert },
    { label: 'Security Policy', href: `${basePath}/security-policy`, icon: CheckSquare },
    { label: 'Historial', href: `${basePath}/history`, icon: History },
    { label: 'Ajustes', href: `${basePath}/settings`, icon: Settings },
  ];

  $: currentPath = $page?.url?.pathname ?? '';
</script>

<div class="space-y-6">

  <slot />
</div>
