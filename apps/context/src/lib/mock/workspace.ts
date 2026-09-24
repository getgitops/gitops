import { handbookPages, mockPages, researchPages, type Page } from './pages';
import { sharing, type PageAccess } from './users';

/** Folders group items; pages are always leaves and can't have children. */
export interface FolderNode {
	kind: 'folder';
	id: string;
	label: string;
	children: TreeNode[];
	open?: boolean;
}

export interface PageNode {
	kind: 'page';
	id: string;
	label: string;
	slug: string;
}

export type TreeNode = FolderNode | PageNode;

const folder = (id: string, label: string, children: TreeNode[], open = false): FolderNode => ({
	kind: 'folder',
	id,
	label,
	children,
	open
});

const doc = (id: string, label: string, slug: string): PageNode => ({
	kind: 'page',
	id,
	label,
	slug
});

const gitopsTree: TreeNode[] = [
	folder(
		'projects',
		'Projects',
		[
			folder('gitops', 'GitOps', [
				doc('gitops-overview', 'Overview', 'gitops'),
				doc('roadmap', 'Roadmap', 'roadmap')
			]),
			folder('website', 'Website', [doc('website-landing', 'Landing Page', 'website-landing')]),
			folder('game-editor', 'Game Editor', [doc('engine', 'Engine Notes', 'game-editor-engine')])
		],
		true
	),
	folder(
		'documentation',
		'Documentation',
		[
			doc('architecture', 'Architecture', 'system-architecture'),
			folder('api', 'API', [doc('api-reference', 'API Reference', 'api-reference')]),
			folder('deployments', 'Deployments', [doc('k8s', 'Kubernetes', 'deployments-kubernetes')]),
			folder('guides', 'Guides', [
				doc('getting-started', 'Getting Started', 'getting-started'),
				doc('architecture-decisions', 'Architecture Decisions', 'architecture-decisions')
			])
		],
		true
	),
	folder('notes', 'Notes', [doc('ideas', 'Ideas', 'ideas'), doc('todo', 'TODO', 'todo')], true),
	folder(
		'personal',
		'Personal',
		[
			folder('journal', 'Journal', [doc('journal-today', 'Sep 24, 2026', 'journal-2026-09-24')]),
			folder('learning', 'Learning', [doc('rust', 'Rust', 'learning-rust')])
		],
		true
	)
];

export type WorkspaceStatus = 'active' | 'archived';

/** Tint of the default logo. */
export type WorkspaceColor = 'accent' | 'sky' | 'amber';

export type RepositoryProvider = 'github' | 'gitlab' | 'bitbucket' | 'other';

/** A Git remote owned by the customer. */
export interface CustomRepository {
	provider: RepositoryProvider;
	/** HTTPS clone URL. */
	url: string;
	branch: string;
	username: string;
	/** Access token. Write-only in the UI: it's never shown back once saved. */
	token: string;
}

export interface RepositorySettings {
	/**
	 * `cloud` stores the workspace in the organization's managed repository, shared by
	 * every cloud workspace; `custom` pushes it to its own remote.
	 */
	mode: 'cloud' | 'custom';
	custom: CustomRepository | null;
}

export interface WorkspaceSettings {
	name: string;
	/** Used in URLs; can't be changed after creation. */
	slug: string;
	description: string;
	/** Object URL of a custom logo; `null` shows the default one. */
	logo: string | null;
	color: WorkspaceColor;
	status: WorkspaceStatus;
	defaultTemplate: string;
	publicLinks: boolean;
	repository: RepositorySettings;
}

export interface SyncStatus {
	state: string;
	ago: string;
	branch: string;
	pendingChanges: number;
}

export interface Favorite {
	label: string;
	slug: string;
}

/** Everything a workspace owns. Every workspace has a `home` page outside the tree. */
export interface WorkspaceSeed {
	id: string;
	settings: WorkspaceSettings;
	pages: Page[];
	tree: TreeNode[];
	/** Open tabs, by page slug. */
	tabs: string[];
	favorites: Favorite[];
	/** Sharing settings; pages not listed are private to their author. */
	access: Record<string, PageAccess>;
	sync: SyncStatus;
}

export const defaultSettings = (
	settings: Pick<WorkspaceSettings, 'name' | 'slug'> & Partial<WorkspaceSettings>
): WorkspaceSettings => ({
	description: '',
	logo: null,
	color: 'accent',
	status: 'active',
	defaultTemplate: 'default',
	publicLinks: false,
	repository: { mode: 'cloud', custom: null },
	...settings
});

export const seedWorkspaces: WorkspaceSeed[] = [
	{
		id: 'gitops',
		settings: defaultSettings({
			name: 'GitOps',
			slug: 'gitops',
			description:
				'This workspace contains all documentation, architecture and resources related to the GitOps platform.'
		}),
		pages: mockPages,
		tree: gitopsTree,
		tabs: ['home', 'system-architecture', 'roadmap', 'api-reference', 'database'],
		favorites: [
			{ label: 'Product Roadmap', slug: 'roadmap' },
			{ label: 'Architecture', slug: 'system-architecture' },
			{ label: 'API Reference', slug: 'api-reference' }
		],
		access: sharing,
		sync: { state: 'Synced', ago: '2m ago', branch: 'main', pendingChanges: 3 }
	},
	{
		id: 'handbook',
		settings: defaultSettings({
			name: 'Handbook',
			slug: 'handbook',
			description: 'How we work at Kettu: onboarding, benefits, policies and team rituals.',
			color: 'sky',
			publicLinks: true,
			repository: {
				mode: 'custom',
				custom: {
					provider: 'github',
					url: 'https://github.com/kettu/handbook.git',
					branch: 'main',
					username: 'foxkdev',
					token: 'github_pat_mock'
				}
			}
		}),
		pages: handbookPages,
		tree: [
			folder(
				'people',
				'People',
				[doc('onboarding', 'Onboarding', 'onboarding'), doc('benefits', 'Benefits', 'benefits')],
				true
			),
			folder('policies', 'Policies', [doc('coc', 'Code of Conduct', 'code-of-conduct')], true),
			doc('team-rituals', 'Team Rituals', 'team-rituals')
		],
		tabs: ['home', 'onboarding'],
		favorites: [{ label: 'Onboarding', slug: 'onboarding' }],
		access: {},
		sync: { state: 'Synced', ago: '1h ago', branch: 'main', pendingChanges: 0 }
	},
	{
		id: 'research',
		settings: defaultSettings({
			name: 'Research',
			slug: 'research',
			description: 'Experiments and prototypes from the research team.',
			color: 'amber'
		}),
		pages: researchPages,
		tree: [
			folder(
				'experiments',
				'Experiments',
				[
					doc('llm-evaluations', 'LLM Evaluations', 'llm-evaluations'),
					doc('vector-search', 'Vector Search', 'vector-search')
				],
				true
			)
		],
		tabs: ['home'],
		favorites: [],
		access: {},
		sync: { state: 'Synced', ago: '3d ago', branch: 'main', pendingChanges: 0 }
	}
];
