// Comportamiento de los componentes de #lib/components/ui sobre el catálogo /brand:
// teclado, foco, cierre con Esc y clic fuera, toasts.
import { test, expect } from '../fixtures/auth';

test.beforeEach(async ({ page, loginAs }) => {
  await loginAs('orgAdmin');
  await page.goto('/brand');
  // los componentes solo responden una vez hidratada la página
  await expect(page.locator('[data-hydrated="true"]')).toBeAttached({ timeout: 20_000 });
});

test('Modal: abre, enfoca el campo, Esc cierra y devuelve el foco', async ({ page }) => {
  const opener = page.getByRole('button', { name: /Formulario/ });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo secreto' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Nombre')).toBeFocused();

  await page.keyboard.type('mal-nombre');
  await expect(dialog.getByText('Solo mayúsculas')).toBeVisible();
  await expect(dialog.getByLabel('Nombre')).toHaveAttribute('aria-invalid', 'true');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('Modal: el submit del footer envía el formulario y muestra un toast', async ({ page }) => {
  await page.getByRole('button', { name: /Formulario/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo secreto' });
  await dialog.getByLabel('Nombre').fill('DATABASE_URL');
  await dialog.getByPlaceholder('••••••••').fill('postgres://x');
  await dialog.getByRole('button', { name: 'Guardar secreto' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Secreto guardado' })).toBeVisible();
});

test('Modal de confirmación: el botón se habilita al escribir el nombre', async ({ page }) => {
  await page.getByRole('button', { name: /Confirmación destructiva/ }).click();
  const dialog = page.getByRole('alertdialog', { name: '¿Eliminar el proyecto?' });
  const confirm = dialog.getByRole('button', { name: 'Eliminar proyecto' });
  await expect(confirm).toBeDisabled();
  await expect(dialog.getByRole('textbox')).toBeFocused();
  await page.keyboard.type('gitops-cloud');
  await expect(confirm).toBeEnabled();
});

test('Drawer: clic en el fondo cierra', async ({ page }) => {
  await page.getByRole('button', { name: /Drawer lateral/ }).click();
  const drawer = page.getByRole('dialog', { name: 'checkout-api' });
  await expect(drawer).toBeVisible();
  await page.mouse.click(20, 300);
  await expect(drawer).toBeHidden();
});

test('DropdownMenu: flechas recorren los elementos y Esc devuelve el foco', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Acciones', exact: true });
  await trigger.click();
  const menu = page.getByRole('menu', { name: 'Acciones del proyecto' });
  await expect(menu.getByRole('menuitem', { name: /Editar/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: /Duplicar/ })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: /Eliminar/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('DropdownMenu: clic fuera cierra', async ({ page }) => {
  await page.getByRole('button', { name: 'Acciones', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Acciones del proyecto' })).toBeVisible();
  await page.getByRole('heading', { name: 'Dropdowns' }).click();
  await expect(page.getByRole('menu', { name: 'Acciones del proyecto' })).toBeHidden();
});

test('Capas: Esc cierra solo el overlay de arriba', async ({ page }) => {
  await page.getByRole('button', { name: /Formulario/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo secreto' });
  await expect(dialog).toBeVisible();
  // La paleta se abre encima del modal: Esc debe cerrar la paleta y dejar el modal.
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Búsqueda' });
  await expect(palette).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  await expect(dialog).toBeVisible();
});

test('Select: busca, elige con teclado y actualiza el valor', async ({ page }) => {
  const select = page.getByRole('combobox', { name: 'Región' });
  await expect(select).toContainText('europe-southwest1');
  await select.click();
  await page.keyboard.type('iowa');
  await page.keyboard.press('Enter');
  await expect(select).toContainText('us-central1');
  await expect(select).toBeFocused();
});

test('Tabs: las flechas cambian de pestaña y saltan las deshabilitadas', async ({ page }) => {
  const resumen = page.getByRole('tab', { name: 'Resumen' });
  await resumen.click();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Historial' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tab', { name: 'Historial' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(resumen).toHaveAttribute('aria-selected', 'true');
});

test('Switch: cambia aria-checked al pulsarlo', async ({ page }) => {
  const sw = page.getByRole('switch', { name: /Registro abierto/ });
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
});

test('CommandPalette: Ctrl+K abre, filtra y Enter ejecuta la acción', async ({ page }) => {
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Búsqueda' });
  await expect(palette).toBeVisible();
  await page.keyboard.type('secreto');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Nuevo secreto' })).toBeVisible();
});

test('Toaster: muestra el aviso y se puede cerrar', async ({ page }) => {
  await page.getByRole('button', { name: 'Error', exact: true }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'No se pudo sincronizar' });
  await expect(alert).toBeVisible();
  await alert.getByRole('button', { name: 'Cerrar aviso' }).click();
  await expect(alert).toBeHidden();
});
