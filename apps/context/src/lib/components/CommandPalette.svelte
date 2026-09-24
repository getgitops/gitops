<script lang="ts">
	import type { Component } from 'svelte';
	import { goto } from '$app/navigation';
	import { ChevronRight, FileText, Folder, Hash, Link, Search, X } from '@lucide/svelte';
	import { commands, shortcutKeys, workspaceCommands, type Command } from '$lib/commands';
	import { pageHref } from '$lib/links';
	import type { FolderNode, TreeNode } from '$lib/mock/workspace';
	import { ui } from '$lib/state/ui.svelte';
	import { workspace } from '$lib/state/workspace.svelte';
	import Kbd from './Kbd.svelte';

	type Filter = 'all' | 'documents' | 'folders' | 'tags' | 'links';
	const filters: { id: Filter; label: string }[] = [
		{ id: 'all', label: 'All' },
		{ id: 'documents', label: 'Documents' },
		{ id: 'folders', label: 'Folders' },
		{ id: 'tags', label: 'Tags' },
		{ id: 'links', label: 'Links' }
	];

	interface Item {
		key: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		icon: Component<any>;
		iconClass?: string;
		title: string;
		subtitle?: string;
		keys?: string[];
		chevron?: boolean;
		run: (newTab: boolean) => void;
	}
	interface Section {
		label: string;
		items: Item[];
		/** Rows with a subtitle are taller. */
		tall?: boolean;
	}

	let dialog = $state<HTMLDialogElement>();
	let input = $state<HTMLInputElement>();
	let list = $state<HTMLElement>();
	let filter = $state<Filter>('all');
	let active = $state(0);

	const query = $derived(ui.palette.query.trim().toLowerCase());
	const searching = $derived(query.length > 0 || ui.palette.mode === 'search');

	$effect(() => {
		if (!dialog) return;
		if (ui.palette.open && !dialog.open) {
			filter = 'all';
			dialog.showModal();
			input?.focus();
		} else if (!ui.palette.open && dialog.open) {
			dialog.close();
		}
	});

	// Reset the highlighted row whenever the result set changes.
	$effect(() => {
		void query;
		void filter;
		void ui.palette.mode;
		active = 0;
	});

	function close() {
		ui.closePalette();
	}

	function openPage(slug: string, newTab: boolean) {
		if (newTab) window.open(pageHref(slug), '_blank');
		else goto(pageHref(slug));
		close();
	}

	const commandItem = (c: Command): Item => ({
		key: `cmd:${c.id}`,
		icon: c.icon,
		iconClass: c.iconClass,
		title: c.label,
		keys: shortcutKeys(c.shortcut),
		run: () => {
			// "Search workspace" swaps the palette mode instead of closing it.
			if (c.id !== 'search') close();
			c.run();
			if (c.id === 'search') input?.focus();
		}
	});

	const commandSections = $derived.by<Section[]>(() => {
		const groups: Record<string, Item[]> = {};
		for (const c of commands) (groups[c.group] ??= []).push(commandItem(c));
		return Object.entries(groups).map(([label, items]) => ({ label, items }));
	});

	function allFolders() {
		const out: { node: FolderNode; path: string[] }[] = [];
		const walk = (nodes: TreeNode[], parents: string[]) => {
			for (const node of nodes) {
				if (node.kind !== 'folder') continue;
				out.push({ node, path: parents });
				walk(node.children, [...parents, node.label]);
			}
		};
		walk(workspace.tree, []);
		return out;
	}

	const searchSections = $derived.by<Section[]>(() => {
		const pages = Object.values(workspace.pages);
		const limit = filter === 'all' ? 5 : 30;
		const show = (f: Filter) => filter === 'all' || filter === f;

		const docItem = (slug: string): Item => {
			const p = workspace.pages[slug];
			return {
				key: `doc:${slug}`,
				icon: FileText,
				title: p.title || 'Untitled',
				subtitle: p.path.join(' / '),
				run: (newTab) => openPage(slug, newTab)
			};
		};

		if (!query) {
			const recent = workspace.tabs.filter((slug) => workspace.pages[slug]);
			return [{ label: 'Recent', tall: true, items: recent.map(docItem) }];
		}

		const tagQuery = query.startsWith('#') ? query.slice(1) : null;
		const score = (title: string) => {
			const t = title.toLowerCase();
			return t.startsWith(query) ? 0 : t.includes(query) ? 1 : 2;
		};
		const docs = pages
			.filter((p) =>
				tagQuery !== null
					? p.tags.some((t) => t.startsWith(tagQuery))
					: p.title.toLowerCase().includes(query) ||
						p.tags.some((t) => t.includes(query)) ||
						p.path.some((s) => s.toLowerCase().includes(query))
			)
			.sort((a, b) => score(a.title) - score(b.title));

		const sections: Section[] = [];

		if (show('documents') && docs.length) {
			sections.push({
				label: 'Documents',
				tall: true,
				items: docs.slice(0, limit).map((p) => docItem(p.slug))
			});
		}

		if (show('folders') && tagQuery === null) {
			const folders = allFolders().filter(({ node }) => node.label.toLowerCase().includes(query));
			if (folders.length) {
				sections.push({
					label: 'Folders',
					tall: true,
					items: folders.slice(0, limit).map(({ node, path }) => ({
						key: `folder:${node.id}`,
						icon: Folder,
						title: node.label,
						subtitle: path.length ? path.join(' / ') : 'Workspace',
						chevron: true,
						run: () => {
							close();
							workspace.reveal(node.id, true);
						}
					}))
				});
			}
		}

		if (show('tags')) {
			const counts: Record<string, number> = {};
			for (const p of pages)
				for (const t of p.tags) if (t.includes(tagQuery ?? query)) counts[t] = (counts[t] ?? 0) + 1;
			const tags = Object.entries(counts);
			if (tags.length) {
				sections.push({
					label: 'Tags',
					items: tags.slice(0, limit).map(([tag, count]) => ({
						key: `tag:${tag}`,
						icon: Hash,
						title: tag,
						keys: [`${count} ${count === 1 ? 'page' : 'pages'}`],
						chevron: true,
						run: () => {
							ui.palette.query = `#${tag}`;
							filter = 'documents';
							input?.focus();
						}
					}))
				});
			}
		}

		if (show('links')) {
			const shown = new Set(docs.map((p) => p.slug));
			const links = [...new Set(docs.flatMap((p) => p.links))].filter(
				(slug) => workspace.pages[slug] && !shown.has(slug)
			);
			if (links.length) {
				sections.push({
					label: 'Links',
					items: links.slice(0, limit).map((slug) => ({
						key: `link:${slug}`,
						icon: Link,
						title: workspace.pages[slug].title,
						chevron: true,
						run: (newTab) => openPage(slug, newTab)
					}))
				});
			}
		}

		if (filter === 'all' && ui.palette.mode === 'commands') {
			const matched = commands.filter((c) => c.label.toLowerCase().includes(query));
			if (matched.length) sections.push({ label: 'Commands', items: matched.map(commandItem) });
			const switches = workspaceCommands().filter((c) => c.label.toLowerCase().includes(query));
			if (switches.length) {
				sections.push({ label: 'Workspaces', items: switches.map(commandItem) });
			}
		}

		return sections;
	});

	const sections = $derived(searching ? searchSections : commandSections);
	const flat = $derived(sections.flatMap((s) => s.items));

	$effect(() => {
		list?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = flat.length ? (active + 1) % flat.length : 0;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = flat.length ? (active - 1 + flat.length) % flat.length : 0;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			flat[active]?.run(e.metaKey || e.ctrlKey);
		} else if (e.key === 'Tab' && searching && query) {
			e.preventDefault();
			const i = filters.findIndex((f) => f.id === filter);
			filter = filters[(i + (e.shiftKey ? -1 : 1) + filters.length) % filters.length].id;
		}
	}
