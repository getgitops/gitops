<script lang="ts">
	import { goto } from '$app/navigation';
	import { page as route } from '$app/state';
	import { pageHref } from '$lib/links';
	import { Command, Folder, PanelLeft, PanelRight, Plus, Settings, X } from '@lucide/svelte';
	import { ui } from '$lib/state/ui.svelte';
	import { workspace } from '$lib/state/workspace.svelte';
	import { pageIcon } from './page-icon';
	import UserMenu from './UserMenu.svelte';

	let { current }: { current: string } = $props();

	// The current page is always shown, even before the effect in the layout adds it.
	const tabs = $derived(
		workspace.tabs.includes(current) ? workspace.tabs : [...workspace.tabs, current]
	);

	function close(slug: string) {
		const next = workspace.closeTab(slug);
		if (slug !== current) return;
		goto(pageHref(next ?? 'home'));
	}

	const inSettings = $derived(route.route.id?.startsWith('/(app)/settings') ?? false);

	function closeSettings() {
		goto(pageHref(workspace.entryPage(workspace.currentId)));
	}
</script>

<header class="flex h-12 shrink-0 items-stretch border-b border-line bg-canvas">
	{#if inSettings}
		<!-- Lines up with the settings navigation below. -->
		<p
			class="flex w-[234px] shrink-0 items-center gap-[11px] pl-[24px] text-[13px] whitespace-nowrap text-fg-soft"
		>
			<Folder size={17} class="shrink-0 text-fg-soft" />
			<span class="truncate">{workspace.settings.name.trim() || 'Untitled workspace'}</span>
		</p>
		<div
			class="relative mt-[5px] flex w-[137px] shrink-0 items-center rounded-t-lg bg-raised pl-5 text-fg"
		>
			<span class="flex flex-1 items-center gap-2.5 text-[11.5px] font-medium" aria-current="page">
				<Settings size={16} />
				Settings
			</span>
			<button
				type="button"
				class="mr-[10px] grid size-5 place-items-center rounded text-fg-soft hover:bg-hover hover:text-fg"
				aria-label="Close settings"
				onclick={closeSettings}
			>
				<X size={14} />
			</button>
			<span class="absolute inset-x-0 -bottom-px h-[2px] bg-accent"></span>
		</div>
	{:else}
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
			class="grid w-11 shrink-0 place-items-center text-fg-muted transition-colors hover:text-fg"
			aria-label="New document"
			aria-haspopup="dialog"
			onclick={() => ui.openModal({ kind: 'document' })}
		>
			<Plus size={18} />
		</button>
	{/if}

	<div class="ml-auto flex shrink-0 items-center pr-[15px]">
		<button
			type="button"
			class="flex h-[30px] items-center gap-1 rounded-md border border-line-strong bg-panel px-2.5 text-[12px] text-fg-muted hover:text-fg"
			aria-label="Command palette"
			onclick={() => ui.openPalette()}
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
		<UserMenu />
	</div>
</header>
