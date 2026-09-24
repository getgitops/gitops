<script lang="ts">
	import { tick } from 'svelte';
	import { ChevronDown, PanelsTopLeft, PencilLine } from '@lucide/svelte';
	import ArchitectureDiagram from '$lib/components/ArchitectureDiagram.svelte';
	import PageMenu from '$lib/components/PageMenu.svelte';
	import PresenceStack from '$lib/components/PresenceStack.svelte';
	import type { Block } from '$lib/mock/pages';
	import { workspace } from '$lib/state/workspace.svelte';

	let { data } = $props();

	const doc = $derived(workspace.pages[data.slug]);
	let article = $state<HTMLElement>();

	const newId = () => crypto.randomUUID();

	function edited() {
		workspace.markEdited(data.slug);
	}

	function isEmpty(el: HTMLElement) {
		return (el.textContent ?? '') === '';
	}

	/** Keeps pasted content as plain text so foreign styles don't leak into the page. */
	function plainPaste(e: ClipboardEvent) {
		e.preventDefault();
		document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '');
	}

	function placeCaret(el: HTMLElement, atEnd: boolean) {
		el.focus();
		const range = document.createRange();
		range.selectNodeContents(el);
		range.collapse(!atEnd);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	}

	async function focusId(id: string, atEnd = false) {
		await tick();
		const el = article?.querySelector<HTMLElement>(`[data-edit-id="${id}"]`);
		if (el) placeCaret(el, atEnd);
	}

	function focusPrevious(el: HTMLElement) {
		const editables = Array.from(
			article?.querySelectorAll<HTMLElement>('[contenteditable="true"]') ?? []
		);
		const prev = editables[editables.indexOf(el) - 1];
		if (prev) placeCaret(prev, true);
	}

	function insertParagraphAfter(index: number) {
		const block: Block = { id: newId(), type: 'paragraph', html: '' };
		doc.blocks.splice(index + 1, 0, block);
		edited();
		focusId(block.id);
	}

	function removeBlock(index: number, el: HTMLElement) {
		focusPrevious(el);
		doc.blocks.splice(index, 1);
		edited();
	}

	function onBlockKeydown(e: KeyboardEvent, index: number) {
		const el = e.currentTarget as HTMLElement;
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			insertParagraphAfter(index);
		} else if (e.key === 'Backspace' && isEmpty(el) && doc.blocks.length > 1) {
			e.preventDefault();
			removeBlock(index, el);
		}
	}

	/** Markdown-style shortcuts: "# " → heading, "1. " / "- " → numbered list. */
	function onParagraphInput(e: Event, index: number) {
		const el = e.currentTarget as HTMLElement;
		const text = el.textContent ?? '';
		const heading = /^#{1,3}\s/.exec(text);
		const list = /^(1\.|-)\s/.exec(text);
		if (heading || list) {
			const html = text.slice((heading ?? list)![0].length);
			const next: Block = heading
				? { id: newId(), type: 'heading', html }
				: { id: newId(), type: 'numbered', items: [{ id: newId(), html }] };
			doc.blocks[index] = next;
			focusId(next.type === 'numbered' ? next.items[0].id : next.id, true);
		}
		edited();
	}

	function onItemKeydown(
		e: KeyboardEvent,
		block: Extract<Block, { type: 'numbered' }>,
		blockIndex: number,
		itemIndex: number
	) {
		const el = e.currentTarget as HTMLElement;
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (isEmpty(el)) {
				// Enter on an empty item leaves the list, like most editors.
				block.items.splice(itemIndex, 1);
				if (!block.items.length) doc.blocks.splice(blockIndex, 1);
				insertParagraphAfter(block.items.length ? blockIndex : blockIndex - 1);
				return;
			}
			const item = { id: newId(), html: '' };
			block.items.splice(itemIndex + 1, 0, item);
			edited();
			focusId(item.id);
		} else if (e.key === 'Backspace' && isEmpty(el)) {
			e.preventDefault();
			focusPrevious(el);
			block.items.splice(itemIndex, 1);
			if (!block.items.length) doc.blocks.splice(blockIndex, 1);
			edited();
		}
	}

	function clearIfBlank(e: FocusEvent, set: (html: string) => void) {
		if (isEmpty(e.currentTarget as HTMLElement)) set('');
	}
</script>

<svelte:head>
	<title>{doc?.title || 'Untitled'} · Context</title>
</svelte:head>

