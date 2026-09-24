<script lang="ts">
	import { page } from '$app/state';
	import { setLucideProps } from '@lucide/svelte';
	import { findCommand } from '$lib/commands';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import CreateWorkspaceModal from '$lib/components/CreateWorkspaceModal.svelte';
	import InfoPanel from '$lib/components/InfoPanel.svelte';
	import NewDocumentModal from '$lib/components/NewDocumentModal.svelte';
	import NewFolderModal from '$lib/components/NewFolderModal.svelte';
	import NewItemMenu from '$lib/components/NewItemMenu.svelte';
	import ShareModal from '$lib/components/ShareModal.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import { ui } from '$lib/state/ui.svelte';
	import { workspace } from '$lib/state/workspace.svelte';

	let { children } = $props();

	setLucideProps({ strokeWidth: 1.6 });

	const current = $derived(page.params.page ?? '');
	const currentPage = $derived(workspace.pages[current]);
	const inSettings = $derived(page.route.id?.startsWith('/(app)/settings') ?? false);

	$effect(() => {
		if (!currentPage) return;
		workspace.openTab(current);
		workspace.lastPage = current;
	});

	function onkeydown(e: KeyboardEvent) {
		if (!(e.metaKey || e.ctrlKey) || ui.modal) return;
		if (e.code === 'KeyK' && !e.shiftKey && !e.altKey) {
			e.preventDefault();
			ui.togglePalette();
			return;
		}
		const command = findCommand(e);
		if (!command) return;
		e.preventDefault();
		ui.closePalette();
		ui.closeMenu();
		command.run();
	}

	function oncontextmenu(e: MouseEvent) {
		e.preventDefault();
		ui.openMenu(e.clientX, e.clientY);
	}
</script>

<svelte:window {onkeydown} />

<div class="flex h-dvh overflow-hidden bg-canvas text-fg">
	{#if workspace.sidebarOpen}
		<Sidebar {current} />
	{/if}

	<div class="flex min-w-0 flex-1 flex-col">
		<TabBar {current} />

		<div class="flex min-h-0 flex-1">
			<!-- Settings keep the native context menu so form fields can be copied and pasted. -->
			<main
				class="min-w-0 flex-1 overflow-y-auto"
				oncontextmenu={inSettings ? undefined : oncontextmenu}
			>
				{@render children()}
			</main>

			{#if workspace.infoOpen && currentPage}
				<InfoPanel page={currentPage} />
			{/if}
		</div>
	</div>
</div>

<CommandPalette />
<NewItemMenu />

{#if ui.modal?.kind === 'document'}
	<NewDocumentModal
		folderId={ui.modal.folderId}
		templateId={ui.modal.templateId}
		onclose={() => ui.closeModal()}
	/>
{:else if ui.modal?.kind === 'folder'}
	<NewFolderModal parentId={ui.modal.parentId} onclose={() => ui.closeModal()} />
{:else if ui.modal?.kind === 'share'}
	<ShareModal slug={ui.modal.slug} onclose={() => ui.closeModal()} />
{:else if ui.modal?.kind === 'workspace'}
	<CreateWorkspaceModal onclose={() => ui.closeModal()} />
{/if}
