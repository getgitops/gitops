import type { Component } from 'svelte';
import { GitBranch, LayoutTemplate, Settings, ShieldCheck, UserCog } from '@lucide/svelte';

export interface SettingsSection {
	/** `null` is the general settings page at `/settings`. */
	id: string | null;
	label: string;
	description: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	icon: Component<any>;
	soon?: boolean;
}

export const settingsSections: SettingsSection[] = [
	{
		id: null,
		label: 'Settings',
		description: 'Manage your workspace configuration, permissions and integrations.',
		icon: Settings
	},
	{
		id: 'repository',
		label: 'Repository',
		description: 'Choose where the content of this workspace is stored and versioned with Git.',
		icon: GitBranch
	},
	{
		id: 'access',
		label: 'Access Management',
		description: 'Control who can view and edit content in this workspace.',
		icon: UserCog
	},
	{
		id: 'security',
		label: 'Security',
		description: 'Authentication, sessions and audit options for the workspace.',
		icon: ShieldCheck
	},
	{
		id: 'templates',
		label: 'Templates',
		description: 'Reusable page structures available when creating documents.',
		icon: LayoutTemplate
	},
	{
		id: 'integrations',
		label: 'Integrations',
		description: 'Connect the workspace with external tools.',
		icon: Settings,
		soon: true
	}
];
