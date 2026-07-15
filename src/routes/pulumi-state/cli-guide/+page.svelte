<script lang="ts">
  import { Terminal, BookOpen, AlertTriangle, Cloud, Layers } from 'lucide-svelte';
  import SubNavbar from '$lib/components/SubNavbar.svelte';

  export let data: any;

  function selectBackend(event: CustomEvent<{ id: string }>) {
    document.cookie = `active_backend=${event.detail.id}; path=/; max-age=31536000`;
    window.location.href = '/pulumi-state';
  }
</script>

<svelte:head>
  <title>CLI Guide - Pulumi State</title>
</svelte:head>

<SubNavbar
  label="State"
  options={data.backends || []}
  activeId={data.activeBackendId || ''}
  path="/cli-guide"
  on:change={selectBackend}
/>

<div class="max-w-5xl space-y-6">
  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <div class="flex items-center gap-3">
      <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
        <BookOpen class="h-5 w-5" />
      </div>
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Pulumi CLI Guide</h2>
        <p class="mt-1 text-sm text-slate-600">
          Basic workflow from login to create/select/remove/destroy stacks.
        </p>
      </div>
    </div>
  </section>

  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <h3 class="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
      <Cloud class="h-5 w-5 text-blue-600" />
      1) Login to your backend
    </h3>
    <p class="mb-3 text-sm text-slate-600">
      Use the backend URL that matches your selected storage provider.
    </p>
    <div class="grid gap-4 md:grid-cols-2">
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p class="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">S3</p>
        <pre class="overflow-x-auto text-sm text-slate-800"><code>pulumi login s3://&lt;bucket&gt;?region=&lt;region&gt;</code></pre>
      </div>
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p class="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">GCS</p>
        <pre class="overflow-x-auto text-sm text-slate-800"><code>pulumi login gs://&lt;bucket&gt;</code></pre>
      </div>
    </div>
  </section>

  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <h3 class="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
      <Layers class="h-5 w-5 text-emerald-600" />
      2) Create a Pulumi project and stack
    </h3>
    <div class="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <pre class="overflow-x-auto text-sm text-slate-800"><code>pulumi new typescript --name my-project
pulumi stack init dev
pulumi stack select dev</code></pre>
    </div>
    <p class="mt-3 text-sm text-slate-600">
      If your stack naming convention includes project prefixes, use format like
      <span class="font-mono text-slate-800">my-project/dev</span>.
    </p>
  </section>

  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <h3 class="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
      <Terminal class="h-5 w-5 text-violet-600" />
      3) Day-to-day stack commands
    </h3>
    <div class="grid gap-4 md:grid-cols-2">
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p class="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Select Stack</p>
        <pre class="overflow-x-auto text-sm text-slate-800"><code>pulumi stack select my-project/dev</code></pre>
      </div>
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p class="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Preview</p>
        <pre class="overflow-x-auto text-sm text-slate-800"><code>pulumi preview</code></pre>
      </div>
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p class="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Deploy</p>
        <pre class="overflow-x-auto text-sm text-slate-800"><code>pulumi up</code></pre>
      </div>
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p class="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Check Outputs</p>
        <pre class="overflow-x-auto text-sm text-slate-800"><code>pulumi stack output
pulumi stack output --json</code></pre>
      </div>
    </div>
  </section>

  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <h3 class="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
      <AlertTriangle class="h-5 w-5 text-rose-600" />
      4) Remove resources and delete stacks
    </h3>
    <div class="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
      <pre class="overflow-x-auto text-sm text-rose-900"><code># Destroy infrastructure in selected stack
pulumi destroy

# Remove stack from backend (after destroy)
pulumi stack rm my-project/dev

# Force remove if needed
pulumi stack rm my-project/dev --force</code></pre>
    </div>
    <p class="mt-3 text-sm text-slate-600">
      Recommended order: <span class="font-mono text-slate-800">destroy</span> first, then
      <span class="font-mono text-slate-800">stack rm</span>.
    </p>
  </section>
</div>
