<script lang="ts">
	import { EllipsisVertical, PanelRight, Share2, Star } from '@lucide/svelte';
	import { ui } from '$lib/state/ui.svelte';
	import { workspace } from '$lib/state/workspace.svelte';
	import Dropdown from './Dropdown.svelte';
	import MenuItem from './MenuItem.svelte';

	let { slug }: { slug: string } = $props();

	const favorite = $derived(workspace.isFavorite(slug));
</script>

<Dropdown
	label="Page options"
	panelClass="w-[220px]"
	triggerClass="grid size-6 place-items-center rounded hover:bg-hover hover:text-fg aria-expanded:bg-hover aria-expanded:text-fg"
>
	{#snippet trigger()}
		<EllipsisVertical size={16} />
	{/snippet}
	{#snippet children(close)}
		<MenuItem
			icon={Star}
			iconClass={favorite ? 'fill-accent text-accent' : ''}
			label={favorite ? 'Remove from favorites' : 'Add to favorites'}
			onclick={() => {
				workspace.toggleFavorite(slug);
				close();
			}}
		/>
		<MenuItem
			icon={Share2}
			label="Share page"
			onclick={() => {
				close();
				ui.openModal({ kind: 'share', slug });
			}}
		/>
		<hr class="mx-1.5 my-[5px] border-line" />
		<MenuItem
			icon={PanelRight}
			label={workspace.infoOpen ? 'Hide details' : 'Show details'}
			onclick={() => {
				workspace.infoOpen = !workspace.infoOpen;
				if (workspace.infoOpen) ui.infoTab = 'document';
				close();
			}}
		/>
	{/snippet}
</Dropdown>
