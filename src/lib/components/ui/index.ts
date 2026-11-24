/**
 * Componentes de UI con comportamiento (UI v3).
 * Lo que solo es estilo (botones, enlaces, badges, cards, inputs) son clases `k-*` de
 * `src/lib/styles/brand.css`. Catálogo y ejemplos en /brand.
 */
export { default as CommandPalette } from './CommandPalette.svelte';
export type { CommandGroup, CommandItem } from './CommandPalette.svelte';
export { default as Drawer } from './Drawer.svelte';
export { default as DropdownMenu } from './DropdownMenu.svelte';
export type { DropdownTriggerProps } from './DropdownMenu.svelte';
export { default as Field } from './Field.svelte';
export type { FieldControlProps } from './Field.svelte';
export { default as MenuItem } from './MenuItem.svelte';
export { default as Modal } from './Modal.svelte';
export { default as Select } from './Select.svelte';
export type { SelectOption } from './Select.svelte';
export { default as Switch } from './Switch.svelte';
export { default as TagInput } from './TagInput.svelte';
export type { TagSuggestion, TagView } from './TagInput.svelte';
export { default as Tabs, tabId, tabPanelId } from './Tabs.svelte';
export type { TabItem } from './Tabs.svelte';
export { default as Toaster } from './Toaster.svelte';
export { toast } from './toast.svelte';
export type { ToastTone } from './toast.svelte';
