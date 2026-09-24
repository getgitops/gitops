<script lang="ts">
	import { page as appPage } from '$app/state';
	import {
		Building2,
		Check,
		ChevronDown,
		Globe,
		Link,
		LockKeyhole,
		Share2,
		UserMinus
	} from '@lucide/svelte';
	import { pageHref } from '$lib/links';
	import type { Person } from '$lib/mock/pages';
	import { directory, type GeneralAccess, type ShareRole } from '$lib/mock/users';
	import { session } from '$lib/state/session.svelte';
	import { workspace } from '$lib/state/workspace.svelte';
	import Avatar from './Avatar.svelte';
	import Dropdown from './Dropdown.svelte';
	import MenuItem from './MenuItem.svelte';
	import Modal from './Modal.svelte';

	let { slug, onclose }: { slug: string; onclose: () => void } = $props();

	// svelte-ignore state_referenced_locally
	const access = workspace.accessOf(slug);
	const doc = $derived(workspace.pages[slug]);

	const roleLabels: Record<ShareRole, string> = {
		owner: 'Owner',
		edit: 'Can edit',
		view: 'Can view'
	};

	const generalOptions = $derived<
		{ id: GeneralAccess; label: string; hint: string; icon: typeof Globe }[]
	>([
		{
			id: 'restricted',
			label: 'Only people invited',
			hint: 'Only people with access can open this page',
			icon: LockKeyhole
		},
		{
			id: 'org',
			label: `Anyone at ${session.org.name}`,
			hint: `Members of ${session.org.name} can view`,
			icon: Building2
		},
		{
			id: 'link',
			label: 'Anyone with the link',
			hint: 'Anyone on the internet with the link can view',
			icon: Globe
		}
	]);
	const general = $derived(generalOptions.find((o) => o.id === access.general)!);

	let query = $state('');
	let inviteRole = $state<Exclude<ShareRole, 'owner'>>('edit');
	let active = $state(0);
	let copied = $state(false);

	const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
	const hasAccess = (email: string) => access.members.some((m) => m.person.email === email);

	const suggestions = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		return directory
			.filter((p) => !hasAccess(p.email))
			.filter((p) => p.name.toLowerCase().includes(q) || p.email.includes(q))
			.slice(0, 4);
	});
	const canInvite = $derived(
		suggestions.length > 0 || (isEmail(query.trim()) && !hasAccess(query.trim()))
	);

	function invite(person?: Person) {
		const email = query.trim().toLowerCase();
		const target =
			person ??
			suggestions[active] ??
			(isEmail(email) && !hasAccess(email)
				? { name: email.split('@')[0], initials: email.slice(0, 2).toUpperCase(), email }
				: undefined);
		if (!target) return;
		const known = directory.some((p) => p.email === target.email);
		access.members.push({ person: target, role: inviteRole, pending: !known });
		query = '';
		active = 0;
	}

	function onInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			invite();
		} else if (suggestions.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
			e.preventDefault();
			const delta = e.key === 'ArrowDown' ? 1 : -1;
			active = (active + delta + suggestions.length) % suggestions.length;
		}
	}

	async function copyLink() {
		await navigator.clipboard?.writeText(new URL(pageHref(slug), appPage.url.origin).toString());
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	const compactTrigger =
		'flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-fg-soft hover:bg-hover hover:text-fg aria-expanded:bg-hover aria-expanded:text-fg';
</script>

<Modal title="Share page" class="w-[480px]" {onclose}>
	{#snippet icon()}
		<Share2 size={19} class="text-fg-soft" />
	{/snippet}

	<div class="px-[22px] pt-1.5 pb-[22px]">
		<p class="truncate text-[12.5px] text-fg-muted">
			Invite people to <span class="text-fg-soft">{doc?.title || 'Untitled'}</span>
		</p>

		<!-- Invite -->
		<div class="relative mt-4 flex gap-2">
			<div
				class="flex h-10 min-w-0 flex-1 items-center rounded-md border border-line bg-canvas/60 pr-1 focus-within:border-accent/60"
			>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					bind:value={query}
					autofocus
					autocomplete="off"
					aria-label="Invite by name or email"
					placeholder="Add people by name or email"
					class="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-[13.5px] text-fg placeholder:text-fg-faint focus:ring-0"
					oninput={() => (active = 0)}
					onkeydown={onInputKeydown}
				/>
				<Dropdown label="Invite role" panelClass="w-40" triggerClass={compactTrigger}>
					{#snippet trigger()}
						{roleLabels[inviteRole]}
						<ChevronDown size={13} />
					{/snippet}
					{#snippet children(close)}
						{#each ['edit', 'view'] as const as role (role)}
							<MenuItem
								label={roleLabels[role]}
								onclick={() => {
									inviteRole = role;
									close();
								}}
							>
								{#snippet trailing()}
									{#if inviteRole === role}<Check size={14} class="text-accent" />{/if}
								{/snippet}
							</MenuItem>
						{/each}
					{/snippet}
				</Dropdown>
			</div>
			<button
				type="button"
				disabled={!canInvite}
				class="h-10 rounded-md bg-accent px-5 text-[13.5px] font-semibold text-accent-ink transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
				onclick={() => invite()}
			>
				Invite
			</button>

			{#if suggestions.length}
				<ul
					role="listbox"
					aria-label="Suggestions"
					class="absolute inset-x-0 top-full z-20 mt-1 rounded-md border border-line-strong bg-raised p-1 shadow-xl shadow-black/50"
				>
					{#each suggestions as person, i (person.email)}
						<li
							role="option"
							aria-selected={i === active}
							class="flex h-10 cursor-pointer items-center gap-2.5 rounded px-2 {i === active
								? 'bg-hover'
								: ''}"
							onpointerenter={() => (active = i)}
							onpointerdown={(e) => e.preventDefault()}
							onclick={() => invite(person)}
							onkeydown={() => {}}
						>
							<Avatar initials={person.initials} color={person.color} size={24} />
							<span class="text-[13px] text-fg">{person.name}</span>
							<span class="truncate text-[12px] text-fg-muted">{person.email}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<!-- People with access -->
		<p class="mt-[22px] mb-1.5 text-[12.5px] text-fg-muted">People with access</p>
		<ul class="-mx-1 max-h-[240px] overflow-y-auto px-1">
			{#each access.members as member, i (member.person.email)}
				<li class="flex h-12 items-center gap-3">
					<Avatar initials={member.person.initials} color={member.person.color} size={30} />
					<span class="min-w-0 flex-1 leading-tight">
						<span class="flex items-center gap-2 text-[13px] text-fg">
							<span class="truncate">{member.person.name}</span>
							{#if member.person.email === session.user.email}
								<span class="text-fg-muted">(you)</span>
							{/if}
							{#if member.pending}
								<span
									class="rounded border border-line-strong px-1.5 text-[10.5px] leading-4 text-fg-muted"
								>
									Invited
								</span>
							{/if}
						</span>
						<span class="block truncate text-[12px] text-fg-muted">{member.person.email}</span>
					</span>
					{#if member.role === 'owner'}
						<span class="px-2 text-[12px] text-fg-muted">Owner</span>
					{:else}
						<Dropdown
							label="Access for {member.person.name}"
							panelClass="w-44"
							triggerClass={compactTrigger}
						>
							{#snippet trigger()}
								{roleLabels[member.role]}
								<ChevronDown size={13} />
							{/snippet}
							{#snippet children(close)}
								{#each ['edit', 'view'] as const as role (role)}
									<MenuItem
										label={roleLabels[role]}
										onclick={() => {
											member.role = role;
											close();
										}}
									>
										{#snippet trailing()}
											{#if member.role === role}<Check size={14} class="text-accent" />{/if}
										{/snippet}
									</MenuItem>
								{/each}
								<hr class="mx-1.5 my-[5px] border-line" />
								<MenuItem
									icon={UserMinus}
									label="Remove access"
									danger
									onclick={() => access.members.splice(i, 1)}
								/>
							{/snippet}
						</Dropdown>
					{/if}
				</li>
			{/each}
		</ul>

		<!-- General access -->
		<p class="mt-[18px] mb-2 text-[12.5px] text-fg-muted">General access</p>
		<div class="flex items-center gap-3">
			<span
				class="grid size-[30px] shrink-0 place-items-center rounded-full {access.general ===
				'restricted'
					? 'bg-raised text-fg-soft'
					: 'bg-accent/15 text-accent'}"
			>
				<general.icon size={15} />
			</span>
			<div class="min-w-0 flex-1">
				<Dropdown
					label="General access"
					align="start"
					panelClass="w-[300px]"
					triggerClass="-ml-2 {compactTrigger} text-[13px] text-fg"
				>
					{#snippet trigger()}
						{general.label}
						<ChevronDown size={13} />
					{/snippet}
					{#snippet children(close)}
						{#each generalOptions as option (option.id)}
							<MenuItem
								icon={option.icon}
								label={option.label}
								onclick={() => {
									access.general = option.id;
									close();
								}}
							>
								{#snippet trailing()}
									{#if access.general === option.id}<Check size={14} class="text-accent" />{/if}
								{/snippet}
							</MenuItem>
						{/each}
					{/snippet}
				</Dropdown>
				<p class="truncate text-[12px] text-fg-muted">{general.hint}</p>
			</div>
		</div>

		<footer class="mt-7 flex items-center justify-between gap-3">
			<button
				type="button"
				class="flex h-10 items-center gap-2 rounded-md border border-line bg-raised px-4 text-[13.5px] text-fg-soft hover:border-line-strong hover:text-fg"
				onclick={copyLink}
			>
				{#if copied}<Check size={15} class="text-accent" />{:else}<Link size={15} />{/if}
				{copied ? 'Copied!' : 'Copy link'}
			</button>
			<button
				type="button"
				class="h-10 rounded-md bg-accent px-7 text-[13.5px] font-semibold text-accent-ink transition-colors hover:bg-accent-strong"
				onclick={onclose}
			>
				Done
			</button>
		</footer>
	</div>
</Modal>
