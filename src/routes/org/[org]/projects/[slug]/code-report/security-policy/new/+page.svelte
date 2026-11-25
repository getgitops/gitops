<!-- Alta en página completa: para enlaces directos. Desde el listado se crea en un modal. -->
<script lang="ts">
  import { createPageStore } from '#lib/page-store';
  import { ArrowLeft } from '@lucide/svelte';
  import SecurityPolicyForm from '#lib/components/code-report/SecurityPolicyForm.svelte';

  let {
    data,
  }: {
    data: {
      services: { id: string; slug: string; name: string; tags: string[] }[];
      tags: string[];
      project?: { slug?: string; organization?: { slug?: string | null } | null };
    };
  } = $props();

  const page = createPageStore();
  const base = $derived(
    `/org/${data.project?.organization?.slug ?? $page.params.org}/projects/${data.project?.slug ?? $page.params.slug}/code-report/security-policy`,
  );
</script>

<svelte:head><title>Nueva política - Code Report - GitOps</title></svelte:head>

<div class="max-w-4xl space-y-6">
  <a href={base} class="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-white">
    <ArrowLeft class="h-3.5 w-3.5" />Volver a políticas
  </a>
  <header>
    <h1 class="text-2xl font-semibold tracking-tight text-white">Nueva política</h1>
    <p class="mt-1 text-sm text-fg-muted">
      Se evaluará en los próximos análisis de los servicios a los que aplique.
    </p>
  </header>
  <div class="k-card p-6">
    <SecurityPolicyForm
      action="?/create"
      submitLabel="Crear política"
      services={data.services}
      tags={data.tags}
    />
  </div>
</div>
