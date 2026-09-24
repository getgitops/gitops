<script lang="ts">
	import RepositoryForm from '$lib/components/RepositoryForm.svelte';
	import { workspace } from '$lib/state/workspace.svelte';
</script>

<svelte:head>
	<title>Repository · Settings · Context</title>
</svelte:head>

<div class="pt-[30px] pr-[26px] pb-10 pl-[31px]">
	<h1 class="text-[20px] leading-7 font-semibold tracking-[-0.01em] text-fg">Repository</h1>
	<p class="mt-[7px] text-[13.2px] leading-5 text-fg-soft">
		Choose where the content of this workspace is stored and versioned with Git.
	</p>

	<!-- Reset the draft when the current workspace changes. -->
	{#key workspace.currentId}
		<RepositoryForm />
	{/key}
</div>
