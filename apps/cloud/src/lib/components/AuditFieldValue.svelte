<script lang="ts">
  import type { FieldValue } from './audit-summary';

  export let value: FieldValue | undefined;
  export let tone: 'before' | 'after' | 'plain' = 'plain';

  const textTone: Record<'before' | 'after' | 'plain', string> = {
    before: 'text-red-600 line-through',
    after: 'font-medium text-emerald-700',
    plain: 'text-slate-700',
  };
</script>

{#if !value}
  <span class="text-slate-400">—</span>
{:else if value.kind === 'text'}
  <span class={textTone[tone]}>{value.text}</span>
{:else if value.kind === 'flags'}
  <div class="flex flex-wrap gap-1.5">
    {#each value.flags as flag}
      <span
        class={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
          flag.value
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-slate-200 bg-slate-50 text-slate-400 line-through'
        }`}
      >
        {flag.label}
      </span>
    {/each}
  </div>
{:else if value.kind === 'list'}
  <div class="flex flex-wrap gap-1.5">
    {#each value.items as item}
      {@const [scope, action] = item.split(':')}
      <span class="inline-flex items-center overflow-hidden rounded-full border border-sky-200 text-[11px] font-medium">
        {#if action}
          <span class="bg-sky-100 px-2 py-0.5 text-sky-800">{scope}</span>
          <span class="bg-sky-50 px-2 py-0.5 text-sky-600">{action}</span>
        {:else}
          <span class="bg-sky-50 px-2 py-0.5 text-sky-700">{item}</span>
        {/if}
      </span>
    {/each}
  </div>
{:else}
  <pre
    class="max-h-48 overflow-auto rounded bg-slate-900/95 p-2 text-[11px] leading-relaxed text-slate-100"
  ><code>{JSON.stringify(value.json, null, 2)}</code></pre>
{/if}
