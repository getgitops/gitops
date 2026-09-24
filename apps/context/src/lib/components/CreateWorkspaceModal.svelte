<script lang="ts">
	import { goto } from '$app/navigation';
	import { LayoutGrid } from '@lucide/svelte';
	import { pageHref } from '$lib/links';
	import { workspace } from '$lib/state/workspace.svelte';
	import Modal from './Modal.svelte';
	import WorkspaceLogo from './WorkspaceLogo.svelte';

	let { onclose }: { onclose: () => void } = $props();

	let name = $state('');

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!name.trim()) return;
		const id = workspace.createWorkspace({ name });
		workspace.switchTo(id);
		onclose();
		goto(pageHref('home'));
	}
</script>

<Modal title="New Workspace" {onclose}>
	{#snippet icon()}
		<LayoutGrid size={19} class="text-fg-soft" />
	{/snippet}

	<form class="px-[22px] pt-[18px] pb-[22px]" onsubmit={submit}>
		<label for="workspace-name" class="mb-1.5 block text-[12.5px] text-fg-muted">Name</label>
		<div class="flex items-center gap-3">
			<WorkspaceLogo settings={{ name, logo: null, color: workspace.nextColor }} size="sm" />
			<!-- svelte-ignore a11y_autofocus -->
			<input
				id="workspace-name"
				bind:value={name}
				autofocus
				autocomplete="off"
				placeholder="Marketing"
				class="h-10 w-full rounded-md border-line bg-canvas/60 px-3 text-[13.5px] text-fg placeholder:text-fg-faint focus:border-accent/60 focus:ring-0"
			/>
		</div>
		<p class="mt-1.5 text-[11.5px] text-fg-muted">
			It starts with an empty Home page, stored in Context Cloud. You can connect your own
			repository later in settings.
		</p>

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
