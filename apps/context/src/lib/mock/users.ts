import { ana, carlos, type Person } from './pages';

export type ShareRole = 'owner' | 'edit' | 'view';
export type GeneralAccess = 'restricted' | 'org' | 'link';
export type PresenceStatus = 'editing' | 'viewing';

export interface Organization {
	slug: string;
	name: string;
	role: 'Owner' | 'Admin' | 'Member';
	color: string;
}

export interface Member {
	person: Person;
	role: ShareRole;
	/** Invited by email but hasn't opened the page yet. */
	pending?: boolean;
}

export interface PageAccess {
	general: GeneralAccess;
	members: Member[];
}

export const marcos: Person = {
	name: 'Marcos',
	initials: 'MR',
	email: 'marcos@kettu.dev',
	color: 'bg-sky-300'
};
export const lucia: Person = {
	name: 'Lucía',
	initials: 'LG',
	email: 'lucia@kettu.dev',
	color: 'bg-amber-300'
};
export const diego: Person = {
	name: 'Diego',
	initials: 'DP',
	email: 'diego@kettu.dev',
	color: 'bg-rose-300'
};

export const currentUser = carlos;

/** People in the organization, used for invite suggestions. */
export const directory: Person[] = [carlos, ana, marcos, lucia, diego];

export const organizations: Organization[] = [
	{ slug: 'kettu', name: 'Kettu', role: 'Owner', color: 'bg-accent' },
	{ slug: 'acme', name: 'Acme Inc', role: 'Member', color: 'bg-sky-300' },
	{ slug: 'foxkdev', name: 'foxkdev', role: 'Owner', color: 'bg-amber-300' }
];

export const unreadNotifications = 3;

/** Other people currently on each page (the current user is always added). */
export const presence: Record<string, { person: Person; status: PresenceStatus }[]> = {
	'system-architecture': [
		{ person: ana, status: 'editing' },
		{ person: marcos, status: 'viewing' }
	],
	roadmap: [{ person: lucia, status: 'viewing' }],
	'api-reference': [{ person: ana, status: 'viewing' }]
};

/** Initial sharing settings; pages not listed are private to their author. */
export const sharing: Record<string, PageAccess> = {
	'system-architecture': {
		general: 'org',
		members: [
			{ person: carlos, role: 'owner' },
			{ person: ana, role: 'edit' },
			{ person: marcos, role: 'view' }
		]
	},
	roadmap: {
		general: 'link',
		members: [
			{ person: carlos, role: 'owner' },
			{ person: lucia, role: 'edit' }
		]
	}
};
