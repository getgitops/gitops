<script lang="ts">
  import { KeyRound, Package, ScanLine, ShieldCheck } from '@lucide/svelte';

  export let tool: string;
  export let size: 'sm' | 'md' = 'md';

  const presets: Record<string, { label: string; icon: any; className: string }> = {
    trivy: {
      label: 'Trivy',
      icon: ShieldCheck,
      className: 'border-blue-200 bg-blue-50 text-blue-700',
    },
    gitleaks: {
      label: 'Gitleaks',
      icon: KeyRound,
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    },
    sbom: {
      label: 'Syft · SBOM',
      icon: Package,
      className: 'border-violet-200 bg-violet-50 text-violet-700',
    },
  };

  $: preset = presets[tool?.toLowerCase()] ?? {
    label: tool || 'Desconocida',
    icon: ScanLine,
    className: 'border-slate-200 bg-slate-100 text-slate-600',
  };
</script>

<span
  class={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wide ${preset.className} ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'}`}
>
  <svelte:component this={preset.icon} class={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
  {preset.label}
</span>
