import { renderTemplateString } from './template';

// internally generated HTML snippets for `{{{ }}}` slots: every value goes through `{{ }}`

/** Centered call-to-action button; empty without a URL (no `ORIGIN`). */
export function emailButton(url: string | null, label: string): string {
  if (!url) return '';
  return renderTemplateString(
    '<p style="margin: 24px 0 8px 0; text-align: center"><a href="{{ url }}" style="display: inline-block; padding: 12px 24px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600">{{ label }}</a></p>',
    { url, label },
  );
}

/** Grey side note; empty for an empty text. */
export function emailNote(text: string): string {
  if (!text) return '';
  return renderTemplateString(
    '<p style="margin: 0 0 16px 0; padding: 10px 14px; border-radius: 8px; background-color: #f9fafb; color: #4b5563; font-size: 13px">{{ text }}</p>',
    { text },
  );
}