<!-- `doc` is briefly missing while switching to a workspace without this page. -->
{#if doc}
	<div class="flex h-16 items-center pr-[26px] pl-[28px] text-[12px] text-fg-muted">
		<PanelsTopLeft size={16} class="mr-[11px] shrink-0" />
		<nav aria-label="Breadcrumb" class="flex min-w-0 items-center">
			{#each doc.path as segment, i (i)}
				{#if i > 0}<span class="mx-[11px] text-fg-faint">/</span>{/if}
				<button type="button" class="flex items-center gap-[7px] truncate hover:text-fg-soft">
					{segment}
					{#if i === doc.path.length - 1}<ChevronDown size={13} />{/if}
				</button>
			{/each}
			<span class="ml-[26px] truncate text-fg-soft">{doc.title || 'Untitled'}</span>
		</nav>

		<div class="ml-auto flex shrink-0 items-center text-[11px]">
			<span class="flex items-center gap-2">
				<PencilLine size={14} />
				Edited {doc.editedAgo}
			</span>
			<div class="ml-[23px]">
				<PresenceStack slug={data.slug} />
			</div>
			<div class="ml-[20px]">
				<PageMenu slug={data.slug} />
			</div>
		</div>
	</div>

	<article bind:this={article} class="px-[47px] pt-[18px] pb-24">
		<h1
			contenteditable="true"
			spellcheck="false"
			data-placeholder="Untitled"
			class="text-[30px] leading-[40px] font-semibold tracking-[-0.015em] text-fg"
			bind:textContent={doc.title}
			oninput={edited}
			onpaste={plainPaste}
			onkeydown={(e) => {
				if (e.key !== 'Enter') return;
				e.preventDefault();
				const next = article?.querySelector<HTMLElement>('[data-edit-id="description"]');
				if (next) placeCaret(next, false);
			}}
		></h1>

		<p
			contenteditable="true"
			spellcheck="false"
			data-edit-id="description"
			data-placeholder="Add a description…"
			class="mt-[9px] max-w-[600px] text-[15.5px] leading-[22px] text-fg-soft"
			bind:innerHTML={doc.description}
			oninput={edited}
			onpaste={plainPaste}
			onblur={(e) => clearIfBlank(e, (v) => (doc.description = v))}
		></p>

		{#if doc.tags.length}
			<ul class="mt-[19px] flex flex-wrap gap-2">
				{#each doc.tags as tag (tag)}
					<li
						class="flex h-6 items-center rounded-md border border-line bg-raised px-2.5 text-[12.5px] text-fg-soft"
					>
						# {tag}
					</li>
				{/each}
			</ul>
		{/if}

		<div class="mt-[21px]">
			{#each doc.blocks as block, index (block.id)}
				{#if block.type === 'heading'}
					<h2
						contenteditable="true"
						spellcheck="false"
						data-edit-id={block.id}
						data-placeholder="Heading"
						class="mt-[25px] mb-1.5 text-[19.5px] leading-7 font-semibold tracking-[-0.01em] text-fg"
						bind:innerHTML={block.html}
						oninput={edited}
						onpaste={plainPaste}
						onkeydown={(e) => onBlockKeydown(e, index)}
						onblur={(e) => clearIfBlank(e, (v) => (block.html = v))}
					></h2>
				{:else if block.type === 'paragraph'}
					<p
						contenteditable="true"
						spellcheck="false"
						data-edit-id={block.id}
						data-placeholder="Write something, or type # for a heading…"
						class="max-w-[566px] py-px text-[14px] leading-[22px] text-fg-soft [&_b]:font-semibold [&_b]:text-fg [&_code]:rounded [&_code]:bg-raised [&_code]:px-1 [&_code]:text-[13px]"
						bind:innerHTML={block.html}
						oninput={(e) => onParagraphInput(e, index)}
						onpaste={plainPaste}
						onkeydown={(e) => onBlockKeydown(e, index)}
						onblur={(e) => clearIfBlank(e, (v) => (block.html = v))}
					></p>
				{:else if block.type === 'numbered'}
					<ol class="space-y-[5px] pt-[5px]">
						{#each block.items as item, itemIndex (item.id)}
							<li class="flex items-start gap-[18px]">
								<span
									class="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-ink select-none"
								>
									{itemIndex + 1}
								</span>
								<div
									role="textbox"
									tabindex="0"
									aria-multiline="true"
									contenteditable="true"
									spellcheck="false"
									data-edit-id={item.id}
									data-placeholder="List item"
									class="min-w-0 flex-1 text-[11px] leading-5 text-fg-soft [&_b]:font-semibold [&_b]:text-fg"
									bind:innerHTML={item.html}
									oninput={edited}
									onpaste={plainPaste}
									onkeydown={(e) => onItemKeydown(e, block, index, itemIndex)}
									onblur={(e) => clearIfBlank(e, (v) => (item.html = v))}
								></div>
							</li>
						{/each}
					</ol>
				{:else if block.type === 'diagram'}
					<div class="mt-1.5 mb-1 max-w-[817px]">
						<ArchitectureDiagram />
					</div>
				{/if}
			{/each}
		</div>
	</article>
{/if}
