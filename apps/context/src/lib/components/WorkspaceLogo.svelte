<script lang="ts">
	import { Leaf } from '@lucide/svelte';
	import type { WorkspaceColor, WorkspaceSettings } from '$lib/mock/workspace';

	let {
		settings,
		size = 'sm'
	}: {
		settings: Pick<WorkspaceSettings, 'name' | 'logo' | 'color'>;
		size?: 'xs' | 'sm' | 'lg';
	} = $props();

	// Full class names so Tailwind can find them.
	const tints: Record<WorkspaceColor, { tile: string; icon: string }> = {
		accent: { tile: 'border-accent/30 bg-accent/[0.07]', icon: 'fill-accent text-accent' },
		sky: { tile: 'border-sky-300/30 bg-sky-300/[0.07]', icon: 'fill-sky-300 text-sky-300' },
		amber: {
			tile: 'border-amber-300/30 bg-amber-300/[0.07]',
			icon: 'fill-amber-300 text-amber-300'
		}
	};

	const sizes = {
		xs: { box: 'size-[22px] rounded-[5px]', icon: 12 },
		sm: { box: 'size-7 rounded-md', icon: 15 },
		lg: { box: 'size-[88px] rounded-md', icon: 46 }
	};

	const tint = $derived(tints[settings.color]);
	const dims = $derived(sizes[size]);
</script>

<div
	class="grid shrink-0 place-items-center overflow-hidden border {dims.box} {tint.tile}"
	aria-hidden={size !== 'lg'}
>
	{#if settings.logo}
		<img src={settings.logo} alt="{settings.name} logo" class="size-full object-cover" />
	{:else}
		<Leaf size={dims.icon} class={tint.icon} strokeWidth={1.4} />
	{/if}
</div>
