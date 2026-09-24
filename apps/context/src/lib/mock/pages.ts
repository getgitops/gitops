export type PageType = 'Document' | 'Board' | 'Reference' | 'Database' | 'Note';

export type Block =
	| { id: string; type: 'heading'; html: string }
	| { id: string; type: 'paragraph'; html: string }
	| { id: string; type: 'numbered'; items: { id: string; html: string }[] }
	| { id: string; type: 'diagram'; diagram: 'architecture' };

export interface Person {
	name: string;
	initials: string;
}

export interface ActivityEntry {
	id: string;
	who: Person;
	action: string;
	when: string;
}

export interface Page {
	slug: string;
	title: string;
	description: string;
	type: PageType;
	/** Breadcrumb folders; the last one is rendered with a dropdown chevron. */
	path: string[];
	tags: string[];
	author: Person;
	created: string;
	modified: string;
	editedAgo: string;
	/** Outgoing links to other page slugs. */
	links: string[];
	git: {
		status: 'in-sync' | 'modified';
		branch: string;
		commit: string;
		lastSync: string;
	};
	activity: ActivityEntry[];
	blocks: Block[];
}

export const carlos: Person = { name: 'Carlos', initials: 'CL' };
export const ana: Person = { name: 'Ana', initials: 'AM' };

const defaultGit: Page['git'] = {
	status: 'in-sync',
	branch: 'main',
	commit: '8c31a2f',
	lastSync: '2m ago'
};

let uid = 0;
const id = () => `b${++uid}`;

const h = (html: string): Block => ({ id: id(), type: 'heading', html });
const p = (html: string): Block => ({ id: id(), type: 'paragraph', html });
const ol = (...items: string[]): Block => ({
	id: id(),
	type: 'numbered',
	items: items.map((html) => ({ id: id(), html }))
});

function page(data: Partial<Page> & Pick<Page, 'slug' | 'title' | 'path'>): Page {
	return {
		description: '',
		type: 'Document',
		tags: [],
		author: carlos,
		created: 'Sep 20, 2026 10:05',
		modified: 'Sep 24, 2026 18:30',
		editedAgo: '1h ago',
		links: [],
		git: { ...defaultGit },
		activity: [
			{ id: id(), who: carlos, action: 'edited this page', when: '1h ago' },
			{ id: id(), who: carlos, action: 'created this page', when: '4 days ago' }
		],
		blocks: [],
		...data
	};
}

