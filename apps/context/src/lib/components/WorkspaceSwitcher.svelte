<script lang="ts">
	import { Check, ChevronsUpDown, Plus, Settings } from '@lucide/svelte';
	import { settingsHref } from '$lib/links';
	import { ui } from '$lib/state/ui.svelte';
	import { workspace, type WorkspaceData } from '$lib/state/workspace.svelte';
	import { switchWorkspace } from '$lib/workspaces';
	import Dropdown from './Dropdown.svelte';
	import MenuItem from './MenuItem.svelte';
	import WorkspaceLogo from './WorkspaceLogo.svelte';

	const displayName = (ws: WorkspaceData) => ws.settings.name.trim() || 'Untitled workspace';

	function pageCount(ws: WorkspaceData) {
		const count = Object.keys(ws.pages).length;
		return `${count} ${count === 1 ? 'page' : 'pages'}`;
	}
</script>

<div class="shrink-0 border-t border-line px-2.5 py-2">
	<Dropdown
		label="Switch workspace"
		side="top"
		align="start"
		panelClass="w-full"
		triggerClass="flex h-[46px] w-full items-center gap-[11px] rounded-md px-[7px] text-left transition-colors hover:bg-hover aria-expanded:bg-hover"
	>
		{#snippet trigger()}
			<WorkspaceLogo settings={workspace.settings} />
			<span class="min-w-0 flex-1 leading-tight">
				<span class="block truncate text-[13px] font-medium text-fg">
					{displayName(workspace.current)}
				</span>
				<span class="mt-0.5 block truncate text-[11px] text-fg-muted">
					{pageCount(workspace.current)}
				</span>
			</span>
			<ChevronsUpDown size={15} class="shrink-0 text-fg-muted" />
		{/snippet}
		{#snippet children(close)}
			<p class="px-2.5 pt-1.5 pb-2 text-[11px] tracking-[0.02em] text-fg-muted uppercase">
				Workspaces
			</p>
			{#each workspace.all as ws (ws.id)}
				<MenuItem
					onclick={() => {
						close();
						switchWorkspace(ws.id);
					}}
				>
					<span class="flex items-center gap-2.5">
						<WorkspaceLogo settings={ws.settings} size="xs" />
						<span class="min-w-0 truncate text-fg">{displayName(ws)}</span>
						{#if ws.settings.status === 'archived'}
							<span class="text-[11px] text-fg-faint">Archived</span>
						{/if}
					</span>
					{#snippet trailing()}
						{#if ws.id === workspace.currentId}
							<Check size={14} class="shrink-0 text-accent" />
						{/if}
					{/snippet}
				</MenuItem>
			{/each}
			<hr class="mx-1.5 my-[5px] border-line" />
			<MenuItem
				icon={Plus}
				label="Create workspace"
				onclick={() => {
					close();
					ui.openModal({ kind: 'workspace' });
				}}
			/>
			<MenuItem icon={Settings} label="Workspace settings" href={settingsHref()} onclick={close} />
		{/snippet}
	</Dropdown>
</div>
