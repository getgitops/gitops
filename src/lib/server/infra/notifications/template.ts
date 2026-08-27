import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type TemplateVariables = Record<string, string | number | boolean | null | undefined>;

const TEMPLATES_ROOT = path.resolve(process.cwd(), 'src/notifications/email');
const TEMPLATE_NAME = /^[a-zA-Z0-9_-]+$/;

const cache = new Map<string, string>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toText(value: TemplateVariables[string]): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * Interpolates `{{ name }}` (HTML-escaped) and `{{{ name }}}` (raw) placeholders.
 * Unknown placeholders resolve to an empty string.
 */
export function renderTemplateString(template: string, variables: TemplateVariables = {}): string {
  return template
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_match, key: string) => toText(variables[key]))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) =>
      escapeHtml(toText(variables[key])),
    );
}

export async function renderTemplate(
  name: string,
  variables: TemplateVariables = {},
): Promise<string> {
  if (!TEMPLATE_NAME.test(name)) {
    throw new Error(`Invalid email template name: ${name}`);
  }

  let template = cache.get(name);
  if (template === undefined) {
    template = await readFile(path.join(TEMPLATES_ROOT, `${name}.html`), 'utf8');
    cache.set(name, template);
  }

  return renderTemplateString(template, variables);
}

export function clearTemplateCache(): void {
  cache.clear();
}
