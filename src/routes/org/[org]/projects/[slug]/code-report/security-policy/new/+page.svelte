<script lang="ts">
  import { page } from '$app/stores';
  import { ArrowLeft } from 'lucide-svelte';
  import SecurityPolicyForm from '$lib/components/code-report/SecurityPolicyForm.svelte';

  export let data: {
    services: { id: string; slug: string; name: string; tags: string[] }[];
    tags: string[];
  };
  export let form: { error?: string } | null;

  $: baseHref = `/org/${$page?.params?.org}/projects/${$page?.params?.slug}/code-report/security-policy`;
</script>

<svelte:head><title>Nueva política de seguridad - GitVault Suite</title></svelte:head>

<div class="space-y-4">
  <a href={baseHref} class="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
    <ArrowLeft class="h-3.5 w-3.5" />Volver a políticas
  </a>

  <SecurityPolicyForm
    action="?/create"
    submitLabel="Crear política"
    services={data.services}
    tags={data.tags}
    errorMessage={form?.error ?? null}
  />
</div>
