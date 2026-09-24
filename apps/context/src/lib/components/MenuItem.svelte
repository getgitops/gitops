<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	let {
		icon,
		label,
		onclick,
		href,
		danger = false,
		disabled = false,
		iconClass = '',
		trailing,
		children
	}: {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		icon?: Component<any>;
		label?: string;
		onclick?: (e: MouseEvent) => void;
		/** Renders a link instead of a button. */
		href?: string;
		danger?: boolean;
		disabled?: boolean;
		iconClass?: string;
		trailing?: Snippet;
		/** Replaces `label` for richer content. */
		children?: Snippet;
	} = $props();

	const Icon = $derived(icon);
	const itemClass = $derived(
		`flex h-[34px] w-full items-center gap-3 rounded-md px-2.5 text-left text-[13px] outline-none transition-colors ${
			disabled
				? 'cursor-default text-fg-faint'
				: danger
					? 'text-danger focus:bg-danger/10'
					: 'text-fg-soft focus:bg-hover focus:text-fg'
		}`
	);
</script>

{#snippet content()}
	{#if Icon}
		<Icon size={16} class="shrink-0 {danger || disabled ? '' : 'text-fg-muted'} {iconClass}" />
	{/if}
	<span class="min-w-0 flex-1 truncate">
		{#if children}{@render children()}{:else}{label}{/if}
	</span>
	{@render trailing?.()}
{/snippet}

{#if href && !disabled}
	<!-- Links here point at the GitOps app (external), so `resolve()` doesn't apply. -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a {href} role="menuitem" tabindex="-1" class={itemClass} {onclick}>
		{@render content()}
	</a>
{:else}
	<button
		type="button"
		role="menuitem"
		tabindex="-1"
		aria-disabled={disabled}
		title={disabled ? 'Coming soon' : undefined}
		class={itemClass}
		onclick={(e) => !disabled && onclick?.(e)}
	>
		{@render content()}
	</button>
{/if}
