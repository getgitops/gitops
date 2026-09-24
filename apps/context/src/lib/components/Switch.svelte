<script lang="ts">
	let {
		checked = $bindable(),
		label,
		hideLabel = false,
		size = 'sm'
	}: {
		checked: boolean;
		label: string;
		/** Keeps the label for assistive tech only. */
		hideLabel?: boolean;
		size?: 'sm' | 'md';
	} = $props();

	const track = $derived(
		size === 'md'
			? `h-5 w-[35px] ${checked ? 'bg-accent' : 'bg-fg-faint/75'}`
			: `h-[18px] w-[34px] ${checked ? 'bg-accent' : 'bg-line-strong'}`
	);
	const knob = $derived(
		size === 'md'
			? `top-[3px] left-[3px] ${checked ? 'translate-x-[15px]' : ''}`
			: `top-[2px] left-[2px] ${checked ? 'translate-x-4' : ''}`
	);
</script>

<label
	class="flex w-fit cursor-pointer items-center gap-2.5 text-[12.5px] text-fg-soft select-none"
>
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		aria-label={label}
		class="relative shrink-0 rounded-full transition-colors {track}"
		onclick={() => (checked = !checked)}
	>
		<span class="absolute size-[14px] rounded-full bg-white shadow transition-transform {knob}"
		></span>
	</button>
	{#if !hideLabel}{label}{/if}
</label>
