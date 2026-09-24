import { carlos, makePage, type Page } from '$lib/mock/pages';
import { templates } from '$lib/mock/templates';
import {
	defaultSettings,
	seedWorkspaces,
	type Favorite,
	type FolderNode,
	type RepositorySettings,
	type SyncStatus,
	type TreeNode,
	type WorkspaceColor,
	type WorkspaceSeed,
	type WorkspaceSettings
} from '$lib/mock/workspace';
import {
	currentUser,
	presence,
	type Member,
	type PageAccess,
	type PresenceStatus
} from '$lib/mock/users';
import type { DropPosition } from './ui.svelte';

/** Cloud workspaces live in a shared repository, always on this branch. */
export const CLOUD_BRANCH = 'main';

export interface FolderOption {
	/** `null` is the workspace root. */
	id: string | null;
	label: string;
	path: string[];
	depth: number;
}

export interface WorkspaceData {
	id: string;
	settings: WorkspaceSettings;
	pages: Record<string, Page>;
	tree: TreeNode[];
	tabs: string[];
	favorites: Favorite[];
	access: Record<string, PageAccess>;
	sync: SyncStatus;
	/** Last page visited, where switching back or closing the settings tab goes to. */
	lastPage?: string;
}

const ROOT_LABEL = 'Workspace';
const COLORS: WorkspaceColor[] = ['accent', 'sky', 'amber'];

function slugify(value: string) {
	return (
		value
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'untitled'
	);
}

function now() {
	const d = new Date();
	const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
	return `${date} ${time}`;
}

const randomCommit = () => crypto.randomUUID().replace(/-/g, '').slice(0, 7);

function fromSeed(seed: WorkspaceSeed): WorkspaceData {
	const { pages, ...rest } = structuredClone(seed);
	return { ...rest, pages: Object.fromEntries(pages.map((page) => [page.slug, page])) };
}

/**
 * In-memory state of every workspace. Everything here is seeded from the mocks and
 * is intentionally never persisted: a reload resets all edits.
 *
 * The data accessors (`pages`, `tree`, `tabs`...) always point at the current
 * workspace, so switching workspaces swaps the whole app over.
 */
class Workspace {
	all = $state<WorkspaceData[]>(seedWorkspaces.map(fromSeed));
	currentId = $state(seedWorkspaces[0].id);
	current = $derived(this.all.find((w) => w.id === this.currentId) ?? this.all[0]);

	get pages() {
		return this.current.pages;
	}
	get tree() {
		return this.current.tree;
	}
	get tabs() {
		return this.current.tabs;
	}
	get sync() {
		return this.current.sync;
	}
	get favorites() {
		return this.current.favorites;
	}
	get access() {
		return this.current.access;
	}
	get settings() {
		return this.current.settings;
	}
	get lastPage() {
		return this.current.lastPage;
	}
	set lastPage(slug: string | undefined) {
		this.current.lastPage = slug;
	}

	sidebarOpen = $state(true);
	infoOpen = $state(true);
	workspaceOpen = $state(true);
	favoritesOpen = $state(true);

	// --- Workspaces -------------------------------------------------------------

	/** Page to open when entering a workspace: where the user left it. */
	entryPage(id: string): string {
		const ws = this.all.find((w) => w.id === id);
		const slug = ws?.lastPage ?? ws?.tabs[0];
		return slug && ws?.pages[slug] ? slug : 'home';
	}

	switchTo(id: string) {
		if (this.all.some((w) => w.id === id)) this.currentId = id;
	}

	/** Logo tint given to the next created workspace. */
	get nextColor(): WorkspaceColor {
		return COLORS[this.all.length % COLORS.length];
	}

	/** Removes a workspace, switching away from it first. The last one can't be deleted. */
	deleteWorkspace(id: string): boolean {
		const index = this.all.findIndex((w) => w.id === id);
		if (index === -1 || this.all.length <= 1) return false;
		if (id === this.currentId) this.currentId = this.all[index === 0 ? 1 : 0].id;
		this.all.splice(index, 1);
		return true;
	}

	createWorkspace(input: { name: string }): string {
		const name = input.name.trim() || 'Untitled workspace';
		const base = slugify(name);
		let slug = base;
		for (let i = 2; this.all.some((w) => w.settings.slug === slug); i++) slug = `${base}-${i}`;

		const created = now();
		const home = makePage({
			slug: 'home',
			title: 'Home',
			path: [ROOT_LABEL],
			description: `Welcome to ${name}.`,
			created,
			modified: created,
			editedAgo: 'just now',
			activity: [
				{ id: crypto.randomUUID(), who: carlos, action: 'created this page', when: 'just now' }
			],
			blocks: [{ id: crypto.randomUUID(), type: 'paragraph', html: '' }]
		});

		const id = crypto.randomUUID();
		this.all.push({
			id,
			settings: defaultSettings({ name, slug, color: this.nextColor }),
			pages: { home },
			tree: [],
			tabs: ['home'],
			favorites: [],
			access: {},
			sync: { state: 'Synced', ago: 'just now', branch: 'main', pendingChanges: 0 }
		});
		return id;
	}

