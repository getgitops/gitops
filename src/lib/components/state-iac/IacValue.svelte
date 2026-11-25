<!--
  Pinta un valor del estado (inputs/outputs). Los secretos llegan ya enmascarados del servidor
  y se muestran como [secret]; las referencias a otros recursos son botones que lo seleccionan.
-->
<script lang="ts">
  import { Link2, Lock } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
  import { isSpecial, type IacValue } from '#lib/state-iac/types';
  import Self from './IacValue.svelte';

  type Props = { value: IacValue; onselect?: (address: string) => void; depth?: number };
  let { value, onselect, depth = 0 }: Props = $props();

  const entries = $derived(
    value && typeof value === 'object' && !Array.isArray(value) && !isSpecial(value)
      ? Object.entries(value as Record<string, IacValue>)
      : [],
  );
</script>

{#if value === null}
  <span class="text-fg-subtle">null</span>
{:else if isSpecial(value)}
  {#if value.$iac === 'secret'}
    <span
      class="k-badge k-badge-warn h-5 gap-1 px-1.5 text-[10px]"
      title={$_('stateIac.detail.secretHelp')}><Lock class="h-3 w-3" />[secret]</span
    >
  {:else if value.$iac === 'resource-ref'}
    <button
      type="button"
      class="inline-flex items-center gap-1 text-brand-400 hover:underline"
      onclick={() => onselect?.(value.address)}
      ><Link2 class="h-3 w-3" />{value.address.split('::').at(-1)}</button
    >
  {:else if value.$iac === 'unknown'}
    <span class="text-fg-subtle">[unknown]</span>
  {:else}
    <span class="text-fg-muted">[{value.$iac}] {value.summary}</span>
  {/if}
{:else if Array.isArray(value)}
  {#if value.length === 0}
    <span class="text-fg-subtle">[]</span>
  {:else}
    <ol class="space-y-0.5 border-l border-white/8 pl-3">
      {#each value as item, index (index)}
        <li class="flex gap-2">
          <span class="text-fg-subtle">{index}</span>
          <span class="min-w-0"><Self value={item} {onselect} depth={depth + 1} /></span>
        </li>
      {/each}
    </ol>
  {/if}
{:else if typeof value === 'object'}
  {#if entries.length === 0}
    <span class="text-fg-subtle">{'{}'}</span>
  {:else}
    <dl class="space-y-0.5 {depth > 0 ? 'border-l border-white/8 pl-3' : ''}">
      {#each entries as [key, item] (key)}
        <div class="flex flex-wrap gap-x-2">
          <dt class="text-fg-muted">{key}</dt>
          <dd class="min-w-0 break-all"><Self value={item} {onselect} depth={depth + 1} /></dd>
        </div>
      {/each}
    </dl>
  {/if}
{:else if typeof value === 'string'}
  <span class="break-all text-fg">{value}</span>
{:else}
  <span class="text-info">{String(value)}</span>
{/if}
