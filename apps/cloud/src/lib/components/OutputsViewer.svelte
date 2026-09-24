<script lang="ts">
  export let outputs: Record<string, any>;

  function formatValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }
</script>

<div
  class="bg-gray-900 text-gray-300 font-mono text-xs p-4 rounded-lg overflow-x-auto shadow-inner border border-gray-800"
>
  {#each Object.entries(outputs) as [key, value]}
    <div class="flex flex-col sm:flex-row sm:items-baseline mb-2 last:mb-0">
      <span class="text-blue-400 font-semibold sm:w-48 shrink-0">{key}:</span>
      {#if typeof value === 'object' && value !== null}
        <pre class="text-green-400 whitespace-pre-wrap flex-1 mt-1 sm:mt-0">{formatValue(
            value,
          )}</pre>
      {:else if typeof value === 'string'}
        <span class="text-green-300 flex-1 break-all">{formatValue(value)}</span>
      {:else if typeof value === 'boolean'}
        <span class="text-orange-400 flex-1">{formatValue(value)}</span>
      {:else if typeof value === 'number'}
        <span class="text-purple-400 flex-1">{formatValue(value)}</span>
      {:else}
        <span class="text-gray-500 flex-1">{formatValue(value)}</span>
      {/if}
    </div>
  {/each}
</div>
