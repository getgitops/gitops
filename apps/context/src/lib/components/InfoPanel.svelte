<script lang="ts">
	import { pageHref } from '$lib/links';
	import { page as appPage } from '$app/state';
	import {
		ArrowRight,
		ChevronDown,
		Clock,
		Copy,
		FileText,
		Folder,
		GitBranch,
		GitCommitVertical,
		Link,
		Plus,
		SquareArrowOutUpRight,
		Trash2,
		X
	} from '@lucide/svelte';
	import type { Page } from '$lib/mock/pages';
	import { workspace } from '$lib/state/workspace.svelte';
	import Avatar from './Avatar.svelte';

	let { page }: { page: Page } = $props();

	type Tab = 'document' | 'links' | 'activity';
	const tabs: { id: Tab; label: string }[] = [
		{ id: 'document', label: 'Document' },
		{ id: 'links', label: 'Links' },
		{ id: 'activity', label: 'Activity' }
	];

	let tab = $state<Tab>('document');
	let open = $state({ properties: true, git: true, actions: true });
	let copied = $state(false);

	const outgoing = $derived(page.links.map((slug) => workspace.pages[slug]).filter(Boolean));
	const backlinks = $derived(
		Object.values(workspace.pages).filter((p) => p.links.includes(page.slug))
	);
	const href = $derived(pageHref(page.slug));

	async function copyLink() {
		await navigator.clipboard?.writeText(new URL(href, appPage.url.origin).toString());
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	const actions = $derived([
		{
			label: 'Open in new tab',
			icon: SquareArrowOutUpRight,
			run: () => window.open(href, '_blank')
		},
		{ label: copied ? 'Copied!' : 'Copy link', icon: Link, run: copyLink },
		{ label: 'Duplicate', icon: Copy },
		{ label: 'Move to...', icon: Folder },
		{ label: 'Delete', icon: Trash2, danger: true }
	]);
</script>

{#snippet sectionHeader(label: string, key: keyof typeof open)}
	<button
		type="button"
		class="flex w-full items-center justify-between text-[13.5px] font-semibold text-fg"
		aria-expanded={open[key]}
		onclick={() => (open[key] = !open[key])}
	>
		{label}
		<ChevronDown
			size={14}
			class="text-fg-muted transition-transform {open[key] ? '' : '-rotate-90'} {key ===
				'actions' && open[key]
				? 'rotate-180'
				: ''}"
		/>
	</button>
{/snippet}

{#snippet pageLink(target: Page, icon: typeof ArrowRight)}
	{@const Icon = icon}
	<a
		href={pageHref(target.slug)}
		class="group flex h-[29px] items-center gap-2.5 text-[12px] text-fg-soft hover:text-fg"
	>
		<Icon size={13} class="text-fg-muted group-hover:text-accent" />
		<FileText size={15} class="text-fg-muted" />
		<span class="truncate">{target.title}</span>
	</a>
{/snippet}

<aside class="flex h-full w-[358px] shrink-0 flex-col border-l border-line bg-canvas">
	<div class="flex h-11 shrink-0 items-stretch border-b border-line pr-[17px] pl-[14px]">
		{#each tabs as t (t.id)}
			<button
				type="button"
				class="relative px-[9px] text-[12.5px] transition-colors {t.id === 'links'
					? 'ml-[17px]'
					: ''} {t.id === 'activity' ? 'ml-[23px]' : ''} {tab === t.id
					? 'font-medium text-fg'
					: 'text-fg-muted hover:text-fg-soft'}"
				onclick={() => (tab = t.id)}
			>
				{t.label}
				{#if tab === t.id}
					<span class="absolute inset-x-0 -bottom-px h-[2px] bg-accent"></span>
				{/if}
			</button>
		{/each}
		<button
			type="button"
			class="ml-auto self-center text-fg-muted hover:text-fg"
			aria-label="Close panel"
			onclick={() => (workspace.infoOpen = false)}
		>
			<X size={15} />
		</button>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if tab === 'document'}
			<section class="px-[23px] pt-[23px] pb-[22px]">
				{@render sectionHeader('Properties', 'properties')}
				{#if open.properties}
					<dl
						class="mt-3 grid grid-cols-[100px_1fr] items-center gap-y-0 text-[12px] [&>dd]:text-fg-soft [&>dt]:text-fg-muted"
					>
						<dt class="h-[34px] leading-[34px]">Type</dt>
						<dd class="flex h-[34px] items-center gap-2">
							<FileText size={16} class="text-fg-muted" />
							{page.type}
						</dd>
						<dt class="h-[34px] leading-[34px]">Created</dt>
						<dd class="h-[34px] leading-[34px]">{page.created}</dd>
						<dt class="h-[36px] leading-[36px]">Modified</dt>
						<dd class="h-[36px] leading-[36px]">{page.modified}</dd>
						<dt class="h-11 leading-[44px]">Author</dt>
						<dd class="flex h-11 items-center gap-2.5 text-[13px]">
							<Avatar initials={page.author.initials} size={23} />
							{page.author.name}
						</dd>
						<dt class="h-[38px] leading-[38px]">Tags</dt>
						<dd class="flex min-h-[38px] flex-wrap items-center gap-[7px] py-1">
							{#each page.tags as tag (tag)}
								<span
									class="rounded-full border border-line bg-raised px-2.5 py-[3px] text-[12px] text-fg-soft"
								>
									{tag}
								</span>
							{/each}
							<button
								type="button"
								class="grid size-[22px] place-items-center rounded-full border border-line bg-raised text-fg-muted hover:text-fg"
								aria-label="Add tag"
							>
								<Plus size={12} />
							</button>
						</dd>
						<dt class="self-start pt-[18px]">Links</dt>
						<dd class="pt-[11px]">
							{#each outgoing as target (target.slug)}
								{@render pageLink(target, ArrowRight)}
							{:else}
								<p class="h-[29px] leading-[29px] text-fg-faint">No links</p>
							{/each}
						</dd>
					</dl>
				{/if}
			</section>

			<hr class="mx-[14px] border-line" />

			<section class="px-[23px] pt-[18px] pb-[26px]">
				{@render sectionHeader('Git', 'git')}
				{#if open.git}
					<ul class="mt-[13px] space-y-[11px] text-[13px] text-fg-soft">
						<li class="flex items-center gap-[9px]">
							{#if page.git.status === 'in-sync'}
								<span class="ml-px size-2 rounded-full bg-accent"></span>
								<span class="text-[12px] text-accent">In sync</span>
							{:else}
								<span class="ml-px size-2 rounded-full bg-amber-400"></span>
								<span class="text-[12px] text-amber-400">Uncommitted changes</span>
							{/if}
						</li>
						<li class="flex items-center gap-[15px]">
							<GitBranch size={15} class="text-fg-muted" />
							{page.git.branch}
						</li>
						<li class="flex items-center gap-[15px]">
							<GitCommitVertical size={15} class="text-fg-muted" />
							{page.git.commit}
						</li>
						<li class="flex items-center gap-[15px] text-[11px] text-fg-muted">
							<Clock size={13} class="ml-px" />
							Last sync · {page.git.lastSync}
						</li>
					</ul>
					<button
						type="button"
						class="mt-[13px] flex h-10 w-full items-center justify-between rounded-md border border-line bg-panel px-[18px] text-[13.5px] text-fg-soft transition-colors hover:border-line-strong hover:text-fg"
					>
						View changes
						<ArrowRight size={15} class="text-fg-muted" />
					</button>
				{/if}
			</section>

			<hr class="mx-[14px] border-line" />

			<section class="px-[23px] pt-[22px] pb-6">
				{@render sectionHeader('Quick Actions', 'actions')}
				{#if open.actions}
					<ul class="mt-[9px]">
						{#each actions as action (action.icon)}
							{@const Icon = action.icon}
							<li>
								<button
									type="button"
									class="flex h-[35.5px] w-full items-center gap-[15px] text-[13px] transition-colors {action.danger
										? 'text-danger hover:text-red-400'
										: 'text-fg-soft hover:text-fg'}"
									onclick={action.run}
								>
									<Icon size={16} class={action.danger ? '' : 'text-fg-muted'} />
									{action.label}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{:else if tab === 'links'}
			<section class="px-[23px] pt-[23px]">
				<h3 class="text-[13.5px] font-semibold text-fg">
					Outgoing <span class="font-normal text-fg-muted">{outgoing.length}</span>
				</h3>
				<div class="mt-2.5">
					{#each outgoing as target (target.slug)}
						{@render pageLink(target, ArrowRight)}
					{:else}
						<p class="text-[12px] text-fg-faint">This page does not link to other pages.</p>
					{/each}
				</div>
				<h3 class="mt-6 text-[13.5px] font-semibold text-fg">
					Backlinks <span class="font-normal text-fg-muted">{backlinks.length}</span>
				</h3>
				<div class="mt-2.5">
					{#each backlinks as target (target.slug)}
						{@render pageLink(target, ArrowRight)}
					{:else}
						<p class="text-[12px] text-fg-faint">No pages link here yet.</p>
					{/each}
				</div>
			</section>
		{:else}
			<ol class="relative px-[23px] pt-[23px]">
				{#each page.activity as entry, i (entry.id)}
					<li class="relative flex gap-3 pb-5">
						{#if i < page.activity.length - 1}
							<span class="absolute top-7 bottom-0 left-[11px] w-px bg-line"></span>
						{/if}
						<Avatar initials={entry.who.initials} size={23} />
						<div class="text-[12.5px] leading-5">
							<p class="text-fg-soft">
								<span class="font-medium text-fg">{entry.who.name}</span>
								{entry.action}
							</p>
							<p class="text-[11px] text-fg-muted">{entry.when}</p>
						</div>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</aside>
