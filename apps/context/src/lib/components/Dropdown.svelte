<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		trigger,
		children,
		triggerClass = '',
		panelClass = 'w-60',
		role = 'menu',
		align = 'end',
		side = 'bottom',
		open = $bindable(false)
	}: {
		/** Accessible name of the trigger button. */
		label: string;
		trigger: Snippet<[{ open: boolean }]>;
		/** Receives a `close` callback for items that should dismiss the dropdown. */
		children: Snippet<[() => void]>;
		triggerClass?: string;
		panelClass?: string;
		/** `menu` for actions, `dialog` for informational popovers. */
		role?: 'menu' | 'dialog';
		/** Which edge of the trigger the panel lines up with. */
		align?: 'start' | 'end';
		/** Whether the panel opens below or above the trigger. */
		side?: 'bottom' | 'top';
		open?: boolean;
	} = $props();

	let root = $state<HTMLElement>();
	let button = $state<HTMLButtonElement>();
	let panel = $state<HTMLElement>();

	function close(refocus = false) {
		open = false;
		if (refocus) button?.focus();
	}

	$effect(() => {
		if (open) panel?.focus({ preventScroll: true });
	});

	/** Menu items of the (sub)menu that contains `from`. */
	function siblings(from: Element) {
		const menu = from.closest('[role=menu]') ?? panel;
		return Array.from(
			menu?.querySelectorAll<HTMLElement>('[role=menuitem]:not([aria-disabled=true])') ?? []
		).filter((el) => el.closest('[role=menu]') === menu);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			close(true);
			return;
		}
		if (e.key === 'Tab') return close();
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
		e.preventDefault();
		const current = document.activeElement as HTMLElement;
		const items = siblings(current === panel ? panel! : current);
		if (!items.length) return;
		const index = items.indexOf(current);
		const next =
			e.key === 'ArrowDown'
				? items[(index + 1) % items.length]
				: items[(index - 1 + items.length) % items.length];
		next.focus();
	}

	// Hovering an item focuses it, so mouse and keyboard share a single highlight.
	function onpointermove(e: PointerEvent) {
		const item = (e.target as Element).closest<HTMLElement>('[role=menuitem]');
		if (item && item !== document.activeElement && item.getAttribute('aria-disabled') !== 'true') {
			item.focus({ preventScroll: true });
		}
	}
</script>

<svelte:window onpointerdown={(e) => open && !root?.contains(e.target as Node) && close()} />

<div bind:this={root} class="relative">
	<button
		bind:this={button}
		type="button"
		class={triggerClass}
		aria-label={label}
		aria-haspopup={role}
		aria-expanded={open}
		onclick={() => (open = !open)}
		onkeydown={(e) => {
			if (e.key === 'ArrowDown' && !open) {
				e.preventDefault();
				open = true;
			}
		}}
	>
		{@render trigger({ open })}
	</button>

	{#if open}
		<div
			bind:this={panel}
			{role}
			tabindex="-1"
			aria-label={label}
			class="absolute z-40 rounded-xl border border-line-strong bg-panel p-[6px] text-left shadow-2xl shadow-black/60 outline-none {side ===
			'bottom'
				? 'top-full mt-1.5'
				: 'bottom-full mb-1.5'} {align === 'end' ? 'right-0' : 'left-0'} {panelClass}"
			{onkeydown}
			{onpointermove}
		>
			{@render children(() => close(true))}
		</div>
	{/if}
</div>
