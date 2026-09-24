export type PaletteMode = 'commands' | 'search';
export type InfoTab = 'document' | 'links' | 'activity';

export type CreateModal =
	| { kind: 'document'; folderId?: string | null; templateId?: string }
	| { kind: 'folder'; parentId?: string | null }
	| { kind: 'share'; slug: string }
	| { kind: 'workspace' };

export type DropPosition = 'before' | 'after' | 'inside';

export interface TreeDrag {
	/** Node being dragged. */
	id: string;
	/** Current drop target. `id: null` means the end of the workspace root. */
	target: { id: string | null; position: DropPosition } | null;
}

export interface MenuContext {
	/** Folder where new items are created. `null` is the workspace root. */
	folderId: string | null;
	/** Tree node that was right-clicked, highlighted while the menu is open. */
	nodeId?: string;
}

/** Transient UI state: overlays, menus and panel tabs. */
class UI {
	palette = $state({ open: false, mode: 'commands' as PaletteMode, query: '' });
	menu = $state<({ x: number; y: number } & Partial<MenuContext>) | null>(null);
	modal = $state<CreateModal | null>(null);
	infoTab = $state<InfoTab>('document');
	treeDrag = $state<TreeDrag | null>(null);

	openPalette(mode: PaletteMode = 'commands') {
		this.menu = null;
		this.palette.mode = mode;
		this.palette.query = '';
		this.palette.open = true;
	}

	togglePalette() {
		if (this.palette.open) this.closePalette();
		else this.openPalette();
	}

	closePalette() {
		this.palette.open = false;
	}

	/** Without a context, the create modals default to the current page's folder. */
	openMenu(x: number, y: number, context?: MenuContext) {
		this.palette.open = false;
		this.menu = { x, y, ...context };
	}

	closeMenu() {
		this.menu = null;
	}

	openModal(modal: CreateModal) {
		this.palette.open = false;
		this.menu = null;
		this.modal = modal;
	}

	closeModal() {
		this.modal = null;
	}
}

export const ui = new UI();
