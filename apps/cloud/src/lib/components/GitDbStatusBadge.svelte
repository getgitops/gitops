<script lang="ts">
  export let state: 'synced' | 'syncing' | 'error' | 'unconfigured' = 'unconfigured';
  export let label = '';
  export let size: 'sm' | 'md' = 'sm';

  const DOT_CLASSES: Record<string, string> = {
    synced: 'bg-emerald-500',
    syncing: 'bg-amber-500 animate-pulse',
    error: 'bg-red-500',
    unconfigured: 'bg-slate-300',
  };

  const TEXT_CLASSES: Record<string, string> = {
    synced: 'text-emerald-700',
    syncing: 'text-amber-700',
    error: 'text-red-700',
    unconfigured: 'text-slate-500',
  };

  const DEFAULT_LABELS: Record<string, string> = {
    synced: 'All sync',
    syncing: 'Sync in progress',
    error: 'Error in sync',
    unconfigured: 'Repository not configured',
  };

  $: dotClass = DOT_CLASSES[state] ?? DOT_CLASSES.unconfigured;
  $: textClass = TEXT_CLASSES[state] ?? TEXT_CLASSES.unconfigured;
  $: text = label || DEFAULT_LABELS[state] || state;
</script>

<span class="inline-flex items-center gap-2 {size === 'md' ? 'text-sm' : 'text-xs'} font-medium {textClass}">
  <span class="inline-block rounded-full {size === 'md' ? 'h-2.5 w-2.5' : 'h-2 w-2'} {dotClass}"></span>
  {text}
</span>
