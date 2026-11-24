<script lang="ts">
  import type { FieldValue } from './audit-summary';

  export let value: FieldValue | undefined;
  export let tone: 'before' | 'after' | 'plain' = 'plain';

  const textTone: Record<'before' | 'after' | 'plain', string> = {
    before: 'text-red-300 line-through',
    after: 'font-medium text-green-300',
    plain: 'text-fg',
  };
</script>

{#if !value}
  <span class="text-fg-subtle">—</span>
{:else if value.kind === 'text'}
  <span class={textTone[tone]}>{value.text}</span>
{:else if value.kind === 'flags'}
  <div class="flex flex-wrap gap-1.5">
    {#each value.flags as flag}
      <span
        class="k-badge h-5 px-2 text-[11px] {flag.value
          ? 'k-badge-ok'
          : 'text-fg-subtle line-through'}">{flag.label}</span
      >
    {/each}
  </div>
{:else if value.kind === 'list'}
  <div class="flex flex-wrap gap-1.5">
    {#each value.items as item}
      <span class="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[11px] text-fg"
        >{item}</span
      >
    {/each}
  </div>
{:else}
  <pre
    class="max-h-48 overflow-auto rounded-lg border border-white/8 bg-ink-950 p-2 font-mono text-[11px] leading-relaxed text-fg"><code
      >{JSON.stringify(value.json, null, 2)}</code
    ></pre>
{/if}
