<script lang="ts">
	import type { Component } from 'svelte';
	import { ChevronRight, CloudUpload, FileText, Folder, Plus, SquareLibrary } from '@lucide/svelte';
	import { shortcutKeys } from '$lib/commands';
	import { ui, type CreateModal } from '$lib/state/ui.svelte';
	import Kbd from './Kbd.svelte';

	interface MenuItem {
		label: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		icon: Component<any>;
		keys?: string[];
		chevron?: boolean;
		/** Items without an action are not implemented yet and render disabled. */
		modal?: CreateModal;
		separatorBefore?: boolean;
	}

	const items: MenuItem[] = [
		{
			label: 'Document',
			icon: FileText,
			keys: shortcutKeys({ code: 'KeyN' }),
			modal: { kind: 'document' }
		},
		{
			label: 'Folder',
			icon: Folder,
			keys: shortcutKeys({ code: 'KeyN', shift: true }),
			modal: { kind: 'folder' }
		},

		{ label: 'Import', icon: CloudUpload, chevron: true, separatorBefore: true },
		{
			label: 'From template',
			icon: SquareLibrary,
			chevron: true,
			modal: { kind: 'document', templateId: 'meeting' }
		}
	];

	// Row 0 is the "New" header; it creates a document like the first item.
	const rows = [{ modal: { kind: 'document' } as CreateModal }, ...items];
	const enabled = rows.map((r, i) => (r.modal ? i : -1)).filter((i) => i >= 0);

	let menu = $state<HTMLElement>();
	let active = $state(0);
	let position = $state({ x: 0, y: 0 });

	$effect(() => {
		if (!ui.menu || !menu) return;
		active = 0;
		const { width, height } = menu.getBoundingClientRect();
		position = {
			x: Math.max(8, Math.min(ui.menu.x, window.innerWidth - width - 8)),
			y: Math.max(8, Math.min(ui.menu.y, window.innerHeight - height - 8))
		};
		menu.focus();
	});

	function choose(index: number) {
		const modal = rows[index].modal;
		if (!modal) return;
		// Right-clicking the sidebar fixes the parent folder of the new item.
		const folderId = ui.menu?.folderId;
		if (folderId === undefined) ui.openModal(modal);
		else if (modal.kind === 'folder') ui.openModal({ ...modal, parentId: folderId });
		else if (modal.kind === 'document') ui.openModal({ ...modal, folderId });
		else ui.openModal(modal);
	}

	function move(delta: number) {
		const i = enabled.indexOf(active);
		active = enabled[(i + delta + enabled.length) % enabled.length];
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') move(1);
		else if (e.key === 'ArrowUp') move(-1);
		else if (e.key === 'Enter' || e.key === ' ') choose(active);
		else if (e.key === 'Escape') ui.closeMenu();
		else return;
		e.preventDefault();
	}

	const rowClass = (i: number, disabled = false) =>
		`relative flex w-full items-center gap-[13px] rounded-md pr-3 pl-[18px] text-left text-[13px] transition-colors ${
			disabled
				? 'cursor-default text-fg-faint'
				: i === active
					? 'bg-accent/10 text-fg'
					: 'text-fg-soft'
		}`;
</script>

<svelte:window
	onpointerdown={(e) => ui.menu && !menu?.contains(e.target as Node) && ui.closeMenu()}
	onresize={() => ui.closeMenu()}
	onblur={() => ui.closeMenu()}
/>

{#if ui.menu}
	<div
		bind:this={menu}
		role="menu"
		tabindex="-1"
		aria-label="New item"
		class="fixed z-50 w-[360px] rounded-xl border border-line-strong bg-panel p-[7px] shadow-2xl shadow-black/60 outline-none"
		style="left: {position.x}px; top: {position.y}px"
		{onkeydown}
		oncontextmenu={(e) => e.preventDefault()}
	>
		<button
			type="button"
			role="menuitem"
			class="{rowClass(0)} h-[34px] font-medium text-fg"
			onpointermove={() => (active = 0)}
			onclick={() => choose(0)}
		>
			{#if active === 0}
				<span class="absolute inset-y-0 left-0 w-[2px] rounded-l-md bg-accent"></span>
			{/if}
			<span class="grid size-[19px] place-items-center rounded-full bg-accent text-accent-ink">
				<Plus size={13} strokeWidth={2.6} />
			</span>
			New
			<ChevronRight size={15} class="ml-auto text-fg-soft" />
		</button>

		<div class="mt-1">
			{#each items as item, i (item.label)}
				{@const index = i + 1}
				{@const Icon = item.icon}
				{@const disabled = !item.modal}
				{#if item.separatorBefore}
					<hr class="mx-[11px] my-[11px] border-line" />
				{/if}
				<button
					type="button"
					role="menuitem"
					aria-disabled={disabled}
					title={disabled ? 'Coming soon' : undefined}
					class="{rowClass(index, disabled)} h-[37px]"
					onpointermove={() => !disabled && (active = index)}
					onclick={() => choose(index)}
				>
					{#if index === active}
						<span class="absolute inset-y-0 left-0 w-[2px] rounded-l-md bg-accent"></span>
					{/if}
					<Icon
						size={18}
						class={disabled ? '' : index === active ? 'text-accent' : 'text-fg-soft'}
					/>
					{item.label}
					<span class="ml-auto flex items-center">
						{#if item.keys}<Kbd keys={item.keys} class={disabled ? 'opacity-60' : ''} />{/if}
						{#if item.chevron}<ChevronRight size={15} class="text-fg-muted" />{/if}
					</span>
				</button>
			{/each}
		</div>
	</div>
{/if}
