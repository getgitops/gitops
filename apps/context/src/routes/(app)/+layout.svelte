<script lang="ts">
	import { page } from '$app/state';
	import { setLucideProps } from '@lucide/svelte';
	import InfoPanel from '$lib/components/InfoPanel.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import { workspace } from '$lib/state/workspace.svelte';

	let { children } = $props();

	setLucideProps({ strokeWidth: 1.6 });

	let searchInput = $state<HTMLInputElement>();

	const current = $derived(page.params.page ?? '');
	const currentPage = $derived(workspace.pages[current]);

	$effect(() => {
		if (currentPage) workspace.openTab(current);
	});

	function focusSearch() {
		workspace.sidebarOpen = true;
		// Wait for the sidebar to mount if it was hidden.
		requestAnimationFrame(() => searchInput?.focus());
	}

	function onkeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			focusSearch();
		}
	}
</script>

<svelte:window {onkeydown} />

<div class="flex h-dvh overflow-hidden bg-canvas text-fg">
	{#if workspace.sidebarOpen}
		<Sidebar {current} bind:searchInput />
	{/if}

	<div class="flex min-w-0 flex-1 flex-col">
		<TabBar {current} onSearch={focusSearch} />

		<div class="flex min-h-0 flex-1">
			<main class="min-w-0 flex-1 overflow-y-auto">
				{@render children()}
			</main>

			{#if workspace.infoOpen && currentPage}
				<InfoPanel page={currentPage} />
			{/if}
		</div>
	</div>
</div>
