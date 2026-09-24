<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from '@lucide/svelte';

	let {
		title,
		icon,
		onclose,
		children,
		class: className = 'w-[420px]'
	}: {
		title: string;
		icon?: Snippet;
		onclose: () => void;
		children: Snippet;
		class?: string;
	} = $props();

	let dialog = $state<HTMLDialogElement>();

	$effect(() => {
		dialog?.showModal();
	});
</script>

<dialog
	bind:this={dialog}
	aria-label={title}
	class="fixed inset-0 m-auto h-fit max-w-[calc(100vw-2rem)] overflow-visible rounded-xl border border-line-strong bg-panel p-0 text-fg shadow-2xl shadow-black/60 backdrop:bg-black/55 backdrop:backdrop-blur-[2px] {className}"
	{onclose}
	onclick={(e) => e.target === dialog && dialog?.close()}
>
	<header class="flex items-center gap-3 pt-5 pr-[18px] pl-[22px]">
		{@render icon?.()}
		<h2 class="text-[15px] font-semibold">{title}</h2>
		<button
			type="button"
			class="ml-auto grid size-7 place-items-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
			aria-label="Close"
			onclick={() => dialog?.close()}
		>
			<X size={17} />
		</button>
	</header>
	{@render children()}
</dialog>
