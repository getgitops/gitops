import { mockPages, type Page } from '$lib/mock/pages';
import { initialTabs, workspaceTree, type TreeNode } from '$lib/mock/workspace';

/**
 * In-memory workspace state. Everything here is seeded from the mocks and is
 * intentionally never persisted: a reload resets all edits.
 */
class Workspace {
	pages = $state<Record<string, Page>>(
		Object.fromEntries(structuredClone(mockPages).map((page) => [page.slug, page]))
	);
	tree = $state<TreeNode[]>(structuredClone(workspaceTree));
	tabs = $state<string[]>([...initialTabs]);
	sidebarOpen = $state(true);
	infoOpen = $state(true);

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
		page.git.status = 'modified';
	}
}

export const workspace = new Workspace();
