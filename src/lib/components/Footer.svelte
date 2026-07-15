<script lang="ts">
  import { Github, FileText } from 'lucide-svelte';
</script>

<footer class="app-shell-footer mt-auto border-t border-slate-200 bg-white/80 backdrop-blur">
  <div class="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
    <div class="flex items-center gap-3 text-sm text-slate-500">
      <span class="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
        <FileText class="h-4 w-4" />
      </span>
      <p>
        Released under the
        <a
          href="https://github.com/kettu-studio/pulumi-open-state/blob/main/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
          class="font-medium text-slate-700 transition-colors hover:text-slate-950"
        >
          Apache 2.0 License
        </a>
      </p>
    </div>

    <div class="flex items-center gap-5">
      <a
        href="https://kettu.studio"
        target="_blank"
        rel="noopener noreferrer"
        class="text-sm text-slate-500 transition-colors hover:text-slate-950"
      >
        Developed by <span class="font-semibold text-slate-700">Kettu Studio</span>
      </a>

      <a
        href="https://github.com/kettu-studio/pulumi-open-state"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
        aria-label="GitHub Repository"
      >
        <Github class="h-4 w-4" />
      </a>
    </div>
  </div>
</footer>
