<script lang="ts">
  import type { Component } from 'svelte';
  import { KeyRound, Package, ScanLine, ShieldCheck } from '@lucide/svelte';

  let { tool, size = 'md' }: { tool: string; size?: 'sm' | 'md' } = $props();

  const presets: Record<string, { label: string; icon: Component<any>; className: string }> = {
    trivy: { label: 'Trivy', icon: ShieldCheck, className: 'k-badge-info' },
    gitleaks: { label: 'Gitleaks', icon: KeyRound, className: 'k-badge-danger' },
    sbom: { label: 'Syft · SBOM', icon: Package, className: 'k-badge-brand' },
  };

  const preset = $derived(
    presets[tool?.toLowerCase()] ?? { label: tool || 'Desconocida', icon: ScanLine, className: '' },
  );
</script>

<span
  class="k-badge {preset.className} shrink-0 font-semibold uppercase tracking-[0.06em] {size ===
  'sm'
    ? 'text-[10px]'
    : 'text-[11px]'}"
>
  <preset.icon class={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
  {preset.label}
</span>
