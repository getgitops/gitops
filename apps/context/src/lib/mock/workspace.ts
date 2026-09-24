export interface TreeNode {
	id: string;
	label: string;
	icon: 'folder' | 'file';
	slug?: string;
	children?: TreeNode[];
	open?: boolean;
}

export const workspaceTree: TreeNode[] = [
	{
		id: 'projects',
		label: 'Projects',
		icon: 'folder',
		open: true,
		children: [
			{ id: 'gitops', label: 'GitOps', icon: 'folder', slug: 'gitops' },
			{
				id: 'website',
				label: 'Website',
				icon: 'folder',
				children: [
					{ id: 'website-landing', label: 'Landing Page', icon: 'file', slug: 'website-landing' }
				]
			},
			{
				id: 'game-editor',
				label: 'Game Editor',
				icon: 'folder',
				children: [
					{ id: 'engine', label: 'Engine Notes', icon: 'file', slug: 'game-editor-engine' }
				]
			}
		]
	},
	{
		id: 'documentation',
		label: 'Documentation',
		icon: 'folder',
		open: true,
		children: [
			{ id: 'architecture', label: 'Architecture', icon: 'file', slug: 'system-architecture' },
			{
				id: 'api',
				label: 'API',
				icon: 'folder',
				children: [
					{ id: 'api-reference', label: 'API Reference', icon: 'file', slug: 'api-reference' }
				]
			},
			{
				id: 'deployments',
				label: 'Deployments',
				icon: 'folder',
				children: [{ id: 'k8s', label: 'Kubernetes', icon: 'file', slug: 'deployments-kubernetes' }]
			},
			{
				id: 'guides',
				label: 'Guides',
				icon: 'folder',
				children: [
					{ id: 'getting-started', label: 'Getting Started', icon: 'file', slug: 'getting-started' }
				]
			}
		]
	},
	{
		id: 'notes',
		label: 'Notes',
		icon: 'folder',
		open: true,
		children: [
			{ id: 'ideas', label: 'Ideas', icon: 'folder', slug: 'ideas' },
			{ id: 'todo', label: 'TODO', icon: 'folder', slug: 'todo' }
		]
	},
	{
		id: 'personal',
		label: 'Personal',
		icon: 'folder',
		open: true,
		children: [
			{
				id: 'journal',
				label: 'Journal',
				icon: 'folder',
				children: [
					{ id: 'journal-today', label: 'Sep 24, 2026', icon: 'file', slug: 'journal-2026-09-24' }
				]
			},
			{
				id: 'learning',
				label: 'Learning',
				icon: 'folder',
				children: [{ id: 'rust', label: 'Rust', icon: 'file', slug: 'learning-rust' }]
			}
		]
	}
];

export const favorites: { label: string; slug: string }[] = [
	{ label: 'Product Roadmap', slug: 'roadmap' },
	{ label: 'Architecture', slug: 'system-architecture' },
	{ label: 'API Reference', slug: 'api-reference' }
];

export const initialTabs: string[] = [
	'home',
	'system-architecture',
	'roadmap',
	'api-reference',
	'database'
];

export const syncStatus = {
	state: 'Synced',
	ago: '2m ago',
	branch: 'main',
	pendingChanges: 3
};
