<script lang="ts">
	import { pageHref } from '$lib/links';
	import { ChevronDown, ChevronRight, ChevronUp, FileText, Folder } from '@lucide/svelte';
	import type { TreeNode } from '$lib/mock/workspace';
	import TreeItem from './TreeItem.svelte';

	let { node, depth = 0, current }: { node: TreeNode; depth?: number; current: string } = $props();

	const hasChildren = $derived(!!node.children?.length);
	const active = $derived(!!node.slug && node.slug === current);
	const Icon = $derived(node.icon === 'file' ? FileText : Folder);
	const rowClass = $derived(
		`relative flex h-7 w-full items-center rounded-[5px] pr-1 text-left text-[12.5px] transition-colors ${
			active ? 'bg-raised text-fg' : 'text-fg-soft hover:bg-hover hover:text-fg'
		}`
	);

	function toggle() {
		node.open = !node.open;
	}
</script>

{#snippet content()}
	<span class="grid w-3 shrink-0 place-items-center text-fg-faint">
		{#if hasChildren}
			{#if node.open}
				<ChevronDown size={depth === 0 ? 10 : 12} />
			{:else}
				<ChevronRight size={12} />
			{/if}
		{/if}
	</span>
	<Icon size={16} class="ml-2 shrink-0 {active ? 'text-accent' : 'text-fg-muted'}" />
	<span class="ml-[9px] truncate">{node.label}</span>
	{#if depth === 0 && hasChildren}
		<span class="mr-1.5 ml-auto text-fg-muted">
			{#if node.open}<ChevronUp size={14} />{:else}<ChevronDown size={14} />{/if}
		</span>
	{/if}
{/snippet}

<li class={depth === 0 ? 'mt-1.5 first:mt-0' : ''}>
	{#if node.slug && !hasChildren}
		<a
			href={pageHref(node.slug)}
			class={rowClass}
			style="padding-left: {6 + depth * 15}px"
			aria-current={active ? 'page' : undefined}
		>
			{#if active}
				<span class="absolute inset-y-0 left-0 w-[2px] rounded-l-[5px] bg-accent"></span>
			{/if}
			{@render content()}
		</a>
	{:else}
		<button
			type="button"
			class={rowClass}
			style="padding-left: {6 + depth * 15}px"
			aria-expanded={node.open ?? false}
			onclick={toggle}
		>
			{@render content()}
		</button>
	{/if}

	{#if hasChildren && node.open}
		<ul>
			{#each node.children as child (child.id)}
				<TreeItem node={child} depth={depth + 1} {current} />
			{/each}
		</ul>
	{/if}
</li>
