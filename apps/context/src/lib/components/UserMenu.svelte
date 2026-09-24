<script lang="ts">
	import { tick } from 'svelte';
	import {
		ArrowRight,
		Bell,
		Building2,
		Check,
		ChevronDown,
		ChevronRight,
		Keyboard,
		LogOut,
		Settings,
		UserRound,
		Workflow
	} from '@lucide/svelte';
	import { gitopsUrl } from '$lib/config';
	import { session } from '$lib/state/session.svelte';
	import { ui } from '$lib/state/ui.svelte';
	import Avatar from './Avatar.svelte';
	import Dropdown from './Dropdown.svelte';
	import Kbd from './Kbd.svelte';
	import MenuItem from './MenuItem.svelte';

	let menuOpen = $state(false);
	let orgsOpen = $state(false);
	let orgRow = $state<HTMLElement>();
	let orgMenu = $state<HTMLElement>();

	$effect(() => {
		if (!menuOpen) orgsOpen = false;
	});

	const orgUrl = $derived(`${gitopsUrl}/org/${session.org.slug}`);

	async function openOrgs(focus: boolean) {
		orgsOpen = true;
		if (!focus) return;
		await tick();
		orgMenu?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
	}

	function closeOrgs() {
		orgsOpen = false;
		orgRow?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
	}

	function onOrgRowKeydown(e: KeyboardEvent) {
		if (e.target !== orgRow?.querySelector('[role=menuitem]')) return;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
			e.preventDefault();
			openOrgs(true);
		}
	}

	function onOrgMenuKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' || e.key === 'ArrowRight') {
			// Only close the submenu, not the whole dropdown.
			e.preventDefault();
			e.stopPropagation();
			closeOrgs();
		}
	}
</script>

<Dropdown
	label="Account"
	panelClass="w-[272px]"
	triggerClass="ml-[18px] flex items-center gap-1.5 text-fg-muted hover:text-fg aria-expanded:text-fg"
	bind:open={menuOpen}
>
	{#snippet trigger()}
		<span class="relative">
			<Avatar initials={session.user.initials} color={session.user.color} size={24} />
			{#if session.unread}
				<span class="absolute -top-px -right-px size-2 rounded-full bg-danger ring-2 ring-canvas"
				></span>
			{/if}
		</span>
		<ChevronDown size={14} />
	{/snippet}
	{#snippet children(close)}
		<div class="flex items-center gap-3 px-2.5 pt-2 pb-2.5">
			<Avatar initials={session.user.initials} color={session.user.color} size={34} />
			<div class="min-w-0 leading-tight">
				<p class="truncate text-[13.5px] font-medium text-fg">{session.user.name}</p>
				<p class="truncate text-[12px] text-fg-muted">{session.user.email}</p>
			</div>
		</div>
		<hr class="mx-1.5 mb-[5px] border-line" />

		<MenuItem icon={UserRound} label="Profile" href="{gitopsUrl}/profile" />
		<MenuItem icon={Bell} label="Notifications" onclick={close}>
			{#snippet trailing()}
				{#if session.unread}
					<span
						class="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10.5px] font-semibold text-accent-ink"
					>
						{session.unread}
					</span>
				{/if}
			{/snippet}
		</MenuItem>

		<div
			bind:this={orgRow}
			class="relative"
			role="presentation"
			onpointerenter={() => openOrgs(false)}
			onpointerleave={() => (orgsOpen = false)}
			onkeydown={onOrgRowKeydown}
		>
			<MenuItem icon={Building2} onclick={() => (orgsOpen ? closeOrgs() : openOrgs(true))}>
				Organization: <span class="text-fg">{session.org.name}</span>
				{#snippet trailing()}
					<ChevronRight size={15} class="text-fg-muted" />
				{/snippet}
			</MenuItem>

			{#if orgsOpen}
				<!-- The padding bridges the gap so the pointer can reach the submenu. -->
				<div class="absolute top-[-7px] right-full pr-2">
					<div
						bind:this={orgMenu}
						role="menu"
						tabindex="-1"
						aria-label="Switch organization"
						class="w-[250px] rounded-xl border border-line-strong bg-panel p-[6px] shadow-2xl shadow-black/60 outline-none"
						onkeydown={onOrgMenuKeydown}
					>
						<p class="px-2.5 pt-1.5 pb-2 text-[11px] tracking-[0.02em] text-fg-muted uppercase">
							Organizations
						</p>
						{#each session.organizations as org (org.slug)}
							<MenuItem
								onclick={() => {
									session.switchOrg(org.slug);
									orgsOpen = false;
									close();
								}}
							>
								<span class="flex items-center gap-2.5">
									<span
										class="grid size-[22px] shrink-0 place-items-center rounded-md text-[11px] font-semibold text-accent-ink {org.color}"
									>
										{org.name[0].toUpperCase()}
									</span>
									<span class="truncate text-fg">{org.name}</span>
									<span class="text-[11.5px] text-fg-muted">{org.role}</span>
								</span>
								{#snippet trailing()}
									{#if org.slug === session.org.slug}<Check size={14} class="text-accent" />{/if}
								{/snippet}
							</MenuItem>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<MenuItem icon={Settings} label="Organization settings" href="{orgUrl}/settings" />
		<MenuItem
			icon={Keyboard}
			label="Keyboard shortcuts"
			onclick={() => {
				close();
				ui.openPalette();
			}}
		>
			{#snippet trailing()}<Kbd keys={['⌘', 'K']} />{/snippet}
		</MenuItem>

		<hr class="mx-1.5 my-[5px] border-line" />
		<MenuItem icon={Workflow} label="Go to GitOps" href="{orgUrl}/overview">
			{#snippet trailing()}<ArrowRight size={15} class="text-fg-muted" />{/snippet}
		</MenuItem>
		<hr class="mx-1.5 my-[5px] border-line" />
		<MenuItem icon={LogOut} label="Log out" danger href="{gitopsUrl}/auth/logout" />
	{/snippet}
</Dropdown>
