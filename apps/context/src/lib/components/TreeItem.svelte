<script lang="ts">
	import { ChevronDown, ChevronRight, ChevronUp, FileText, Folder } from '@lucide/svelte';
	import { pageHref } from '$lib/links';
	import type { TreeNode } from '$lib/mock/workspace';
	import { ui, type DropPosition } from '$lib/state/ui.svelte';
	import { workspace } from '$lib/state/workspace.svelte';
	import TreeItem from './TreeItem.svelte';

	let { node, depth = 0, current }: { node: TreeNode; depth?: number; current: string } = $props();

	const hasChildren = $derived(node.kind === 'folder' && node.children.length > 0);
	const open = $derived(node.kind === 'folder' && !!node.open);
	const active = $derived(node.kind === 'page' && node.slug === current);

	const dragging = $derived(ui.treeDrag?.id === node.id);
	const drop = $derived(
		ui.treeDrag?.target?.id === node.id ? ui.treeDrag.target.position : undefined
	);
	const contextTarget = $derived(ui.menu?.nodeId === node.id);
	const indent = $derived(6 + depth * 15);

	const rowClass = $derived(
		`group relative flex h-7 w-full items-center rounded-[5px] pr-1 text-left text-[12.5px] transition-colors select-none ${
			drop === 'inside'
				? 'bg-accent/10 text-fg ring-1 ring-accent/50 ring-inset'
				: contextTarget
					? 'bg-hover text-fg ring-1 ring-line-strong ring-inset'
					: active
						? 'bg-raised text-fg'
						: 'text-fg-soft hover:bg-hover hover:text-fg'
		} ${dragging ? 'opacity-40' : ''}`
	);

	function setOpen(value: boolean) {
		if (node.kind === 'folder') node.open = value;
	}

	function ondragstart(e: DragEvent) {
		if (!e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', node.label);
		ui.treeDrag = { id: node.id, target: null };
	}

	function ondragover(e: DragEvent) {
		const drag = ui.treeDrag;
		if (!drag) return;
		if (!workspace.canMove(drag.id, node.id)) {
			drag.target = null;
			return;
		}
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const y = (e.clientY - rect.top) / rect.height;
		// Only folders accept drops in their middle band. An expanded folder has no
		// "after" zone: the gap below it belongs to its first child.
		let position: DropPosition;
		if (node.kind === 'page') position = y < 0.5 ? 'before' : 'after';
		else if (y < 0.25) position = 'before';
		else if (y > 0.75 && !(open && hasChildren)) position = 'after';
		else position = 'inside';

		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		if (drag.target?.id !== node.id || drag.target.position !== position) {
			drag.target = { id: node.id, position };
		}
	}

	// New items go into the right-clicked folder, or next to the right-clicked page.
	function oncontextmenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		const folderId = node.kind === 'folder' ? node.id : (workspace.parentOf(node.id)?.id ?? null);
		ui.openMenu(e.clientX, e.clientY, { folderId, nodeId: node.id });
	}

	// Hovering a collapsed folder for a moment expands it so items can be dropped deeper.
	$effect(() => {
		if (drop !== 'inside' || open || !hasChildren) return;
		const timer = setTimeout(() => setOpen(true), 600);
		return () => clearTimeout(timer);
	});
</script>

<li class={depth === 0 ? 'mt-1.5 first:mt-0' : ''}>
	<div
		class={rowClass}
		style="padding-left: {indent}px"
		data-node-id={node.id}
		role="presentation"
		draggable="true"
		{ondragstart}
		{ondragover}
		ondragend={() => (ui.treeDrag = null)}
		{oncontextmenu}
	>
		{#if active}
			<span class="absolute inset-y-0 left-0 w-[2px] rounded-l-[5px] bg-accent"></span>
		{/if}
		{#if drop === 'before' || drop === 'after'}
			<span
				class="pointer-events-none absolute right-1 z-10 h-[2px] rounded-full bg-accent {drop ===
				'before'
					? '-top-px'
					: '-bottom-px'}"
				style="left: {indent + 10}px"
			>
				<span
					class="absolute -top-[3px] -left-1 size-2 rounded-full border-2 border-accent bg-canvas"
				></span>
			</span>
		{/if}

		{#if node.kind === 'page'}
			<a
				href={pageHref(node.slug)}
				draggable="false"
				class="flex h-full min-w-0 flex-1 items-center"
				aria-current={active ? 'page' : undefined}
			>
				<span class="w-3 shrink-0"></span>
				<FileText size={16} class="ml-2 shrink-0 {active ? 'text-accent' : 'text-fg-muted'}" />
				<span class="ml-[9px] truncate">{node.label}</span>
			</a>
		{:else}
			<button
				type="button"
				class="flex h-full min-w-0 flex-1 items-center text-left"
				aria-expanded={open}
				onclick={() => setOpen(!open)}
			>
				<span class="grid w-3 shrink-0 place-items-center text-fg-faint">
					{#if hasChildren}
						{#if open}
							<ChevronDown size={depth === 0 ? 10 : 12} />
						{:else}
							<ChevronRight size={12} />
						{/if}
					{/if}
				</span>
				<Folder size={16} class="ml-2 shrink-0 text-fg-muted" />
				<span class="ml-[9px] truncate">{node.label}</span>
				{#if depth === 0 && hasChildren}
					<span class="mr-1.5 ml-auto text-fg-muted">
						{#if open}<ChevronUp size={14} />{:else}<ChevronDown size={14} />{/if}
					</span>
				{/if}
			</button>
		{/if}
	</div>

	{#if node.kind === 'folder' && open && hasChildren}
		<ul>
			{#each node.children as child (child.id)}
				<TreeItem node={child} depth={depth + 1} {current} />
			{/each}
		</ul>
	{/if}
</li>
