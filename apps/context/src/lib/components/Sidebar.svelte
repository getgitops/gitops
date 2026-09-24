<script lang="ts">
	import { pageHref } from '$lib/links';
	import {
		ChevronDown,
		CircleCheck,
		Clock,
		GitBranch,
		GitCommitVertical,
		GitFork,
		House,
		Leaf,
		Link,
		Search,
		Star
	} from '@lucide/svelte';
	import { ui } from '$lib/state/ui.svelte';
	import { workspace } from '$lib/state/workspace.svelte';
	import TreeItem from './TreeItem.svelte';
	import WorkspaceSwitcher from './WorkspaceSwitcher.svelte';

	let { current }: { current: string } = $props();

	const nav = [
		{ label: 'Home', icon: House, slug: 'home' },
		{ label: 'Graph', icon: GitFork, iconClass: 'rotate-180' },
		{ label: 'Backlinks', icon: Link },
		{ label: 'Recent', icon: Clock }
	];

	let tree = $state<HTMLElement>();
	const rootDrop = $derived(ui.treeDrag?.target?.id === null);

	// Rows set the target on dragover; the container only accepts or clears it.
	function ondragover(e: DragEvent) {
		if (ui.treeDrag?.target) e.preventDefault();
	}

	function ondragleave(e: DragEvent) {
		if (ui.treeDrag && !tree?.contains(e.relatedTarget as Node)) ui.treeDrag.target = null;
	}

	function ondrop(e: DragEvent) {
		const drag = ui.treeDrag;
		ui.treeDrag = null;
		if (!drag?.target) return;
		e.preventDefault();
		workspace.moveNode(drag.id, drag.target.id, drag.target.position);
	}

	function overRootEnd(e: DragEvent) {
		if (!ui.treeDrag) return;
		e.preventDefault();
		if (ui.treeDrag.target?.id !== null) ui.treeDrag.target = { id: null, position: 'after' };
	}

	// Rows handle their own context menu; anywhere else in the tree targets the root.
	function rootContextMenu(e: MouseEvent) {
		e.preventDefault();
		ui.openMenu(e.clientX, e.clientY, { folderId: null });
	}
</script>

<aside class="flex h-full w-[265px] shrink-0 flex-col border-r border-line bg-canvas">
	<div class="flex h-14 shrink-0 items-center gap-[11px] px-[19px]">
		<Leaf size={22} class="fill-accent text-accent" strokeWidth={1.4} />
		<span class="text-[19px] font-semibold tracking-[-0.01em] text-fg">Context</span>
	</div>

	<button
		type="button"
		class="mx-4 mt-1 flex h-8 shrink-0 items-center gap-2.5 rounded-md border border-line bg-panel px-2.5 text-[13px] text-fg-muted transition-colors hover:border-line-strong"
		onclick={() => ui.openPalette('search')}
	>
		<Search size={15} class="shrink-0" />
		Search...
		<kbd class="ml-auto font-sans text-[11px] text-fg-muted">⌘K</kbd>
	</button>

	<div class="min-h-0 flex-1 overflow-y-auto pb-4">
		<nav class="mt-[13px] px-4">
			{#each nav as item (item.label)}
				{@const Icon = item.icon}
				{@const active = item.slug === current}
				{#if item.slug}
					<a
						href={pageHref(item.slug)}
						class="flex h-[34px] items-center gap-3 rounded-md px-2 text-[13px] transition-colors {active
							? 'bg-raised text-fg'
							: 'text-fg-soft hover:bg-hover hover:text-fg'}"
					>
						<Icon size={18} class="text-fg-muted {item.iconClass ?? ''}" />
						{item.label}
					</a>
				{:else}
					<button
						type="button"
						class="flex h-[34px] w-full items-center gap-3 rounded-md px-2 text-[13px] text-fg-soft transition-colors hover:bg-hover hover:text-fg"
					>
						<Icon size={18} class="text-fg-muted {item.iconClass ?? ''}" />
						{item.label}
					</button>
				{/if}
			{/each}
		</nav>

		<button
			type="button"
			class="mt-[15px] flex h-6 w-full items-center justify-between pr-[21px] pl-[17px] text-[12px] tracking-[0.02em] text-fg-muted uppercase hover:text-fg-soft"
			onclick={() => (workspace.workspaceOpen = !workspace.workspaceOpen)}
			oncontextmenu={rootContextMenu}
		>
			Workspace
			<ChevronDown
				size={14}
				class="transition-transform {workspace.workspaceOpen ? '' : '-rotate-90'}"
			/>
		</button>

		{#if workspace.workspaceOpen}
			<div
				bind:this={tree}
				class="mt-1.5 px-2.5"
				role="presentation"
				{ondragover}
				{ondragleave}
				{ondrop}
				oncontextmenu={rootContextMenu}
			>
				<ul>
					{#each workspace.tree as node (node.id)}
						<TreeItem {node} {current} />
					{:else}
						<li class="px-2 py-1.5 text-[12px] text-fg-faint">
							No pages yet. Right-click to add one.
						</li>
					{/each}
				</ul>
				<!-- Drop zone to move an item to the end of the workspace root. -->
				<div
					class="relative {ui.treeDrag ? 'h-6' : 'h-0'}"
					role="presentation"
					ondragover={overRootEnd}
				>
					{#if rootDrop}
						<span
							class="pointer-events-none absolute top-[3px] right-1 left-4 h-[2px] rounded-full bg-accent"
						>
							<span
								class="absolute -top-[3px] -left-1 size-2 rounded-full border-2 border-accent bg-canvas"
							></span>
						</span>
					{/if}
				</div>
			</div>
		{/if}

		<button
			type="button"
			class="mt-[23px] flex h-6 w-full items-center justify-between pr-[21px] pl-[17px] text-[12px] tracking-[0.02em] text-fg-muted uppercase hover:text-fg-soft"
			onclick={() => (workspace.favoritesOpen = !workspace.favoritesOpen)}
		>
			Favorites
			<ChevronDown
				size={14}
				class="transition-transform {workspace.favoritesOpen ? '' : '-rotate-90'}"
			/>
		</button>

		{#if workspace.favoritesOpen}
			<ul class="mt-[7px] px-4">
				{#each workspace.favorites as fav (fav.slug)}
					<li>
						<a
							href={pageHref(fav.slug)}
							class="flex h-[29px] items-center gap-[9px] rounded-md px-2 text-[12.5px] text-fg-soft transition-colors hover:bg-hover hover:text-fg"
						>
							<Star size={16} class="text-accent" />
							{fav.label}
						</a>
					</li>
				{:else}
					<li class="px-2 py-1.5 text-[12px] text-fg-faint">Star a page to pin it here.</li>
				{/each}
			</ul>
		{/if}
	</div>

	<WorkspaceSwitcher />

	<footer
		class="flex h-[60px] shrink-0 items-center gap-1 border-t border-line pr-[17px] pl-[17px] text-[10.5px] whitespace-nowrap text-fg-muted"
	>
		<CircleCheck size={15} class="fill-accent text-canvas" strokeWidth={2.2} />
		<span class="ml-1">{workspace.sync.state}</span>
		<span class="text-fg-faint">•</span>
		<span>{workspace.sync.ago}</span>
		<span class="ml-[13px] flex items-center gap-1.5">
			<GitBranch size={13} />
			{workspace.sync.branch}
		</span>
		<span class="ml-[13px] flex items-center gap-1.5">
			<GitCommitVertical size={13} />
			{workspace.sync.pendingChanges}
		</span>
	</footer>
</aside>
