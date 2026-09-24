<script lang="ts">
	import { workspace } from '$lib/state/workspace.svelte';
	import Avatar from './Avatar.svelte';
	import Dropdown from './Dropdown.svelte';

	let { slug }: { slug: string } = $props();

	const MAX_AVATARS = 3;

	const users = $derived(workspace.activeUsers(slug));
	const shown = $derived(users.slice(0, MAX_AVATARS));
	const summary = $derived(
		users.length === 1
			? users[0].person.name
			: users.length === 2
				? users.map((u) => u.person.name).join(', ')
				: `${users.length} active`
	);
</script>

<Dropdown
	label="Active users"
	role="dialog"
	panelClass="w-[250px]"
	triggerClass="flex h-7 items-center gap-2 rounded-md px-1.5 text-fg-soft hover:bg-hover aria-expanded:bg-hover"
>
	{#snippet trigger()}
		<span class="flex -space-x-1.5">
			{#each shown as { person } (person.email)}
				<Avatar
					initials={person.initials[0]}
					color={person.color}
					size={20}
					class="ring-2 ring-canvas"
				/>
			{/each}
			{#if users.length > MAX_AVATARS}
				<span
					class="grid size-5 place-items-center rounded-full bg-raised text-[9px] font-semibold text-fg-soft ring-2 ring-canvas"
				>
					+{users.length - MAX_AVATARS}
				</span>
			{/if}
		</span>
		{summary}
	{/snippet}
	<p class="px-2.5 pt-1.5 pb-2 text-[11px] tracking-[0.02em] text-fg-muted uppercase">
		Active now · {users.length}
	</p>
	<ul>
		{#each users as { person, status }, i (person.email)}
			<li class="flex h-10 items-center gap-2.5 rounded-md px-2.5">
				<span class="relative">
					<Avatar initials={person.initials} color={person.color} size={26} />
					<span
						class="absolute -right-px -bottom-px size-2.5 rounded-full ring-2 ring-panel {status ===
						'editing'
							? 'bg-accent'
							: 'bg-fg-muted'}"
					></span>
				</span>
				<span class="min-w-0 flex-1 leading-tight">
					<span class="block truncate text-[13px] text-fg">
						{person.name}{#if i === 0}<span class="ml-1 text-fg-muted">(you)</span>{/if}
					</span>
					<span class="block truncate text-[11.5px] text-fg-muted">{person.email}</span>
				</span>
				<span class="text-[11.5px] {status === 'editing' ? 'text-accent' : 'text-fg-muted'}">
					{status === 'editing' ? 'Editing' : 'Viewing'}
				</span>
			</li>
		{/each}
	</ul>
</Dropdown>
