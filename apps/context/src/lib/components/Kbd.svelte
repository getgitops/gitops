<script lang="ts">
	let { keys, class: className = '' }: { keys: string[]; class?: string } = $props();
</script>

{#if keys.length}
	<kbd
		class="inline-flex h-5 shrink-0 items-center gap-[5px] rounded border border-line-strong bg-raised px-1.5 font-sans text-[10.5px] leading-none text-fg-muted {className}"
	>
		{#each keys as key, i (i)}<span>{key}</span>{/each}
	</kbd>
{/if}
