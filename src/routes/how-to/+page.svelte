<script lang="ts">
  import { FileText, Terminal, HardDrive } from 'lucide-svelte';
</script>

<svelte:head>
  <title>How To - Pulumi Open State</title>
</svelte:head>

<div class="max-w-4xl space-y-6">
  <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
    <h2 class="text-2xl font-bold text-gray-900">How to use Pulumi Open State</h2>
    <p class="mt-3 text-gray-600">
      This starter mirrors the main flows from the original Pulumi Open State UI: configure storage
      backends, connect Pulumi projects, and inspect stack state and history.
    </p>
  </div>

  <div class="grid gap-6 md:grid-cols-2">
    <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
      <div class="flex items-center gap-3 mb-4">
        <HardDrive class="w-5 h-5 text-blue-600" />
        <h3 class="text-lg font-semibold">Configure storage</h3>
      </div>
      <p class="text-sm text-gray-600">
        Add an S3 or GCS backend from Pulumi State → Storage Backends to connect your Pulumi state
        buckets.
      </p>
    </div>

    <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
      <div class="flex items-center gap-3 mb-4">
        <Terminal class="w-5 h-5 text-green-600" />
        <h3 class="text-lg font-semibold">Use the Pulumi CLI</h3>
      </div>
      <p class="text-sm text-gray-600">
        Run the generated login and stack init commands from the Projects view to connect a local
        stack.
      </p>
    </div>
  </div>

  <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
    <div class="flex items-center gap-3 mb-4">
      <FileText class="w-5 h-5 text-purple-600" />
      <h3 class="text-lg font-semibold">Inspect state</h3>
    </div>
    <p class="text-sm text-gray-600">
      Open a stack to browse resources, outputs, configuration, and historical checkpoints from the
      backend.
    </p>
  </div>
</div>
