<!--
  Envuelve un control de formulario con su etiqueta, ayuda y error, enlazados por aria.
  El snippet recibe las props que el control debe extender (`id`, `aria-describedby`,
  `aria-invalid`, `required`), así vale para inputs nativos, textarea, Select o Switch.

  Uso:
    <Field label="Nombre" help="Se usará como slug" error={errors.name}>
      {#snippet children(control)}
        <input class="k-input" name="name" {...control} />
      {/snippet}
    </Field>
-->
<script lang="ts" module>
  export type FieldControlProps = {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': boolean | undefined;
    required: boolean | undefined;
  };
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { CircleX } from '@lucide/svelte';

  type Props = {
    label: string;
    /** Id del control. Si no se pasa, se genera uno. */
    id?: string;
    help?: string;
    error?: string | null;
    required?: boolean;
    /** Texto opcional a la derecha de la etiqueta (p. ej. "Opcional" o un contador). */
    aside?: Snippet;
    class?: string;
    children: Snippet<[FieldControlProps]>;
  };

  let {
    label,
    id,
    help,
    error,
    required,
    aside,
    class: className = '',
    children,
  }: Props = $props();

  const uid = $props.id();
  const controlId = $derived(id ?? `${uid}-control`);
  const helpId = $derived(`${controlId}-help`);
  const errorId = $derived(`${controlId}-error`);

  const control: FieldControlProps = $derived({
    id: controlId,
    'aria-describedby': error ? errorId : help ? helpId : undefined,
    'aria-invalid': error ? true : undefined,
    required,
  });
</script>

<div class={className}>
  <div class="flex items-baseline justify-between gap-2">
    <label class="k-label" for={controlId}>
      {label}{#if required}<span class="ml-0.5 text-brand-400" aria-hidden="true">*</span>{/if}
    </label>
    {#if aside}<span class="text-xs text-fg-subtle">{@render aside()}</span>{/if}
  </div>
  {@render children(control)}
  {#if error}
    <p id={errorId} class="mt-1.5 flex items-center gap-1.5 text-xs text-red-300">
      <CircleX class="h-3.5 w-3.5 shrink-0" />{error}
    </p>
  {:else if help}
    <p id={helpId} class="k-help">{help}</p>
  {/if}
</div>
