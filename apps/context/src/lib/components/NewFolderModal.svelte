<script lang="ts">
	import { page } from '$app/state';
	import { Folder } from '@lucide/svelte';
	import { workspace } from '$lib/state/workspace.svelte';
	import Modal from './Modal.svelte';
	import Picker from './Picker.svelte';

	let { parentId: initialParent, onclose }: { parentId?: string | null; onclose: () => void } =
		$props();

	const folders = workspace.folders();
	const currentFolder = workspace.parentFolderOf(page.params.page ?? '')?.id;

	let name = $state('');
	// Falls back to the first top-level folder (`folders[0]` is the root).
	// svelte-ignore state_referenced_locally
	let parentId = $state<string | null>(
		initialParent !== undefined ? initialParent : (currentFolder ?? folders[1]?.id ?? null)
	);

	const location = $derived(folders.find((f) => f.id === parentId) ?? folders[0]);

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!name.trim()) return;
		const id = workspace.createFolder({ name, parentId });
		onclose();
		workspace.reveal(id);
	}
</script>

<Modal title="New Folder" {onclose}>
	{#snippet icon()}
		<Folder size={20} class="text-fg-soft" />
	{/snippet}

	<form class="px-[22px] pt-[18px] pb-[22px]" onsubmit={submit}>
		<label for="folder-name" class="mb-1.5 block text-[12.5px] text-fg-muted">Name</label>
		<!-- svelte-ignore a11y_autofocus -->
		<input
			id="folder-name"
			bind:value={name}
			autofocus
			autocomplete="off"
			placeholder="Documentation"
			class="h-10 w-full rounded-md border-line bg-canvas/60 px-3 text-[13.5px] text-fg placeholder:text-fg-faint focus:border-accent/60 focus:ring-0"
		/>

		<label for="folder-location" class="mt-[18px] mb-1.5 block text-[12.5px] text-fg-muted">
			Location
		</label>
		<Picker
			id="folder-location"
			bind:value={parentId}
			chevron="right"
			display={location.path.join(' / ')}
			options={folders.map((f) => ({ value: f.id, label: f.label, depth: f.depth }))}
		>
			{#snippet icon()}<Folder size={16} class="shrink-0 text-fg-muted" />{/snippet}
			{#snippet optionIcon()}<Folder size={14} class="shrink-0 text-fg-muted" />{/snippet}
		</Picker>

		<footer class="mt-9 flex justify-end gap-3">
			<button
				type="button"
				class="h-10 rounded-md border border-line bg-raised px-6 text-[13.5px] text-fg-soft hover:border-line-strong hover:text-fg"
				onclick={onclose}
			>
				Cancel
			</button>
			<button
				type="submit"
				disabled={!name.trim()}
				class="h-10 rounded-md bg-accent px-7 text-[13.5px] font-semibold text-accent-ink transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
			>
				Create
			</button>
		</footer>
	</form>
</Modal>
