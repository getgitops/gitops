<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { FileText, Folder } from '@lucide/svelte';
	import { pageHref } from '$lib/links';
	import { templates } from '$lib/mock/templates';
	import { workspace } from '$lib/state/workspace.svelte';
	import Modal from './Modal.svelte';
	import Picker from './Picker.svelte';
	import Switch from './Switch.svelte';

	let {
		folderId: initialFolder,
		templateId = workspace.settings.defaultTemplate,
		onclose
	}: { folderId?: string | null; templateId?: string; onclose: () => void } = $props();

	const folders = workspace.folders();
	const currentFolder = workspace.parentFolderOf(page.params.page ?? '')?.id;

	let name = $state('');
	// Falls back to the first top-level folder (`folders[0]` is the root).
	// svelte-ignore state_referenced_locally
	let folderId = $state<string | null>(
		initialFolder !== undefined ? initialFolder : (currentFolder ?? folders[1]?.id ?? null)
	);
	// svelte-ignore state_referenced_locally
	let template = $state(templateId);
	let openAfter = $state(true);

	const location = $derived(folders.find((f) => f.id === folderId) ?? folders[0]);

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!name.trim()) return;
		const slug = workspace.createPage({ title: name, folderId, templateId: template });
		onclose();
		if (openAfter) goto(pageHref(slug));
		workspace.reveal(slug);
	}
</script>

<Modal title="New Document" {onclose}>
	{#snippet icon()}
		<FileText size={20} class="text-fg-soft" />
	{/snippet}

	<form class="px-[22px] pt-[18px] pb-[22px]" onsubmit={submit}>
		<label for="doc-name" class="mb-1.5 block text-[12.5px] text-fg-muted">Name</label>
		<!-- svelte-ignore a11y_autofocus -->
		<input
			id="doc-name"
			bind:value={name}
			autofocus
			autocomplete="off"
			placeholder="Project Plan"
			class="h-10 w-full rounded-md border-line bg-canvas/60 px-3 text-[13.5px] text-fg placeholder:text-fg-faint focus:border-accent/60 focus:ring-0"
		/>

		<label for="doc-location" class="mt-[18px] mb-1.5 block text-[12.5px] text-fg-muted">
			Location
		</label>
		<Picker
			id="doc-location"
			bind:value={folderId}
			chevron="right"
			display={location.path.join(' / ')}
			options={folders.map((f) => ({ value: f.id, label: f.label, depth: f.depth }))}
		>
			{#snippet icon()}<Folder size={16} class="shrink-0 text-fg-muted" />{/snippet}
			{#snippet optionIcon()}<Folder size={14} class="shrink-0 text-fg-muted" />{/snippet}
		</Picker>

		<label for="doc-template" class="mt-[18px] mb-1.5 block text-[12.5px] text-fg-muted">
			Template <span class="text-fg-faint">(optional)</span>
		</label>
		<Picker
			id="doc-template"
			bind:value={template}
			options={templates.map((t) => ({ value: t.id, label: t.label }))}
		/>

		<div class="mt-5">
			<Switch bind:checked={openAfter} label="Open after creation" />
		</div>

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
