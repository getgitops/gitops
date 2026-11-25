<script lang="ts">
  import NotificationLinkPage from '#lib/components/NotificationLinkPage.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<NotificationLinkPage kind="verify" token={data.token} link={form?.link ?? data.link} />