</script>

<dialog
	bind:this={dialog}
	aria-label="Command palette"
	class="mx-auto mt-[12vh] mb-auto w-[520px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line-strong bg-panel p-0 text-fg shadow-2xl shadow-black/60 backdrop:bg-black/55 backdrop:backdrop-blur-[2px]"
	onclose={close}
	onclick={(e) => e.target === dialog && close()}
>
	<div class="p-[11px] pb-0">
		<label
			class="flex h-11 items-center gap-2.5 rounded-lg border border-line-strong bg-canvas/70 pr-2.5 pl-3"
		>
			<Search size={17} class="shrink-0 text-fg-soft" />
			<input
				bind:this={input}
				bind:value={ui.palette.query}
				type="text"
				role="combobox"
				aria-expanded="true"
				aria-controls="palette-list"
				aria-activedescendant={flat[active] ? `palette-${active}` : undefined}
				autocomplete="off"
				spellcheck="false"
				placeholder={ui.palette.mode === 'search' ? 'Search workspace...' : 'Search commands...'}
				class="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[13.5px] text-fg caret-accent placeholder:text-fg-muted focus:ring-0"
				{onkeydown}
			/>
			{#if ui.palette.query}
				<button
					type="button"
					class="grid size-6 place-items-center rounded text-fg-soft hover:bg-hover hover:text-fg"
					aria-label="Clear search"
					onclick={() => {
						ui.palette.query = '';
						input?.focus();
					}}
				>
					<X size={15} />
				</button>
			{:else}
				<Kbd keys={['⌘', 'K']} />
			{/if}
		</label>

		{#if searching && query}
			<div class="mt-[11px] flex gap-2 border-b border-line px-[9px] pb-3" role="tablist">
				{#each filters as f (f.id)}
					<button
						type="button"
						role="tab"
						aria-selected={filter === f.id}
						class="h-[26px] rounded-full px-3.5 text-[12px] transition-colors {filter === f.id
							? 'bg-accent font-medium text-accent-ink'
							: 'border border-line-strong bg-raised text-fg-soft hover:text-fg'}"
						onclick={() => {
							filter = f.id;
							input?.focus();
						}}
					>
						{f.label}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div
		bind:this={list}
		id="palette-list"
		role="listbox"
		class="max-h-[min(520px,70vh)] overflow-y-auto px-[11px] pt-1 pb-[11px]"
	>
		{#each sections as section (section.label)}
			{@const offset = flat.indexOf(section.items[0])}
			<p class="px-[9px] pt-[15px] pb-[7px] text-[11px] tracking-[0.02em] text-fg-muted uppercase">
				{section.label}
			</p>
			{#each section.items as item, i (item.key)}
				{@const index = offset + i}
				{@const Icon = item.icon}
				{@const selected = index === active}
				<button
					type="button"
					id="palette-{index}"
					role="option"
					aria-selected={selected}
					data-index={index}
					class="relative flex w-full items-center gap-3 rounded-md pr-2.5 pl-[9px] text-left transition-colors {section.tall
						? 'h-[42px]'
						: 'h-7'} {selected ? 'bg-accent/10' : ''}"
					onpointermove={() => (active = index)}
					onclick={(e) => item.run(e.metaKey || e.ctrlKey)}
				>
					{#if selected}
						<span class="absolute inset-y-0 left-0 w-[2px] rounded-l-md bg-accent"></span>
					{/if}
					<Icon
						size={section.tall ? 20 : 18}
						class="shrink-0 {selected ? 'text-accent' : 'text-fg-soft'} {item.iconClass ?? ''}"
					/>
					<span class="min-w-0 flex-1">
						<span
							class="block truncate {section.tall
								? 'text-[12.5px] font-medium'
								: 'text-[13px]'} text-fg"
						>
							{item.title}
						</span>
						{#if item.subtitle}
							<span class="block truncate text-[11px] text-fg-muted">{item.subtitle}</span>
						{/if}
					</span>
					{#if section.tall && selected && !item.chevron}
						<Kbd keys={['⌘', '↵']} />
					{:else if item.keys?.length}
						<Kbd keys={item.keys} />
					{/if}
					{#if item.chevron}
						<ChevronRight size={15} class="shrink-0 text-fg-muted" />
					{/if}
				</button>
			{/each}
		{:else}
			<p class="px-[9px] py-10 text-center text-[13px] text-fg-muted">
				No results for “{ui.palette.query.trim()}”
			</p>
		{/each}
	</div>
</dialog>