	// --- Tabs & pages -----------------------------------------------------------

	openTab(slug: string) {
		if (!this.tabs.includes(slug)) this.tabs.push(slug);
	}

	/** Closes a tab and returns the slug that should become active, if any. */
	closeTab(slug: string): string | undefined {
		const index = this.tabs.indexOf(slug);
		if (index === -1) return;
		this.tabs.splice(index, 1);
		return this.tabs[Math.min(index, this.tabs.length - 1)];
	}

	markEdited(slug: string) {
		const page = this.pages[slug];
		if (!page) return;
		page.editedAgo = 'just now';
		if (page.git.status === 'in-sync') this.sync.pendingChanges++;
		page.git.status = 'modified';
	}

	// --- Favorites & sharing ---------------------------------------------------

	isFavorite(slug: string) {
		return this.favorites.some((f) => f.slug === slug);
	}

	toggleFavorite(slug: string) {
		const index = this.favorites.findIndex((f) => f.slug === slug);
		if (index >= 0) this.favorites.splice(index, 1);
		else this.favorites.push({ label: this.pages[slug]?.title || 'Untitled', slug });
	}

	/**
	 * Sharing settings of a page, created on first access (private to its author).
	 * Mutates state, so call it from event handlers or component setup, not templates.
	 */
	accessOf(slug: string): PageAccess {
		const author = this.pages[slug]?.author ?? currentUser;
		this.access[slug] ??= {
			general: 'restricted',
			members: [{ person: author, role: 'owner' } satisfies Member]
		};
		// Read back through the store so callers get the reactive proxy.
		return this.access[slug];
	}

	/** People on a page right now, starting with the current user. */
	activeUsers(slug: string): { person: typeof currentUser; status: PresenceStatus }[] {
		const self: PresenceStatus = this.pages[slug]?.editedAgo === 'just now' ? 'editing' : 'viewing';
		return [{ person: currentUser, status: self }, ...(presence[slug] ?? [])];
	}

	// --- Tree ---------------------------------------------------------------

	/** Chain of nodes from the root down to the first node matching `match`. */
	findChain(match: (node: TreeNode) => boolean, nodes = this.tree): TreeNode[] | undefined {
		for (const node of nodes) {
			if (match(node)) return [node];
			const chain = node.kind === 'folder' && this.findChain(match, node.children);
			if (chain) return [node, ...chain];
		}
	}

	findFolder(id: string): FolderNode | undefined {
		const node = this.findChain((n) => n.id === id)?.at(-1);
		return node?.kind === 'folder' ? node : undefined;
	}

	folders(): FolderOption[] {
		const out: FolderOption[] = [{ id: null, label: ROOT_LABEL, path: [ROOT_LABEL], depth: 0 }];
		const walk = (nodes: TreeNode[], parents: string[]) => {
			for (const node of nodes) {
				if (node.kind !== 'folder') continue;
				const path = [...parents, node.label];
				out.push({ id: node.id, label: node.label, path, depth: parents.length + 1 });
				walk(node.children, path);
			}
		};
		walk(this.tree, []);
		return out;
	}

	/** Folder that directly contains a node (`undefined` at the workspace root). */
	parentOf(nodeId: string): FolderNode | undefined {
		return this.findChain((n) => n.id === nodeId)?.at(-2) as FolderNode | undefined;
	}

	/** Folder that contains the tree node pointing at `slug`. */
	parentFolderOf(slug: string): FolderNode | undefined {
		const node = this.findChain((n) => n.kind === 'page' && n.slug === slug)?.at(-1);
		return node && this.parentOf(node.id);
	}

	/** Expands every ancestor of a node, shows the sidebar and scrolls the node into view. */
	reveal(nodeId: string, expand = false) {
		const chain = this.findChain((n) => n.id === nodeId);
		if (!chain) return;
		for (const node of expand ? chain : chain.slice(0, -1)) {
			if (node.kind === 'folder') node.open = true;
		}
		this.sidebarOpen = true;
		this.workspaceOpen = true;
		requestAnimationFrame(() =>
			document
				.querySelector(`[data-node-id="${nodeId}"]`)
				?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
		);
	}

	private insertNode(node: TreeNode, folderId: string | null) {
		const folder = folderId ? this.findFolder(folderId) : undefined;
		if (!folder) {
			this.tree.push(node);
			return [ROOT_LABEL];
		}
		folder.children.push(node);
		folder.open = true;
		return this.findChain((n) => n.id === folder.id)!.map((n) => n.label);
	}

