<!--
  Panel lateral desde la derecha. Mismas props que Modal (sin `placement`).
  Úsalo para ver o editar el detalle de una fila sin salir de la lista.
-->
<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import Modal from './Modal.svelte';

  let {
    open = $bindable(false),
    ...rest
  }: Omit<ComponentProps<typeof Modal>, 'placement'> = $props();
</script>

<Modal bind:open placement="right" {...rest} />
