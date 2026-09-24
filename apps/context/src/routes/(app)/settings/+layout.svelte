<script lang="ts">
	import { page } from '$app/state';
	import { settingsHref } from '$lib/links';
	import { settingsSections } from '$lib/settings';

	let { children } = $props();

	// Static sections (e.g. /settings/repository) have no `section` param.
	const active = $derived(page.url.pathname.match(/^\/settings\/([^/]+)/)?.[1] ?? null);
</script>

<div class="flex h-full">
	<nav
		class="w-[245px] shrink-0 space-y-[3px] overflow-y-auto border-r border-line pt-[33px] pl-[21px]"
		aria-label="Settings"
	>
		{#each settingsSections as section (section.id)}
			{@const Icon = section.icon}
			{@const current = section.id === active}
			{#if section.soon}
				<span
					class="flex h-[37px] cursor-default items-center gap-[13px] pl-[10px] text-[13px] text-fg-soft"
					aria-disabled="true"
				>
					<Icon size={18} class="shrink-0 text-fg-muted" />
					{section.label}
					<span
						class="ml-[13px] grid h-[22px] place-items-center rounded-md bg-raised px-2 text-[11px] text-fg-soft"
					>
						Soon
					</span>
				</span>
			{:else}
				<a
					href={settingsHref(section.id ?? undefined)}
					class="flex h-[37px] items-center gap-[13px] rounded-l-md pl-[10px] text-[13px] transition-colors {current
						? 'bg-accent/10 text-accent'
						: 'text-fg-soft hover:bg-hover hover:text-fg'}"
					aria-current={current ? 'page' : undefined}
				>
					<Icon size={18} class="shrink-0 {current ? '' : 'text-fg-muted'}" />
					{section.label}
				</a>
			{/if}
		{/each}
	</nav>

	<div class="min-w-0 flex-1 overflow-y-auto">
		{@render children()}
	</div>
</div>
