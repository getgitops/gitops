<!--
  Interruptor on/off (role="switch").
  - Con `name` envía "on" en el <form> cuando está activo (como un checkbox).
  - Nombre accesible: `label` (aria-label) o un <label for={id}> externo / Field.
-->
<script lang="ts">
  type Props = {
    checked?: boolean;
    id?: string;
    name?: string;
    label?: string;
    disabled?: boolean;
    size?: 'sm' | 'md';
    'aria-describedby'?: string;
    onchange?: (checked: boolean) => void;
  };

  let {
    checked = $bindable(false),
    id,
    name,
    label,
    disabled = false,
    size = 'md',
    'aria-describedby': describedby,
    onchange,
  }: Props = $props();

  const sizes = {
    sm: { track: 'h-5 w-9', thumb: 'h-4 w-4', on: 'translate-x-4' },
    md: { track: 'h-6 w-11', thumb: 'h-5 w-5', on: 'translate-x-5' },
  };

  function toggle() {
    checked = !checked;
    onchange?.(checked);
  }
</script>

<button
  type="button"
  role="switch"
  {id}
  aria-checked={checked}
  aria-label={label}
  aria-describedby={describedby}
  {disabled}
  onclick={toggle}
  class="relative shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/35 disabled:cursor-not-allowed disabled:opacity-45 {sizes[
    size
  ].track} {checked ? 'bg-brand-500' : 'bg-ink-600'}"
>
  <span
    class="absolute left-0.5 top-0.5 rounded-full bg-snow shadow transition-transform {sizes[size]
      .thumb} {checked ? sizes[size].on : ''}"
  ></span>
</button>
{#if name && checked}<input type="hidden" {name} value="on" />{/if}
