<script lang="ts">
	import { pageHref } from '$lib/links';
	import {
		ChevronDown,
		CircleCheck,
		Clock,
		FileText,
		GitBranch,
		GitCommitVertical,
		GitFork,
		House,
		Leaf,
		Link,
		Search,
		Settings,
		Star
	} from '@lucide/svelte';
	import { favorites, syncStatus } from '$lib/mock/workspace';
	import { workspace } from '$lib/state/workspace.svelte';
	import TreeItem from './TreeItem.svelte';

	let { current, searchInput = $bindable() }: { current: string; searchInput?: HTMLInputElement } =
		$props();

	let query = $state('');
	let workspaceOpen = $state(true);
	let favoritesOpen = $state(true);

	const results = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		return Object.values(workspace.pages)
			.filter((p) => p.title.toLowerCase().includes(q) || p.tags.some((t) => t.includes(q)))
			.slice(0, 6);
	});

	const nav = [
		{ label: 'Home', icon: House, slug: 'home' },
		{ label: 'Graph', icon: GitFork, iconClass: 'rotate-180' },
		{ label: 'Backlinks', icon: Link },
		{ label: 'Recent', icon: Clock }
	];
</script>

<aside class="flex h-full w-[265px] shrink-0 flex-col border-r border-line bg-canvas">
	<div class="flex h-14 shrink-0 items-center gap-[11px] px-[19px]">
		<Leaf size={22} class="fill-accent text-accent" strokeWidth={1.4} />
		<span class="text-[19px] font-semibold tracking-[-0.01em] text-fg">Context</span>
	</div>

	<div class="relative mx-4 mt-1 shrink-0">
		<label
			class="flex h-8 items-center gap-2.5 rounded-md border border-line bg-panel px-2.5 text-fg-muted focus-within:border-line-strong"
		>
			<Search size={15} class="shrink-0" />
			<input
				bind:this={searchInput}
				bind:value={query}
				type="text"
				placeholder="Search..."
				class="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-fg placeholder:text-fg-muted focus:ring-0"
				onkeydown={(e) => e.key === 'Escape' && (query = '')}
			/>
			<kbd class="font-sans text-[11px] text-fg-muted">⌘K</kbd>
		</label>

		{#if query.trim()}
			<div
				class="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-line-strong bg-raised py-1 shadow-xl shadow-black/40"
			>
				{#each results as result (result.slug)}
					<a
						href={pageHref(result.slug)}
						class="flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] text-fg-soft hover:bg-hover hover:text-fg"
						onclick={() => (query = '')}
					>
						<FileText size={14} class="shrink-0 text-fg-muted" />
						<span class="truncate">{result.title}</span>
					</a>
				{:else}
					<p class="px-2.5 py-1.5 text-[13px] text-fg-faint">No pages found</p>
				{/each}
			</div>
		{/if}
	</div>

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
			onclick={() => (workspaceOpen = !workspaceOpen)}
		>
			Workspace
			<ChevronDown size={14} class="transition-transform {workspaceOpen ? '' : '-rotate-90'}" />
		</button>

		{#if workspaceOpen}
			<ul class="mt-1.5 px-2.5">
				{#each workspace.tree as node (node.id)}
					<TreeItem {node} {current} />
				{/each}
			</ul>
		{/if}

		<button
			type="button"
			class="mt-[23px] flex h-6 w-full items-center justify-between pr-[21px] pl-[17px] text-[12px] tracking-[0.02em] text-fg-muted uppercase hover:text-fg-soft"
			onclick={() => (favoritesOpen = !favoritesOpen)}
		>
			Favorites
			<ChevronDown size={14} class="transition-transform {favoritesOpen ? '' : '-rotate-90'}" />
		</button>

		{#if favoritesOpen}
			<ul class="mt-[7px] px-4">
				{#each favorites as fav (fav.label)}
					<li>
						<a
							href={pageHref(fav.slug)}
							class="flex h-[29px] items-center gap-[9px] rounded-md px-2 text-[12.5px] text-fg-soft transition-colors hover:bg-hover hover:text-fg"
						>
							<Star size={16} class="text-accent" />
							{fav.label}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<footer
		class="flex h-[60px] shrink-0 items-center gap-1 border-t border-line pr-[17px] pl-[17px] text-[10.5px] whitespace-nowrap text-fg-muted"
	>
		<CircleCheck size={15} class="fill-accent text-canvas" strokeWidth={2.2} />
		<span class="ml-1">{syncStatus.state}</span>
		<span class="text-fg-faint">•</span>
		<span>{syncStatus.ago}</span>
		<span class="ml-[13px] flex items-center gap-1.5">
			<GitBranch size={13} />
			{syncStatus.branch}
		</span>
		<span class="ml-[13px] flex items-center gap-1.5">
			<GitCommitVertical size={13} />
			{syncStatus.pendingChanges}
		</span>
		<button type="button" class="ml-auto text-fg-muted hover:text-fg" aria-label="Settings">
			<Settings size={18} />
		</button>
	</footer>
</aside>
