<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { Check, ChevronDown, ChevronRight } from '@lucide/svelte';

	interface Option {
		value: T;
		label: string;
		depth?: number;
		hint?: string;
	}

	let {
		value = $bindable(),
		options,
		display,
		icon,
		optionIcon,
		chevron = 'down',
		id
	}: {
		value: T;
		options: Option[];
		/** Text shown in the closed button; defaults to the selected label. */
		display?: string;
		icon?: Snippet;
		optionIcon?: Snippet<[Option]>;
		chevron?: 'down' | 'right';
		id?: string;
	} = $props();

	let open = $state(false);
	let active = $state(0);
	let root = $state<HTMLElement>();
	let list = $state<HTMLElement>();

	const selected = $derived(options.find((o) => o.value === value));

	function toggle() {
		open = !open;
		if (open)
			active = Math.max(
				0,
				options.findIndex((o) => o.value === value)
			);
	}

	function choose(option: Option) {
		value = option.value;
		open = false;
		root?.querySelector('button')?.focus();
	}

	function onkeydown(e: KeyboardEvent) {
		if (!open) {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				toggle();
			}
			return;
		}
		if (e.key === 'Escape') {
			// Keep the surrounding dialog open.
			e.preventDefault();
			e.stopPropagation();
			open = false;
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = (active + 1) % options.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = (active - 1 + options.length) % options.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			choose(options[active]);
		}
	}

	$effect(() => {
		if (open) list?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
	});
</script>

<svelte:window onpointerdown={(e) => open && !root?.contains(e.target as Node) && (open = false)} />

<div bind:this={root} class="relative">
	<button
		{id}
		type="button"
		class="flex h-10 w-full items-center gap-2.5 rounded-md border px-3 text-left text-[13.5px] text-fg transition-colors {open
			? 'border-accent/60'
			: 'border-line hover:border-line-strong'} bg-canvas/60"
		aria-haspopup="listbox"
		aria-expanded={open}
		onclick={toggle}
		{onkeydown}
	>
		{@render icon?.()}
		<span class="min-w-0 flex-1 truncate">{display ?? selected?.label}</span>
		{#if chevron === 'right'}
			<ChevronRight
				size={15}
				class="text-fg-muted transition-transform {open ? 'rotate-90' : ''}"
			/>
		{:else}
			<ChevronDown
				size={15}
				class="text-fg-muted transition-transform {open ? 'rotate-180' : ''}"
			/>
		{/if}
	</button>

	{#if open}
		<ul
			bind:this={list}
			role="listbox"
			class="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-md border border-line-strong bg-raised p-1 shadow-xl shadow-black/50"
		>
			{#each options as option, i (i)}
				<li
					role="option"
					aria-selected={option.value === value}
					data-index={i}
					class="flex h-8 cursor-pointer items-center gap-2 rounded pr-2 text-[13px] {i === active
						? 'bg-hover text-fg'
						: 'text-fg-soft'}"
					style="padding-left: {8 + (option.depth ?? 0) * 14}px"
					onpointerenter={() => (active = i)}
					onclick={() => choose(option)}
					onkeydown={() => {}}
				>
					{@render optionIcon?.(option)}
					<span class="min-w-0 flex-1 truncate">{option.label}</span>
					{#if option.hint}<span class="text-[11.5px] text-fg-faint">{option.hint}</span>{/if}
					{#if option.value === value}<Check size={14} class="text-accent" />{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
