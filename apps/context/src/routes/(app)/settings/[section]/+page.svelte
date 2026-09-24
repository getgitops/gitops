<script lang="ts">
	import { Construction } from '@lucide/svelte';
	import { settingsSections } from '$lib/settings';

	let { data } = $props();

	const section = $derived(settingsSections.find((s) => s.id === data.section)!);
</script>

<svelte:head>
	<title>{section.label} · Settings · Context</title>
</svelte:head>

<div class="pt-[30px] pr-[26px] pb-10 pl-[31px]">
	<h1 class="text-[20px] leading-7 font-semibold tracking-[-0.01em] text-fg">{section.label}</h1>
	<p class="mt-[7px] text-[13.2px] leading-5 text-fg-soft">{section.description}</p>

	<div
		class="mt-[21px] flex flex-col items-center rounded-[10px] border border-line bg-panel/40 px-6 py-16 text-center"
	>
		<span class="grid size-11 place-items-center rounded-lg border border-line bg-panel">
			<Construction size={20} class="text-fg-muted" />
		</span>
		<p class="mt-4 text-[14px] font-medium text-fg">Nothing here yet</p>
		<p class="mt-1 max-w-[340px] text-[12.5px] leading-[18px] text-fg-muted">
			This section is still being designed. Its options will show up here.
		</p>
	</div>
</div>
