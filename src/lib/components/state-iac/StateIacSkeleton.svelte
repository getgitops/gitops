<!--
  Marcadores de carga de State IaC con la misma forma que el contenido final, para que la página
  no salte cuando llegan los datos. `toolbar`: selector + backend + tarjetas de entornos;
  `detail`: pestañas + resumen del stack; `rows`: filas de una lista (historial, proyectos…).
-->
<script lang="ts">
  type Props = {
    variant: 'toolbar' | 'detail' | 'rows';
    /** Solo para `rows`. */
    rows?: number;
  };
  let { variant, rows = 4 }: Props = $props();

  const block = 'animate-pulse rounded bg-white/5';
</script>

{#if variant === 'toolbar'}
  <div class="space-y-6" data-testid="state-iac-skeleton" role="status" aria-busy="true">
    <span class="sr-only">…</span>
    <div class="flex flex-wrap items-end gap-3">
      <div class="min-w-64 flex-1 sm:max-w-md">
        <div class="{block} mb-1.5 h-3 w-12"></div>
        <div class="{block} h-9 w-full rounded-xl"></div>
      </div>
      <div class="{block} h-9 w-64 rounded-xl"></div>
      <div class="{block} ml-auto h-9 w-28 rounded-xl"></div>
    </div>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {#each Array(3) as _, index (index)}
        <div class="k-card space-y-2 p-3">
          <div class="{block} h-4 w-2/3"></div>
          <div class="{block} h-3 w-1/2"></div>
          <div class="{block} h-3 w-1/3"></div>
        </div>
      {/each}
    </div>
  </div>
{:else if variant === 'detail'}
  <div class="space-y-6" data-testid="state-iac-skeleton" role="status" aria-busy="true">
    <span class="sr-only">…</span>
    <div class="flex gap-4 border-b border-white/8 pb-3">
      {#each Array(5) as _, index (index)}<div class="{block} h-4 w-20"></div>{/each}
    </div>
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {#each Array(4) as _, index (index)}
        <div class="k-card space-y-2 p-4">
          <div class="{block} h-3 w-24"></div>
          <div class="{block} h-6 w-16"></div>
          <div class="{block} h-3 w-3/4"></div>
        </div>
      {/each}
    </div>
    <div class="k-card space-y-2 p-4">
      <div class="{block} h-4 w-24"></div>
      <div class="{block} h-3 w-2/3"></div>
    </div>
    <div class="k-card p-4">
      <div class="{block} h-4 w-56"></div>
      <div class="{block} mt-3 h-40 w-full"></div>
    </div>
    <div class="grid gap-6 lg:grid-cols-2">
      {#each Array(2) as _, index (index)}
        <div class="k-card space-y-3 p-4">
          <div class="{block} h-4 w-40"></div>
          {#each Array(5) as _, row (row)}<div class="{block} h-3 w-full"></div>{/each}
        </div>
      {/each}
    </div>
  </div>
{:else}
  <ul class="space-y-2" data-testid="state-iac-skeleton" role="status" aria-busy="true">
    <li class="sr-only">…</li>
    {#each Array(rows) as _, index (index)}
      <li class="k-card flex items-center gap-3 p-4">
        <div class="{block} h-4 w-4 shrink-0 rounded-full"></div>
        <div class="min-w-0 flex-1 space-y-2">
          <div class="{block} h-4 w-1/3"></div>
          <div class="{block} h-3 w-2/3"></div>
        </div>
      </li>
    {/each}
  </ul>
{/if}
