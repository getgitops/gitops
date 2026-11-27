<!--
  Select de la marca para formularios que también deben funcionar sin JavaScript.
  Antes de hidratar (y sin JS) pinta un <select> nativo con el mismo `name`; con JS lo
  sustituye por el componente `Select`, que añade su propio input oculto.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Select, type SelectOption } from '#lib/components/ui';

  type Props = {
    options: SelectOption[];
    name: string;
    value?: string;
    id?: string;
    disabled?: boolean;
    mono?: boolean;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
    onchange?: (value: string) => void;
  };

  let { options, name, value = $bindable(''), id, disabled, ...rest }: Props = $props();

  let enhanced = $state(false);
  onMount(() => (enhanced = true));
</script>

{#if enhanced}
  <Select {options} {name} {id} {disabled} bind:value {...rest} />
{:else}
  <select
    class="k-input"
    {name}
    {id}
    {disabled}
    aria-invalid={rest['aria-invalid']}
    aria-describedby={rest['aria-describedby']}
    bind:value
  >
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
{/if}