	createPage(input: { title: string; folderId: string | null; templateId: string }): string {
		const title = input.title.trim() || 'Untitled';
		const base = slugify(title);
		let slug = base;
		for (let i = 2; this.pages[slug]; i++) slug = `${base}-${i}`;

		const path = this.insertNode({ kind: 'page', id: slug, label: title, slug }, input.folderId);
		const template = templates.find((t) => t.id === input.templateId) ?? templates[0];
		const created = now();

		this.pages[slug] = makePage({
			slug,
			title,
			path,
			created,
			modified: created,
			editedAgo: 'just now',
			git: {
				status: 'modified',
				branch: this.sync.branch,
				commit: randomCommit(),
				lastSync: this.sync.ago
			},
			activity: [
				{ id: crypto.randomUUID(), who: carlos, action: 'created this page', when: 'just now' }
			],
			blocks: template.blocks()
		});
		this.sync.pendingChanges++;
		return slug;
	}

	createFolder(input: { name: string; parentId: string | null }): string {
		const id = crypto.randomUUID();
		this.insertNode(
			{
				kind: 'folder',
				id,
				label: input.name.trim() || 'Untitled folder',
				children: [],
				open: true
			},
			input.parentId
		);
		this.sync.pendingChanges++;
		return id;
	}

	// --- Reorder --------------------------------------------------------------

	/** The array that holds a node and its index in it. */
	private locate(id: string, list = this.tree): { list: TreeNode[]; index: number } | undefined {
		for (const [index, node] of list.entries()) {
			if (node.id === id) return { list, index };
			const found = node.kind === 'folder' && this.locate(id, node.children);
			if (found) return found;
		}
	}

	private ancestorLabels(id: string) {
		return (this.findChain((n) => n.id === id) ?? []).slice(0, -1).map((n) => n.label);
	}

	/**
	 * A node can't be dropped on itself or inside its own subtree, and only folders
	 * accept children.
	 */
	canMove(id: string, targetId: string | null, position?: DropPosition) {
		if (targetId === null) return true;
		const chain = this.findChain((n) => n.id === targetId);
		if (!chain || chain.some((n) => n.id === id)) return false;
		return position !== 'inside' || chain.at(-1)!.kind === 'folder';
	}

	/** Moves a node next to (or into) another one. Returns whether anything changed. */
	moveNode(id: string, targetId: string | null, position: DropPosition): boolean {
		if (!this.canMove(id, targetId, position)) return false;
		const source = this.locate(id);
		if (!source) return false;
		const oldParents = this.ancestorLabels(id);
		const [node] = source.list.splice(source.index, 1);

		let list: TreeNode[];
		let index: number;
		if (targetId === null) {
			list = this.tree;
			index = list.length;
		} else if (position === 'inside') {
			const folder = this.findFolder(targetId)!;
			list = folder.children;
			index = list.length;
			folder.open = true;
		} else {
			const target = this.locate(targetId)!;
			list = target.list;
			index = target.index + (position === 'after' ? 1 : 0);
		}
		list.splice(index, 0, node);
		if (list === source.list && index === source.index) return false;

		const newParents = this.ancestorLabels(id);
		this.rebasePages(node, oldParents, newParents);
		this.sync.pendingChanges++;
		return true;
	}

	/** Rewrites the breadcrumb of every page in a moved subtree. */
	private rebasePages(node: TreeNode, from: string[], to: string[]) {
		const strip = (path: string[]) => (path[0] === ROOT_LABEL ? path.slice(1) : path);
		const walk = (n: TreeNode) => {
			if (n.kind === 'folder') return n.children.forEach(walk);
			const page = this.pages[n.slug];
			if (!page) return;
			const path = strip(page.path);
			const keepsPrefix = from.every((label, i) => path[i] === label);
			const next = [...to, ...(keepsPrefix ? path.slice(from.length) : [])];
			page.path = next.length ? next : [ROOT_LABEL];
			page.git.status = 'modified';
		};
		walk(node);
	}

	// --- Git (mock) ---------------------------------------------------------

	/** Points the workspace at another repository; the next sync pushes its history there. */
	setRepository(repository: RepositorySettings) {
		this.settings.repository = repository;
		this.sync.branch =
			repository.mode === 'custom' && repository.custom ? repository.custom.branch : CLOUD_BRANCH;
		this.sync.ago = 'just now';
		for (const page of Object.values(this.pages)) page.git.branch = this.sync.branch;
	}

	commitAll() {
		const commit = randomCommit();
		for (const page of Object.values(this.pages)) {
			if (page.git.status !== 'modified') continue;
			page.git.status = 'in-sync';
			page.git.commit = commit;
		}
		this.sync.pendingChanges = 0;
	}

	syncNow() {
		this.sync.ago = 'just now';
		for (const page of Object.values(this.pages)) page.git.lastSync = 'just now';
	}
}

export const workspace = new Workspace();
