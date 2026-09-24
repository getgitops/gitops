<script lang="ts">
	import {
		Archive,
		ArchiveRestore,
		Camera,
		Check,
		ChevronDown,
		Cog,
		Copy,
		Ellipsis,
		FileText,
		ImageOff,
		LayoutTemplate,
		Link2,
		Settings,
		Trash2,
		UsersRound
	} from '@lucide/svelte';
	import type { Component, Snippet } from 'svelte';
	import DeleteWorkspaceModal from '$lib/components/DeleteWorkspaceModal.svelte';
	import Dropdown from '$lib/components/Dropdown.svelte';
	import MenuItem from '$lib/components/MenuItem.svelte';
	import Switch from '$lib/components/Switch.svelte';
	import WorkspaceLogo from '$lib/components/WorkspaceLogo.svelte';
	import { settingsHref } from '$lib/links';
	import { templates } from '$lib/mock/templates';
	import { workspace } from '$lib/state/workspace.svelte';

	const DESCRIPTION_MAX = 500;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	type Icon = Component<any>;

	const settings = $derived(workspace.settings);
	const archived = $derived(settings.status === 'archived');
	const template = $derived(
		templates.find((t) => t.id === settings.defaultTemplate) ?? templates[0]
	);

	let logoInput = $state<HTMLInputElement>();
	let slugCopied = $state(false);
	let deleting = $state(false);

	function setLogo(url: string | null) {
		if (settings.logo) URL.revokeObjectURL(settings.logo);
		settings.logo = url;
	}

	function onlogo(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		if (file) setLogo(URL.createObjectURL(file));
		e.currentTarget.value = '';
	}

	async function copySlug() {
		await navigator.clipboard.writeText(settings.slug);
		slugCopied = true;
		setTimeout(() => (slugCopied = false), 1500);
	}

	function toggleArchived() {
		settings.status = archived ? 'active' : 'archived';
	}

	const fieldClass =
		'w-full rounded-md border-line bg-panel px-[10px] text-[12px] text-fg placeholder:text-fg-faint focus:border-accent/60 focus:ring-0';
	const labelClass = 'block text-[12.5px] leading-[18px] text-fg';
	const buttonClass =
		'flex items-center justify-center gap-2 rounded-md border bg-panel text-[10.5px] transition-colors';
</script>

<svelte:head>
	<title>Settings · Context</title>
</svelte:head>

