import { CodeXml, FileText, Folder, House, SquareKanban, StickyNote } from '@lucide/svelte';
import type { Page } from '$lib/mock/pages';

export function pageIcon(page: Pick<Page, 'slug' | 'type'>) {
	if (page.slug === 'home') return House;
	switch (page.type) {
		case 'Board':
			return SquareKanban;
		case 'Reference':
			return CodeXml;
		case 'Database':
			return Folder;
		case 'Note':
			return StickyNote;
		default:
			return FileText;
	}
}
