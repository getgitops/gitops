<script lang="ts">
	let {
		initials,
		size = 24,
		class: className = ''
	}: { initials: string; size?: number; class?: string } = $props();
</script>

<span
	class="inline-grid shrink-0 place-items-center rounded-full bg-accent font-semibold text-accent-ink {className}"
	style="width: {size}px; height: {size}px; font-size: {Math.round(size * 0.42)}px;"
>
	{initials}
</span>
