<script lang="ts">
  import { Github, FileText } from 'lucide-svelte';
</script>

<footer class="bg-white border-t border-gray-200 mt-auto">
  <div
    class="max-w-[1600px] mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4"
  >
    <div class="text-sm text-gray-500 flex items-center gap-1.5">
      <span>Released under the</span>
      <a
        href="https://github.com/kettu-studio/pulumi-open-state/blob/main/LICENSE"
        target="_blank"
        rel="noopener noreferrer"
        class="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 font-medium"
      >
        <FileText class="w-3.5 h-3.5" /> Apache 2.0 License
      </a>
    </div>

    <div class="flex items-center gap-6">
      <a
        href="https://kettu.studio"
        target="_blank"
        rel="noopener noreferrer"
        class="text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        Developed by <span class="font-bold text-gray-700 hover:text-blue-600 transition-colors"
          >Kettu Studio</span
        >
      </a>

      <a
        href="https://github.com/kettu-studio/pulumi-open-state"
        target="_blank"
        rel="noopener noreferrer"
        class="text-gray-400 hover:text-gray-900 transition-colors flex items-center gap-2"
        aria-label="GitHub Repository"
      >
        <Github class="w-5 h-5" />
      </a>
    </div>
  </div>
</footer>
