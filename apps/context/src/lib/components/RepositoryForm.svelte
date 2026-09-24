<script lang="ts">
	import {
		Check,
		CircleAlert,
		Cloud,
		Eye,
		EyeOff,
		GitBranch,
		HardDrive,
		KeyRound,
		LoaderCircle,
		Plug,
		TriangleAlert
	} from '@lucide/svelte';
	import GitProviderIcon from '$lib/components/GitProviderIcon.svelte';
	import type { RepositoryProvider, RepositorySettings } from '$lib/mock/workspace';
	import { session } from '$lib/state/session.svelte';
	import { CLOUD_BRANCH, workspace } from '$lib/state/workspace.svelte';

	type Mode = RepositorySettings['mode'];
	type TestResult = { key: string; state: 'testing' | 'ok' | 'error'; message: string };

	const providers: {
		id: RepositoryProvider;
		label: string;
		host: string | null;
		placeholder: string;
		tokenHint: string;
	}[] = [
		{
			id: 'github',
			label: 'GitHub',
			host: 'github.com',
			placeholder: 'https://github.com/acme/handbook.git',
			tokenHint: 'Fine-grained personal access token with Contents: read and write.'
		},
		{
			id: 'gitlab',
			label: 'GitLab',
			host: 'gitlab.com',
			placeholder: 'https://gitlab.com/acme/handbook.git',
			tokenHint: 'Personal or project access token with write_repository scope.'
		},
		{
			id: 'bitbucket',
			label: 'Bitbucket',
			host: 'bitbucket.org',
			placeholder: 'https://bitbucket.org/acme/handbook.git',
			tokenHint: 'Access token or API token with repository read and write permissions.'
		},
		{
			id: 'other',
			label: 'Other',
			host: null,
			placeholder: 'https://git.example.com/acme/handbook.git',
			tokenHint: 'Password or token with push access over HTTPS.'
		}
	];

	const saved = $derived(workspace.settings.repository);

	// Draft: nothing touches the workspace until "Save changes". The token is write-only,
	// so the field always starts empty and an empty value keeps the saved one.
	const initial = workspace.settings.repository;
	let mode = $state<Mode>(initial.mode);
	let provider = $state<RepositoryProvider>(initial.custom?.provider ?? 'github');
	let url = $state(initial.custom?.url ?? '');
	let branch = $state(initial.custom?.branch ?? CLOUD_BRANCH);
	let username = $state(initial.custom?.username ?? '');
	let token = $state('');

	let showToken = $state(false);
	let submitted = $state(false);
	let touched = $state({ url: false, branch: false, token: false });
	let test = $state<TestResult | null>(null);
	let savedFlash = $state(false);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;

	const current = $derived(providers.find((p) => p.id === provider)!);
	const savedCustom = $derived(saved.mode === 'custom' ? saved.custom : null);
	const hasSavedToken = $derived(!!savedCustom?.token);

	const parsedUrl = $derived.by(() => {
		try {
			return new URL(url.trim());
		} catch {
			return null;
		}
	});

	const urlError = $derived.by(() => {
		if (!url.trim()) return 'Enter the repository URL.';
		if (!parsedUrl || !parsedUrl.hostname) return 'Enter a valid URL.';
		if (parsedUrl.protocol !== 'https:') return 'Use the HTTPS clone URL (https://…).';
		if (parsedUrl.pathname.replace(/\/+$/, '').length < 2) return 'Include the repository path.';
		return null;
	});

	const branchError = $derived.by(() => {
		const b = branch.trim();
		if (!b) return 'Enter a branch.';
		if (/[\s~^:?*[\\]|\.\.|\/\/|^\/|\/$|\.lock$|^-/.test(b)) return 'Not a valid branch name.';
		return null;
	});

	const tokenError = $derived(!token && !hasSavedToken ? 'Enter an access token.' : null);

	/** Self-hosted GitHub/GitLab/Bitbucket exist, so a different host only warns. */
	const hostMismatch = $derived(
		!urlError && current.host && parsedUrl && parsedUrl.hostname !== current.host
			? current.host
			: null
	);

	const valid = $derived(mode === 'cloud' || (!urlError && !branchError && !tokenError));

	const dirty = $derived(
		mode !== saved.mode ||
			(mode === 'custom' &&
				(!savedCustom ||
					provider !== savedCustom.provider ||
					url.trim() !== savedCustom.url ||
					branch.trim() !== savedCustom.branch ||
					username.trim() !== savedCustom.username ||
					token !== ''))
	);

	/** Where the content ends up changes: history gets pushed to the new place. */
	const moving = $derived(
		saved.mode !== mode || (mode === 'custom' && !!savedCustom && url.trim() !== savedCustom.url)
	);

	// A test result only applies to the exact fields it was run with.
	const testKey = $derived(JSON.stringify([provider, url.trim(), branch.trim(), username, token]));
	const testState = $derived(test && test.key === testKey ? test : null);
	const canTest = $derived(!urlError && !branchError && !tokenError);

	const show = (field: keyof typeof touched) => submitted || touched[field];

	function matchProvider() {
		const host = parsedUrl?.hostname;
		const match = providers.find((p) => p.host && p.host === host);
		if (match) provider = match.id;
	}

	async function testConnection() {
		const key = testKey;
		test = { key, state: 'testing', message: 'Testing connection…' };
		await new Promise((r) => setTimeout(r, 900));
		if (test?.key !== key) return;
		// Mock: hosted providers need `owner/repo`; anything shorter is "not found".
		const segments = parsedUrl!.pathname.split('/').filter(Boolean).length;
		test =
			provider !== 'other' && segments < 2
				? {
						key,
						state: 'error',
						message: 'Repository not found. Check the URL and that the token can access it.'
					}
				: { key, state: 'ok', message: `Connected · branch ${branch.trim()} is reachable.` };
	}

	function reset() {
		mode = saved.mode;
		provider = savedCustom?.provider ?? 'github';
		url = savedCustom?.url ?? '';
		branch = savedCustom?.branch ?? CLOUD_BRANCH;
		username = savedCustom?.username ?? '';
		token = '';
		showToken = false;
		submitted = false;
		touched = { url: false, branch: false, token: false };
		test = null;
	}

	function save(e: SubmitEvent) {
		e.preventDefault();
		submitted = true;
		if (!dirty || !valid) return;

		workspace.setRepository(
			mode === 'cloud'
				? { mode: 'cloud', custom: null }
				: {
						mode: 'custom',
						custom: {
							provider,
							url: url.trim(),
							branch: branch.trim(),
							username: username.trim(),
							token: token || savedCustom?.token || ''
						}
					}
		);
		reset();

		savedFlash = true;
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (savedFlash = false), 2000);
	}

	const fieldClass =
		'w-full rounded-md border-line bg-panel px-[10px] text-[12px] text-fg placeholder:text-fg-faint focus:border-accent/60 focus:ring-0';
	const errorFieldClass = 'border-danger/50 focus:border-danger/70';
	const labelClass = 'block text-[12.5px] leading-[18px] text-fg';
	const hintClass = 'mt-[6px] text-[10px] leading-4';
	const errorClass = 'mt-[6px] flex items-center gap-1.5 text-[10px] leading-4 text-danger';
	const buttonClass =
		'flex items-center justify-center gap-2 rounded-md border text-[10.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-50';