{#snippet option(Icon: Icon, title: string, description: string, control: Snippet)}
	<div
		class="flex min-h-14 items-center gap-[17px] border-t border-line py-[10px] pr-[5px] pl-[5px]"
	>
		<Icon size={18} class="shrink-0 text-fg-soft" />
		<div class="min-w-0 flex-1">
			<p class="text-[12px] leading-[17px] text-fg">{title}</p>
			<p class="mt-[2px] text-[10px] leading-[15px] text-fg-muted">{description}</p>
		</div>
		{@render control()}
	</div>
{/snippet}

<div class="pt-[30px] pr-[26px] pb-10 pl-[31px]">
	<h1 class="text-[20px] leading-7 font-semibold tracking-[-0.01em] text-fg">Workspace Settings</h1>
	<p class="mt-[7px] text-[13.2px] leading-5 text-fg-soft">
		Manage your workspace configuration, permissions and integrations.
	</p>

	<!-- General -->
	<section class="mt-[21px] rounded-[10px] border border-line bg-panel/40">
		<header class="flex items-start pt-7 pr-[22px] pb-[21px] pl-7">
			<WorkspaceLogo {settings} size="lg" />

			<div class="-mt-0.5 ml-7 min-w-0 flex-1">
				<div class="flex h-[30px] items-center">
					<h2 class="truncate text-[24px] leading-[30px] font-semibold tracking-[-0.01em] text-fg">
						{settings.name.trim() || 'Untitled workspace'}
					</h2>
					<span
						class="ml-[29px] grid h-6 shrink-0 place-items-center rounded-full border px-4 text-[11px] font-medium {archived
							? 'border-line-strong bg-raised text-fg-muted'
							: 'border-accent/35 bg-accent/10 text-accent'}"
					>
						{archived ? 'Archived' : 'Active'}
					</span>
				</div>
				<p class="mt-1 text-[12.5px] leading-[18px] text-fg-muted">{settings.slug}</p>
				{#if settings.description.trim()}
					<p class="mt-1.5 max-w-[410px] text-[12px] leading-[18px] break-words text-fg-soft">
						{settings.description}
					</p>
				{/if}
			</div>

			<div class="-mt-px ml-6 flex shrink-0 items-center gap-2">
				<button
					type="button"
					class="{buttonClass} h-[34px] border-line px-[14px] text-[10.5px] text-fg hover:border-line-strong"
					onclick={() => logoInput?.click()}
				>
					<Camera size={14} class="text-fg-soft" />
					Change logo
				</button>
				<input
					bind:this={logoInput}
					type="file"
					accept="image/*"
					class="hidden"
					onchange={onlogo}
				/>
				<Dropdown
					label="Workspace options"
					panelClass="w-[220px]"
					triggerClass="grid size-[34px] place-items-center rounded-md border border-line bg-panel text-fg-soft transition-colors hover:border-line-strong hover:text-fg aria-expanded:border-line-strong aria-expanded:text-fg"
				>
					{#snippet trigger()}
						<Ellipsis size={16} />
					{/snippet}
					{#snippet children(close)}
						<MenuItem
							icon={ImageOff}
							label="Remove logo"
							disabled={!settings.logo}
							onclick={() => {
								setLogo(null);
								close();
							}}
						/>
						<hr class="mx-1.5 my-[5px] border-line" />
						<MenuItem
							icon={archived ? ArchiveRestore : Archive}
							label={archived ? 'Restore workspace' : 'Archive workspace'}
							onclick={() => {
								toggleArchived();
								close();
							}}
						/>
						<MenuItem
							icon={Trash2}
							label="Delete workspace"
							danger
							onclick={() => {
								close();
								deleting = true;
							}}
						/>
					{/snippet}
				</Dropdown>
			</div>
		</header>

		<div class="mr-[22px] ml-[21px] flex border-t border-line">
			<!-- Details form -->
			<div class="min-w-0 flex-1 pr-5">
				<div class="pt-[18px] pr-[5px] pl-[3px]">
					<label for="ws-name" class="{labelClass} mb-[5px]"> Workspace name </label>
					<input
						id="ws-name"
						bind:value={settings.name}
						autocomplete="off"
						placeholder="Untitled workspace"
						class="{fieldClass} h-8 py-0"
					/>

					<label for="ws-slug" class="{labelClass} mt-[17px] mb-[5px]"> Slug </label>
					<div class="relative">
						<input
							id="ws-slug"
							value={settings.slug}
							readonly
							aria-describedby="ws-slug-hint"
							class="{fieldClass} h-8 cursor-default py-0 pr-9"
						/>
						<button
							type="button"
							class="absolute top-1/2 right-[7px] grid size-6 -translate-y-1/2 place-items-center rounded text-fg-soft hover:bg-hover hover:text-fg"
							aria-label={slugCopied ? 'Slug copied' : 'Copy slug'}
							title={slugCopied ? 'Copied!' : 'Copy slug'}
							onclick={copySlug}
						>
							{#if slugCopied}
								<Check size={13} class="text-accent" />
							{:else}
								<Copy size={13} />
							{/if}
						</button>
					</div>
					<p id="ws-slug-hint" class="mt-[6px] text-[10px] leading-4 text-fg-muted">
						The slug is used in URLs and cannot be changed later.
					</p>
				</div>

				<div class="mt-[22px] border-t border-line pt-[17px] pr-[5px] pb-[27px] pl-[3px]">
					<label for="ws-description" class="{labelClass} mb-[5px]"> Description </label>
					<div class="relative">
						<textarea
							id="ws-description"
							bind:value={settings.description}
							maxlength={DESCRIPTION_MAX}
							placeholder="What is this workspace about?"
							class="{fieldClass} block h-[104px] resize-none pt-[7px] pb-6 leading-[19px]"
						></textarea>
						<span
							class="pointer-events-none absolute right-[11px] bottom-[8px] text-[10px] text-fg-muted"
						>
							{settings.description.length}/{DESCRIPTION_MAX}
						</span>
					</div>
				</div>
			</div>

			<!-- Access & status -->
			<div class="w-[375px] shrink-0 border-l border-line pl-5">
				<div class="pt-[21px] pb-[25px] pl-1">
					<p class="flex items-center gap-[11px] text-[12.5px] leading-[18px] text-fg">
						<Settings size={16} class="text-fg-soft" />
						Default access
					</p>
					<div class="ml-[27px]">
						<p class="mt-[11px] text-[13px] leading-5 font-medium text-fg">Everyone can access</p>
						<p class="mt-[5px] max-w-[250px] text-[10.5px] leading-[18px] text-fg-muted">
							All members of the workspace can view and edit content by default.
						</p>
						<a
							href={settingsHref('access')}
							class="{buttonClass} mt-[17px] h-[35px] w-fit border-line-strong px-6 text-fg hover:border-fg-faint"
						>
							<UsersRound size={14} class="text-fg-soft" />
							Change access
						</a>
					</div>
				</div>

				<div class="border-t border-line pt-[19px] pb-[27px] pl-1">
					<p class="text-[14px] leading-5 font-medium text-fg">Workspace status</p>
					<p class="mt-2 flex h-[18px] items-center gap-[11px] text-[12.5px] text-fg">
						<span
							class="size-[9px] rounded-full {archived ? 'bg-fg-muted' : 'bg-accent'}"
							aria-hidden="true"
						></span>
						{archived ? 'Archived' : 'Active'}
					</p>
					<p class="mt-1.5 text-[10.5px] leading-[18px] text-fg-muted">
						{archived
							? 'The workspace is read-only and hidden from members.'
							: 'The workspace is active and visible to members.'}
					</p>
					<div class="mt-5 grid grid-cols-2 gap-[17px]">
						<button
							type="button"
							class="{buttonClass} h-[35px] gap-[10px] border-line-strong text-fg hover:border-fg-faint"
							onclick={toggleArchived}
						>
							{#if archived}
								<ArchiveRestore size={14} class="text-fg-soft" />
								Restore workspace
							{:else}
								<Archive size={14} class="text-fg-soft" />
								Archive workspace
							{/if}
						</button>
						<button
							type="button"
							class="{buttonClass} h-[35px] gap-[10px] border-danger/20 text-danger hover:border-danger/40 hover:bg-danger/10"
							onclick={() => (deleting = true)}
						>
							<Trash2 size={14} />
							Delete workspace
						</button>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Advanced -->
	<section class="mt-[18px] rounded-[10px] border border-line bg-panel/40 pb-[5px]">
		<header class="flex gap-[15px] pt-[17px] pb-[13px] pl-[22px]">
			<Cog size={20} class="mt-[5px] shrink-0 text-fg-soft" />
			<div>
				<h2 class="text-[13.5px] leading-5 font-medium text-fg">Advanced Settings</h2>
				<p class="mt-1 text-[11px] leading-[18px] text-fg-muted">
					Additional options to customize your workspace behavior.
				</p>
			</div>
		</header>

		<div class="mr-[23px] ml-[21px]">
			{#snippet templateControl()}
				<Dropdown
					label="Default template"
					panelClass="w-[240px]"
					triggerClass="flex h-[30px] w-[157px] items-center gap-2.5 rounded-md border border-line bg-panel px-3 text-[11px] text-fg transition-colors hover:border-line-strong aria-expanded:border-accent/60"
				>
					{#snippet trigger({ open })}
						<FileText size={14} class="shrink-0 text-fg-soft" />
						<span class="min-w-0 flex-1 truncate text-left">{template.label}</span>
						<ChevronDown
							size={14}
							class="shrink-0 text-fg-muted transition-transform {open ? 'rotate-180' : ''}"
						/>
					{/snippet}
					{#snippet children(close)}
						{#each templates as t (t.id)}
							<MenuItem
								onclick={() => {
									settings.defaultTemplate = t.id;
									close();
								}}
							>
								<span class="block leading-4">{t.label}</span>
								<span class="block truncate text-[11px] leading-4 text-fg-muted">
									{t.description}
								</span>
								{#snippet trailing()}
									{#if t.id === settings.defaultTemplate}
										<Check size={14} class="shrink-0 text-accent" />
									{/if}
								{/snippet}
							</MenuItem>
						{/each}
					{/snippet}
				</Dropdown>
			{/snippet}
			{#snippet publicLinksControl()}
				<Switch
					bind:checked={settings.publicLinks}
					label="Allow public links"
					hideLabel
					size="md"
				/>
			{/snippet}

			{@render option(
				LayoutTemplate,
				'Default template',
				'Choose which template to use when creating new documents.',
				templateControl
			)}
			{@render option(
				Link2,
				'Allow public links',
				'Let members create public share links for documents and folders.',
				publicLinksControl
			)}
		</div>
	</section>
</div>

{#if deleting}
	<DeleteWorkspaceModal onclose={() => (deleting = false)} />
{/if}
