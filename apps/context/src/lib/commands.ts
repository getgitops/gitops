import type { Component } from 'svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import {
	ArrowLeftRight,
	CircleDot,
	FileText,
	Folder,
	GitBranch,
	GitFork,
	RefreshCw,
	Search,
	Settings,
	Star
} from '@lucide/svelte';

import { ui } from '$lib/state/ui.svelte';
import { workspace } from '$lib/state/workspace.svelte';
import { switchWorkspace } from '$lib/workspaces';

export interface Shortcut {
	/** `KeyboardEvent.code`, layout independent (e.g. `KeyN`, `Digit1`, `Comma`). */
	code: string;
	shift?: boolean;
	alt?: boolean;
}

export interface Command {
	id: string;
	label: string;
	group: 'Quick actions' | 'Navigation' | 'Git' | 'Settings' | 'Workspaces';
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	icon: Component<any>;
	iconClass?: string;
	shortcut?: Shortcut;
	run: () => void;
}

export const commands: Command[] = [
	{
		id: 'new-document',
		label: 'New document',
		group: 'Quick actions',
		icon: FileText,
		shortcut: { code: 'KeyN' },
		run: () => ui.openModal({ kind: 'document' })
	},
	{
		id: 'new-folder',
		label: 'New folder',
		group: 'Quick actions',
		icon: Folder,
		shortcut: { code: 'KeyN', shift: true },
		run: () => ui.openModal({ kind: 'folder' })
	},

	{
		id: 'search',
		label: 'Search workspace',
		group: 'Quick actions',
		icon: Search,
		shortcut: { code: 'KeyP' },
		run: () => ui.openPalette('search')
	},
	{
		id: 'open-projects',
		label: 'Open projects',
		group: 'Navigation',
		icon: Folder,
		shortcut: { code: 'Digit1' },
		run: () => workspace.reveal('projects', true)
	},
	{
		id: 'open-favorites',
		label: 'Open favorites',
		group: 'Navigation',
		icon: Star,
		shortcut: { code: 'Digit2' },
		run: () => {
			workspace.sidebarOpen = true;
			workspace.favoritesOpen = true;
		}
	},
	{
		id: 'open-graph',
		label: 'Open graph',
		group: 'Navigation',
		icon: GitFork,
		iconClass: 'rotate-180',
		shortcut: { code: 'Digit3' },
		// The graph view doesn't exist yet.
		run: () => {}
	},
	{
		id: 'view-changes',
		label: 'View changes',
		group: 'Git',
		icon: GitBranch,
		shortcut: { code: 'KeyG' },
		run: () => {
			workspace.infoOpen = true;
			ui.infoTab = 'document';
		}
	},
	{
		id: 'commit',
		label: 'Commit changes',
		group: 'Git',
		icon: CircleDot,
		shortcut: { code: 'KeyG', shift: true },
		run: () => workspace.commitAll()
	},
	{
		id: 'sync',
		label: 'Sync workspace',
		group: 'Git',
		icon: RefreshCw,
		shortcut: { code: 'KeyS' },
		run: () => workspace.syncNow()
	},
	{
		id: 'settings',
		label: 'Open settings',
		group: 'Settings',
		icon: Settings,
		shortcut: { code: 'Comma' },
		run: () => goto(resolve('/(app)/settings'))
	}
];

/** One "Switch to…" command per other workspace. Only offered when searching. */
export function workspaceCommands(): Command[] {
	return workspace.all
		.filter((w) => w.id !== workspace.currentId)
		.map((w) => ({
			id: `workspace:${w.id}`,
			label: `Switch to ${w.settings.name.trim() || 'Untitled workspace'}`,
			group: 'Workspaces',
			icon: ArrowLeftRight,
			run: () => switchWorkspace(w.id)
		}));
}

const codeLabel = (code: string) =>
	code === 'Comma' ? ',' : code.replace(/^Key|^Digit/, '').toUpperCase();

export function shortcutKeys(shortcut?: Shortcut): string[] {
	if (!shortcut) return [];
	return [
		'⌘',
		...(shortcut.shift ? ['⇧'] : []),
		...(shortcut.alt ? ['⌥'] : []),
		codeLabel(shortcut.code)
	];
}

export function matchesShortcut(e: KeyboardEvent, shortcut?: Shortcut) {
	return (
		!!shortcut &&
		(e.metaKey || e.ctrlKey) &&
		e.code === shortcut.code &&
		e.shiftKey === !!shortcut.shift &&
		e.altKey === !!shortcut.alt
	);
}

export function findCommand(e: KeyboardEvent) {
	return commands.find((c) => matchesShortcut(e, c.shortcut));
}
