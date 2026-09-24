<script lang="ts">
	import { goto } from '$app/navigation';
	import { pageHref } from '$lib/links';
	import { ChevronDown, Command, PanelLeft, PanelRight, Plus, X } from '@lucide/svelte';
	import { carlos } from '$lib/mock/pages';
	import { workspace } from '$lib/state/workspace.svelte';
	import Avatar from './Avatar.svelte';
	import { pageIcon } from './page-icon';

	let { current, onSearch }: { current: string; onSearch: () => void } = $props();

	// The current page is always shown, even before the effect in the layout adds it.
	const tabs = $derived(
		workspace.tabs.includes(current) ? workspace.tabs : [...workspace.tabs, current]
	);

	function close(slug: string) {
		const next = workspace.closeTab(slug);
		if (slug !== current) return;
		goto(pageHref(next ?? 'home'));
	}
</script>

<header class="flex h-12 shrink-0 items-stretch border-b border-line bg-canvas">
	<nav class="flex min-w-0 [scrollbar-width:none] items-stretch overflow-x-auto">
		{#each tabs as slug (slug)}
			{@const page = workspace.pages[slug]}
			{#if page}
				{@const Icon = pageIcon(page)}
				{@const active = slug === current}
				<div
					class="group relative flex min-w-[130px] shrink-0 items-center border-r border-line transition-colors {active
						? 'bg-panel text-fg'
						: 'text-fg-soft hover:bg-panel/60 hover:text-fg'}"
				>
					<a
						href={pageHref(slug)}
						class="flex h-full flex-1 items-center gap-2.5 pl-[18px] text-[11px] whitespace-nowrap {active
							? 'font-medium'
							: ''}"
						aria-current={active ? 'page' : undefined}
					>
						<Icon size={16} class={active ? 'text-fg' : 'text-fg-muted'} />
						<span class="max-w-44 truncate">{page.title}</span>
					</a>
					<button
						type="button"
						class="mr-[10px] ml-[14px] grid size-5 place-items-center rounded text-fg-muted hover:bg-hover hover:text-fg {active
							? ''
							: 'invisible group-hover:visible'}"
						aria-label="Close {page.title}"
						onclick={() => close(slug)}
					>
						<X size={14} />
					</button>
					{#if active}
						<span class="absolute inset-x-0 -bottom-px h-[2px] bg-accent"></span>
					{/if}
				</div>
			{/if}
		{/each}
	</nav>

	<button
		type="button"
		class="grid w-11 shrink-0 place-items-center text-fg-muted hover:text-fg"
		aria-label="New tab"
	>
		<Plus size={18} />
	</button>

	<div class="ml-auto flex shrink-0 items-center pr-[15px]">
		<button
			type="button"
			class="flex h-[30px] items-center gap-1 rounded-md border border-line-strong bg-panel px-2.5 text-[12px] text-fg-muted hover:text-fg"
			aria-label="Search"
			onclick={onSearch}
		>
			<Command size={12} />K
		</button>
		<button
			type="button"
			class="ml-[21px] grid size-7 place-items-center rounded-md hover:bg-hover {workspace.sidebarOpen
				? 'text-fg-soft'
				: 'text-fg-muted'}"
			aria-label="Toggle sidebar"
			aria-pressed={workspace.sidebarOpen}
			onclick={() => (workspace.sidebarOpen = !workspace.sidebarOpen)}
		>
			<PanelLeft size={18} />
		</button>
		<button
			type="button"
			class="ml-3.5 grid size-7 place-items-center rounded-md hover:bg-hover {workspace.infoOpen
				? 'text-fg-soft'
				: 'text-fg-muted'}"
			aria-label="Toggle page info"
			aria-pressed={workspace.infoOpen}
			onclick={() => (workspace.infoOpen = !workspace.infoOpen)}
		>
			<PanelRight size={18} />
		</button>
		<button type="button" class="ml-[18px] flex items-center gap-1.5 text-fg-muted hover:text-fg">
			<Avatar initials={carlos.initials} size={24} />
			<ChevronDown size={14} />
		</button>
	</div>
</header>
