<script lang="ts">
	let {
		initials,
		size = 24,
		color = 'bg-accent',
		class: className = ''
	}: { initials: string; size?: number; color?: string; class?: string } = $props();
</script>

<span
	class="inline-grid shrink-0 place-items-center rounded-full font-semibold text-accent-ink {color} {className}"
	style="width: {size}px; height: {size}px; font-size: {Math.round(size * 0.42)}px;"
>
	{initials}
</span>
