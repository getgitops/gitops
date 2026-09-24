<script lang="ts">
	import { goto } from '$app/navigation';
	import { TriangleAlert } from '@lucide/svelte';
	import { pageHref } from '$lib/links';
	import { workspace } from '$lib/state/workspace.svelte';
	import Modal from './Modal.svelte';

	let { onclose }: { onclose: () => void } = $props();

	// Snapshot: the workspace being deleted, even if the current one changes.
	const id = workspace.currentId;
	const { slug, name } = workspace.settings;
	const isLast = workspace.all.length <= 1;
	let confirmation = $state('');

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (confirmation !== slug || !workspace.deleteWorkspace(id)) return;
		onclose();
		goto(pageHref(workspace.entryPage(workspace.currentId)));
	}
</script>

<Modal title="Delete workspace" {onclose}>
	{#snippet icon()}
		<TriangleAlert size={19} class="text-danger" />
	{/snippet}

	<form class="px-[22px] pt-3 pb-[22px]" onsubmit={submit}>
		<p class="text-[13px] leading-5 text-fg-soft">
			This permanently deletes <span class="font-medium text-fg">{name}</span>
			and all of its pages, folders and history. This can't be undone.
		</p>

		{#if isLast}
			<p
				class="mt-4 rounded-md border border-danger/20 bg-danger/10 px-3 py-2 text-[12.5px] text-danger"
			>
				This is your only workspace. Create another one before deleting it.
			</p>
		{/if}

		<label for="delete-confirm" class="mt-[18px] mb-1.5 block text-[12.5px] text-fg-muted">
			Type <span class="font-medium text-fg">{slug}</span> to confirm
		</label>
		<!-- svelte-ignore a11y_autofocus -->
		<input
			id="delete-confirm"
			bind:value={confirmation}
			autofocus
			autocomplete="off"
			spellcheck="false"
			class="h-10 w-full rounded-md border-line bg-canvas/60 px-3 text-[13.5px] text-fg placeholder:text-fg-faint focus:border-danger/60 focus:ring-0"
			placeholder={slug}
		/>

		<footer class="mt-7 flex justify-end gap-3">
			<button
				type="button"
				class="h-10 rounded-md border border-line bg-raised px-6 text-[13.5px] text-fg-soft hover:border-line-strong hover:text-fg"
				onclick={onclose}
			>
				Cancel
			</button>
			<button
				type="submit"
				disabled={confirmation !== slug || isLast}
				class="h-10 rounded-md bg-danger px-6 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
			>
				Delete workspace
			</button>
		</footer>
	</form>
</Modal>
