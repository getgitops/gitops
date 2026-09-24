<script lang="ts">
	import {
		Cog,
		Database,
		GitFork,
		HardDrive,
		Layers,
		Monitor,
		Server,
		Smartphone,
		Zap
	} from '@lucide/svelte';

	const services = ['Authentication', 'Documents', 'Sync', 'Collaboration'];
	const stores = [
		{
			title: 'PostgreSQL',
			subtitle: 'Metadata & Users',
			icon: Database,
			width: 186,
			accent: false
		},
		{ title: 'Redis', subtitle: 'Cache & Queue', icon: Layers, width: 151, accent: true },
		{ title: 'Object Storage', subtitle: 'Attachments', icon: HardDrive, width: 163, accent: false }
	];

	const box = 'absolute rounded-md border border-line-strong bg-panel text-fg-soft';
</script>

<!-- Coordinates mirror designs/context_ui.png (817×319 canvas). -->
<div class="overflow-x-auto rounded-md border border-line bg-panel/60">
	<div class="relative h-[317px] w-[815px] text-[10.5px] whitespace-nowrap">
		<svg
			class="pointer-events-none absolute inset-0 text-fg-faint"
			width="815"
			height="317"
			fill="none"
			stroke="currentColor"
			stroke-width="1"
			aria-hidden="true"
		>
			<defs>
				<marker
					id="arrow"
					viewBox="0 0 8 8"
					refX="7"
					refY="4"
					markerWidth="7"
					markerHeight="7"
					orient="auto-start-reverse"
				>
					<path d="M1 1 L7 4 L1 7" stroke="currentColor" stroke-width="1.2" fill="none" />
				</marker>
			</defs>
			<path d="M133 72 H165 V111 H185" marker-end="url(#arrow)" />
			<path d="M133 143 H165 V119 H185" marker-end="url(#arrow)" />
			<path d="M290 115 H301 V78 H312" marker-end="url(#arrow)" />
			<path d="M290 115 H301 V141 H312" marker-end="url(#arrow)" />
			<path d="M482 111 H498" marker-end="url(#arrow)" />
			<path d="M672 111 H696" marker-end="url(#arrow)" />
			<path d="M394 172 V214" marker-start="url(#arrow)" marker-end="url(#arrow)" />
			<path d="M564 178 V214" marker-start="url(#arrow)" marker-end="url(#arrow)" />
		</svg>

		<div class="{box} top-[48px] left-[20px] flex h-[49px] w-[113px] items-center gap-3 px-[13px]">
			<Monitor size={22} class="text-accent" />
			Web App
		</div>
		<div
			class="{box} top-[119px] left-[20px] flex h-[50px] w-[113px] items-center gap-[13px] px-[13px]"
		>
			<Smartphone size={22} class="text-accent" />
			Mobile App
		</div>

		<div
			class="{box} top-[83px] left-[186px] flex h-[64px] w-[104px] flex-col items-center justify-center gap-[7px]"
		>
			<GitFork size={18} class="rotate-180 text-fg" />
			Load Balancer
		</div>

		<div class="{box} top-[50px] left-[313px] flex h-[118px] w-[165px] flex-col">
			<div class="flex h-[65px] items-center gap-[19px] border-b border-line-strong px-4">
				<Server size={20} class="text-accent" />
				API Server
			</div>
			<div class="flex flex-1 items-center gap-[19px] px-4">
				<Zap size={20} class="text-accent" />
				WebSocket
			</div>
		</div>

		<div class="{box} top-[47px] left-[502px] h-[126px] w-[166px] px-4 pt-[15px]">
			<div class="flex items-center gap-2.5 text-fg">
				<Cog size={20} class="text-fg" />
				Application Services
			</div>
			<ul class="mt-[9px] space-y-[3px] pl-[22px] text-[10px] leading-[15.5px]">
				{#each services as service (service)}
					<li class="flex items-center gap-[7px]">
						<span class="size-[3px] rounded-full bg-fg-soft"></span>
						{service}
					</li>
				{/each}
			</ul>
		</div>

		<div
			class="{box} top-[49px] left-[700px] flex h-[126px] w-[98px] flex-col items-center pt-[18px] text-center"
		>
			<Database size={24} class="text-accent" />
			<span class="mt-[9px] text-fg">GitDB</span>
			<span class="mt-[9px] text-[10px] leading-[15px] text-fg-muted">Versioned<br />Storage</span>
		</div>

		<div
			class="absolute top-[219px] left-[203px] flex h-[72px] w-[500px] rounded-md border border-dashed border-line-strong"
		>
			{#each stores as store, i (store.title)}
				{@const Icon = store.icon}
				<div
					class="flex items-start justify-center gap-3 pt-[13px] {i > 0
						? 'my-[9px] border-l border-line-strong pt-1'
						: ''}"
					style="width: {store.width}px"
				>
					<Icon size={24} class={store.accent ? 'text-accent' : 'text-fg-soft'} />
					<div class="leading-6">
						<p class="text-fg-soft">{store.title}</p>
						<p class="text-[10px] leading-4 text-fg-muted">{store.subtitle}</p>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