</script>

{#snippet storageOption(value: Mode, title: string, description: string)}
	{@const checked = mode === value}
	<label
		class="relative flex cursor-pointer items-start gap-[14px] rounded-lg border p-4 pr-10 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 {checked
			? 'border-accent/45 bg-accent/[0.04]'
			: 'border-line hover:border-line-strong'}"
	>
		<input type="radio" name="repo-mode" {value} bind:group={mode} class="sr-only" />
		<span
			class="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-panel {checked
				? 'text-accent'
				: 'text-fg-soft'}"
		>
			{#if value === 'cloud'}
				<Cloud size={17} />
			{:else}
				<GitBranch size={17} />
			{/if}
		</span>
		<span class="min-w-0">
			<span class="flex items-center gap-2 text-[13px] leading-5 font-medium text-fg">
				{title}
				{#if value === 'cloud'}
					<span
						class="grid h-[18px] place-items-center rounded bg-raised px-1.5 text-[10px] font-normal text-fg-soft"
					>
						Default
					</span>
				{/if}
			</span>
			<span class="mt-1 block text-[11px] leading-[17px] text-fg-muted">{description}</span>
		</span>
		<span
			class="absolute top-4 right-4 grid size-4 place-items-center rounded-full border {checked
				? 'border-accent'
				: 'border-line-strong'}"
			aria-hidden="true"
		>
			{#if checked}
				<span class="size-2 rounded-full bg-accent"></span>
			{/if}
		</span>
	</label>
{/snippet}

{#snippet cardHeader(title: string, description: string, icon: 'storage' | 'cloud' | 'custom')}
	<header class="flex items-start gap-[15px] pt-[17px] pr-[22px] pb-[13px] pl-[22px]">
		{#if icon === 'storage'}
			<HardDrive size={20} class="mt-[5px] shrink-0 text-fg-soft" />
		{:else if icon === 'cloud'}
			<Cloud size={20} class="mt-[5px] shrink-0 text-fg-soft" />
		{:else}
			<Plug size={20} class="mt-[5px] shrink-0 text-fg-soft" />
		{/if}
		<div class="min-w-0 flex-1">
			<h2 class="text-[13.5px] leading-5 font-medium text-fg">{title}</h2>
			<p class="mt-1 text-[11px] leading-[18px] text-fg-muted">{description}</p>
		</div>
		{#if icon === 'custom' && savedCustom && !dirty}
			<span
				class="mt-1 flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-accent/35 bg-accent/10 px-3 text-[11px] font-medium text-accent"
			>
				<span class="size-1.5 rounded-full bg-accent" aria-hidden="true"></span>
				Connected
			</span>
		{/if}
	</header>
{/snippet}

{#snippet row(label: string, value: string, note?: string)}
	<div class="flex min-h-11 items-center gap-4 border-t border-line py-[9px] pr-[5px] pl-[5px]">
		<span class="w-[150px] shrink-0 text-[12px] text-fg-muted">{label}</span>
		<span class="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">{value}</span>
		{#if note}
			<span class="shrink-0 text-[10.5px] text-fg-muted">{note}</span>
		{/if}
	</div>
{/snippet}

<form class="mt-[21px]" onsubmit={save} novalidate>
	<!-- Storage -->
	<section class="rounded-[10px] border border-line bg-panel/40">
		{@render cardHeader(
			'Storage',
			'Where Context commits the pages, folders and history of this workspace.',
			'storage'
		)}
		<fieldset class="mr-[23px] ml-[21px] grid grid-cols-2 gap-3 border-t border-line pt-4 pb-5">
			<legend class="sr-only">Storage</legend>
			{@render storageOption(
				'cloud',
				'Context Cloud',
				`All cloud workspaces of ${session.org.name} share one repository, each in its own folder.`
			)}
			{@render storageOption(
				'custom',
				'Custom repository',
				'GitHub, GitLab, Bitbucket or any Git server.'
			)}
		</fieldset>
	</section>

	{#if mode === 'cloud'}
		<section class="mt-[18px] rounded-[10px] border border-line bg-panel/40 pb-[5px]">
			{@render cardHeader(
				'Context Cloud',
				'Managed by Context. Hosting, backups and sync are handled for you.',
				'cloud'
			)}
			<div class="mr-[23px] ml-[21px]">
				{@render row('Repository', `${session.org.slug}/context`, 'Managed by Context')}
				{@render row('Folder', `workspaces/${workspace.settings.slug}/`)}
				{@render row('Branch', CLOUD_BRANCH)}
				<div
					class="flex min-h-11 items-center gap-4 border-t border-line py-[9px] pr-[5px] pl-[5px]"
				>
					<span class="w-[150px] shrink-0 text-[12px] text-fg-muted">Status</span>
					{#if saved.mode === 'cloud'}
						<span class="flex items-center gap-2 text-[12px] text-fg">
							<span class="size-[7px] rounded-full bg-accent" aria-hidden="true"></span>
							{workspace.sync.state}
							<span class="text-fg-muted">· {workspace.sync.ago}</span>
						</span>
					{:else}
						<span class="text-[12px] text-fg-muted">Starts syncing after you save</span>
					{/if}
				</div>
			</div>
		</section>
	{:else}
		<section class="mt-[18px] rounded-[10px] border border-line bg-panel/40">
			{@render cardHeader(
				'Connection',
				'Context clones, pulls and pushes over HTTPS with the credentials below.',
				'custom'
			)}

			<div class="mr-[23px] ml-[21px] border-t border-line pt-[18px] pr-[5px] pb-6 pl-[3px]">
				<fieldset>
					<legend class="{labelClass} mb-[7px]">Provider</legend>
					<div class="grid grid-cols-4 gap-2">
						{#each providers as p (p.id)}
							{@const checked = provider === p.id}
							<label
								class="flex h-[34px] cursor-pointer items-center justify-center gap-2 rounded-md border text-[11.5px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 {checked
									? 'border-accent/45 bg-accent/[0.06] text-fg'
									: 'border-line bg-panel text-fg-soft hover:border-line-strong hover:text-fg'}"
							>
								<input
									type="radio"
									name="repo-provider"
									value={p.id}
									bind:group={provider}
									class="sr-only"
								/>
								<GitProviderIcon provider={p.id} size={14} />
								{p.label}
							</label>
						{/each}
					</div>
				</fieldset>

				<label for="repo-url" class="{labelClass} mt-[17px] mb-[5px]">Repository URL</label>
				<input
					id="repo-url"
					type="url"
					bind:value={url}
					oninput={matchProvider}
					onblur={() => (touched.url = true)}
					placeholder={current.placeholder}
					autocomplete="off"
					spellcheck="false"
					aria-invalid={show('url') && !!urlError}
					aria-describedby="repo-url-hint"
					class="{fieldClass} h-8 py-0 font-mono {show('url') && urlError ? errorFieldClass : ''}"
				/>
				{#if show('url') && urlError}
					<p id="repo-url-hint" class={errorClass}><CircleAlert size={11} />{urlError}</p>
				{:else if hostMismatch}
					<p id="repo-url-hint" class="{hintClass} flex items-center gap-1.5 text-amber-300">
						<TriangleAlert size={11} />
						This URL isn't on {hostMismatch}. That's fine for self-hosted or enterprise instances.
					</p>
				{:else}
					<p id="repo-url-hint" class="{hintClass} text-fg-muted">
						HTTPS clone URL. The repository can be empty; Context creates the structure on first
						sync.
					</p>
				{/if}

				<div class="mt-[17px] grid grid-cols-2 gap-4">
					<div>
						<label for="repo-branch" class="{labelClass} mb-[5px]">Branch</label>
						<div class="relative">
							<GitBranch
								size={13}
								class="pointer-events-none absolute top-1/2 left-[10px] -translate-y-1/2 text-fg-muted"
							/>
							<input
								id="repo-branch"
								bind:value={branch}
								onblur={() => (touched.branch = true)}
								placeholder="main"
								autocomplete="off"
								spellcheck="false"
								aria-invalid={show('branch') && !!branchError}
								class="{fieldClass} h-8 py-0 pl-[29px] font-mono {show('branch') && branchError
									? errorFieldClass
									: ''}"
							/>
						</div>
						{#if show('branch') && branchError}
							<p class={errorClass}><CircleAlert size={11} />{branchError}</p>
						{/if}
					</div>
					<div>
						<label for="repo-username" class="{labelClass} mb-[5px]">
							Username <span class="text-fg-muted">(optional)</span>
						</label>
						<input
							id="repo-username"
							bind:value={username}
							placeholder={provider === 'bitbucket' ? 'Bitbucket username or email' : 'git'}
							autocomplete="off"
							spellcheck="false"
							class="{fieldClass} h-8 py-0"
						/>
					</div>
				</div>

				<label for="repo-token" class="{labelClass} mt-[17px] mb-[5px]">Access token</label>
				<div class="relative">
					<KeyRound
						size={13}
						class="pointer-events-none absolute top-1/2 left-[10px] -translate-y-1/2 text-fg-muted"
					/>
					<input
						id="repo-token"
						type={showToken ? 'text' : 'password'}
						bind:value={token}
						onblur={() => (touched.token = true)}
						placeholder={hasSavedToken ? 'Saved token · leave empty to keep it' : 'Paste a token'}
						autocomplete="new-password"
						spellcheck="false"
						aria-invalid={show('token') && !!tokenError}
						aria-describedby="repo-token-hint"
						class="{fieldClass} h-8 py-0 pr-9 pl-[29px] font-mono {show('token') && tokenError
							? errorFieldClass
							: ''}"
					/>
					<button
						type="button"
						class="absolute top-1/2 right-[7px] grid size-6 -translate-y-1/2 place-items-center rounded text-fg-soft hover:bg-hover hover:text-fg"
						aria-label={showToken ? 'Hide token' : 'Show token'}
						aria-pressed={showToken}
						onclick={() => (showToken = !showToken)}
					>
						{#if showToken}
							<EyeOff size={13} />
						{:else}
							<Eye size={13} />
						{/if}
					</button>
				</div>
				{#if show('token') && tokenError}
					<p id="repo-token-hint" class={errorClass}><CircleAlert size={11} />{tokenError}</p>
				{:else}
					<p id="repo-token-hint" class="{hintClass} text-fg-muted">
						{current.tokenHint} Stored encrypted and never shown again.
					</p>
				{/if}

				<div class="mt-5 flex items-center gap-3">
					<button
						type="button"
						class="{buttonClass} h-[34px] border-line-strong bg-panel px-[14px] text-fg hover:border-fg-faint"
						disabled={!canTest || testState?.state === 'testing'}
						onclick={testConnection}
					>
						{#if testState?.state === 'testing'}
							<LoaderCircle size={14} class="animate-spin text-fg-soft" />
						{:else}
							<Plug size={14} class="text-fg-soft" />
						{/if}
						Test connection
					</button>
					<p class="text-[11px] leading-4" role="status">
						{#if testState?.state === 'ok'}
							<span class="flex items-center gap-1.5 text-accent">
								<Check size={13} />{testState.message}
							</span>
						{:else if testState?.state === 'error'}
							<span class="flex items-center gap-1.5 text-danger">
								<CircleAlert size={13} />{testState.message}
							</span>
						{:else if testState?.state === 'testing'}
							<span class="text-fg-muted">{testState.message}</span>
						{/if}
					</p>
				</div>
			</div>
		</section>
	{/if}

	{#if dirty && moving}
		<div
			class="mt-[18px] flex items-start gap-3 rounded-[10px] border border-amber-300/25 bg-amber-300/[0.05] px-[18px] py-[13px]"
		>
			<TriangleAlert size={16} class="mt-px shrink-0 text-amber-300" />
			<p class="text-[11.5px] leading-[18px] text-fg-soft">
				{#if mode === 'cloud'}
					On the next sync the full history is copied to
					<span class="font-mono text-fg">workspaces/{workspace.settings.slug}/</span> in Context Cloud.
					The current repository is left untouched.
				{:else}
					On the next sync the full history is pushed to the new repository. Nothing is deleted from
					the current one.
				{/if}
			</p>
		</div>
	{/if}

	<div class="mt-[18px] flex items-center justify-end gap-2">
		{#if savedFlash}
			<span class="mr-2 flex items-center gap-1.5 text-[11px] text-accent" role="status">
				<Check size={13} /> Saved
			</span>
		{/if}
		<button
			type="button"
			class="{buttonClass} h-[34px] border-line bg-panel px-[14px] text-fg hover:border-line-strong"
			disabled={!dirty}
			onclick={reset}
		>
			Discard
		</button>
		<button
			type="submit"
			class="{buttonClass} h-[34px] border-accent bg-accent px-[14px] font-medium text-accent-ink enabled:hover:bg-accent-strong"
			disabled={!dirty || !valid}
		>
			Save changes
		</button>
	</div>
</form>
