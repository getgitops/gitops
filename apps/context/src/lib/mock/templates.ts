import type { Block } from './pages';

export interface Template {
	id: string;
	label: string;
	description: string;
	blocks: () => Block[];
}

const uid = () => crypto.randomUUID();
const h = (html: string): Block => ({ id: uid(), type: 'heading', html });
const p = (html = ''): Block => ({ id: uid(), type: 'paragraph', html });
const ol = (...items: string[]): Block => ({
	id: uid(),
	type: 'numbered',
	items: items.map((html) => ({ id: uid(), html }))
});

export const templates: Template[] = [
	{
		id: 'default',
		label: 'Default',
		description: 'A heading and an empty paragraph.',
		blocks: () => [h('Overview'), p()]
	},
	{
		id: 'blank',
		label: 'Blank',
		description: 'Start from an empty page.',
		blocks: () => [p()]
	},
	{
		id: 'meeting',
		label: 'Meeting Note',
		description: 'Attendees, agenda and action items.',
		blocks: () => [h('Attendees'), p(), h('Agenda'), ol(''), h('Action items'), ol('')]
	},
	{
		id: 'spec',
		label: 'Technical Spec',
		description: 'Context, goals and proposed design.',
		blocks: () => [h('Context'), p(), h('Goals'), ol(''), h('Proposed design'), p()]
	}
];