export const mockPages: Page[] = [
	page({
		slug: 'home',
		title: 'Home',
		path: ['Workspace'],
		description: 'Welcome back, Carlos. Here is what is happening across your workspace.',
		tags: ['workspace'],
		links: ['system-architecture', 'roadmap', 'api-reference'],
		blocks: [
			h('Recently edited'),
			ol(
				'<b>System Architecture</b> – Updated the architecture diagram and key components.',
				'<b>Product Roadmap</b> – Added Q4 milestones for the editor.',
				'<b>API Reference</b> – Documented the new sync endpoints.'
			),
			h('Getting started'),
			p(
				'Use <b>⌘K</b> to jump to any page, link pages with <code>[[double brackets]]</code> and every change is versioned with git.'
			)
		]
	}),
	page({
		slug: 'system-architecture',
		title: 'System Architecture',
		path: ['Documentation', 'Architecture'],
		description:
			'This document describes the overall architecture of the <i>Context platform, including</i> its main components, data flow and infrastructure.',
		tags: ['architecture', 'backend', 'infrastructure'],
		created: 'Sep 24, 2026 14:32',
		modified: 'Sep 24, 2026 19:42',
		editedAgo: '2m ago',
		links: ['gitdb', 'api-reference', 'database', 'roadmap'],
		activity: [
			{ id: id(), who: carlos, action: 'edited Key Components', when: '2m ago' },
			{ id: id(), who: ana, action: 'commented on Architecture Diagram', when: '1h ago' },
			{ id: id(), who: carlos, action: 'added tag infrastructure', when: '3h ago' },
			{ id: id(), who: carlos, action: 'created this page', when: '5h ago' }
		],
		blocks: [
			h('Overview'),
			p(
				'Context is built as a modern, Git-powered knowledge platform. It combines the best of markdown, Notion-style productivity and Obsidian-style linking, with version control and collaboration at its core.'
			),
			h('Architecture Diagram'),
			{ id: id(), type: 'diagram', diagram: 'architecture' },
			h('Key Components'),
			ol(
				'<b>Frontend</b> – Built with SvelteKit, optimized for performance and a seamless editing experience.',
				'<b>API Server</b> – Handles business logic, authentication and real-time communication.',
				'<b>GitDB</b> – Stores all content as versioned git repositories.',
				'<b>PostgreSQL</b> – Manages metadata, users and relationships.',
				'<b>Redis</b> – Caching and background jobs.',
				'<b>Object Storage</b> – Stores attachments and media files.'
			)
		]
	}),
	page({
		slug: 'roadmap',
		title: 'Roadmap',
		type: 'Board',
		path: ['Projects', 'GitOps'],
		description: 'What we are building next for Context, grouped by quarter.',
		tags: ['roadmap', 'product'],
		links: ['system-architecture'],
		editedAgo: '20m ago',
		blocks: [
			h('Q4 2026'),
			ol(
				'<b>Realtime collaboration</b> – Multiplayer cursors and presence.',
				'<b>Graph view</b> – Explore how pages link to each other.',
				'<b>Offline mode</b> – Edit without connection and sync later.'
			),
			h('Q1 2027'),
			p('Public API, plugins and self-hosted GitDB clusters.')
		]
	}),
	page({
		slug: 'api-reference',
		title: 'API Reference',
		type: 'Reference',
		path: ['Documentation', 'API'],
		description: 'REST and WebSocket endpoints exposed by the Context API Server.',
		tags: ['api', 'backend'],
		links: ['system-architecture', 'gitdb'],
		blocks: [
			h('Authentication'),
			p('All requests require a bearer token in the <code>Authorization</code> header.'),
			h('Endpoints'),
			ol(
				'<b>GET /pages/:slug</b> – Returns a page and its metadata.',
				'<b>PUT /pages/:slug</b> – Updates the content of a page.',
				'<b>POST /sync</b> – Pushes local changes to GitDB.'
			)
		]
	}),
	page({
		slug: 'database',
		title: 'Database',
		type: 'Database',
		path: ['Documentation', 'Architecture'],
		description: 'Schema and conventions for the PostgreSQL metadata store.',
		tags: ['database', 'backend'],
		links: ['system-architecture'],
		blocks: [
			h('Tables'),
			ol(
				'<b>users</b> – Accounts, profiles and preferences.',
				'<b>pages</b> – Page metadata, pointing to a GitDB path.',
				'<b>links</b> – Directed edges between pages.'
			)
		]
	}),
	page({
		slug: 'gitdb',
		title: 'GitDB',
		path: ['Documentation', 'Architecture'],
		description: 'Versioned storage engine that keeps every page as a git repository.',
		tags: ['gitdb', 'storage'],
		links: ['system-architecture', 'database'],
		blocks: [
			h('How it works'),
			p(
				'Each workspace maps to a bare repository. Every save produces a commit on the current branch.'
			)
		]
	}),
	page({
		slug: 'gitops',
		title: 'GitOps',
		path: ['Projects'],
		description: 'Declarative deployments driven by git.',
		tags: ['project'],
		blocks: [h('Goals'), p('Ship every environment from a single source of truth.')]
	}),
	page({
		slug: 'website-landing',
		title: 'Landing Page',
		path: ['Projects', 'Website'],
		description: 'Copy and structure for the marketing site.',
		blocks: [h('Hero'), p('Your knowledge, versioned.')]
	}),
	page({
		slug: 'game-editor-engine',
		title: 'Engine Notes',
		path: ['Projects', 'Game Editor'],
		description: 'Notes about the rendering engine for the game editor.',
		blocks: [h('Renderer'), p('WebGPU first, WebGL2 fallback.')]
	}),
	page({
		slug: 'deployments-kubernetes',
		title: 'Kubernetes',
		path: ['Documentation', 'Deployments'],
		description: 'How Context is deployed on Kubernetes.',
		tags: ['infrastructure'],
		blocks: [h('Clusters'), p('Production runs on three nodes behind the Load Balancer.')]
	}),
	page({
		slug: 'getting-started',
		title: 'Getting Started',
		path: ['Documentation', 'Guides'],
		description: 'Set up a local development environment in five minutes.',
		blocks: [h('Requirements'), ol('Bun 1.2+', 'Docker', 'A GitHub account')]
	}),
	page({
		slug: 'ideas',
		title: 'Ideas',
		type: 'Note',
		path: ['Notes'],
		description: 'Loose ideas worth exploring.',
		blocks: [ol('Daily notes template', 'Backlinks preview on hover', 'AI summaries per folder')]
	}),
	page({
		slug: 'todo',
		title: 'TODO',
		type: 'Note',
		path: ['Notes'],
		description: 'Things to do this week.',
		blocks: [ol('Review sync PR', 'Write GitDB docs', 'Plan Q4 roadmap')]
	}),
	page({
		slug: 'journal-2026-09-24',
		title: 'Sep 24, 2026',
		type: 'Note',
		path: ['Personal', 'Journal'],
		description: 'Daily journal.',
		blocks: [p('Finished the first version of the Context UI.')]
	}),
	page({
		slug: 'learning-rust',
		title: 'Rust',
		type: 'Note',
		path: ['Personal', 'Learning'],
		description: 'Notes while learning Rust.',
		blocks: [
			h('Ownership'),
			p('Each value has a single owner; borrowing is checked at compile time.')
		]
	})
];
