import { beforeEach, describe, expect, it } from 'vitest';
import { clearTemplateCache, renderTemplate, renderTemplateString } from './template';

describe('renderTemplateString', () => {
  it('replaces placeholders with the provided values', () => {
    expect(renderTemplateString('Hi {{ name }}!', { name: 'Ada' })).toBe('Hi Ada!');
    expect(renderTemplateString('Hi {{name}}!', { name: 'Ada' })).toBe('Hi Ada!');
  });

  it('escapes HTML in interpolated values', () => {
    expect(renderTemplateString('<p>{{ name }}</p>', { name: '<script>x</script>' })).toBe(
      '<p>&lt;script&gt;x&lt;/script&gt;</p>',
    );
  });

  it('supports raw interpolation with triple braces', () => {
    expect(renderTemplateString('<div>{{{ body }}}</div>', { body: '<b>hi</b>' })).toBe(
      '<div><b>hi</b></div>',
    );
  });

  it('renders unknown or nullish variables as an empty string', () => {
    expect(renderTemplateString('[{{ missing }}][{{ empty }}]', { empty: null })).toBe('[][]');
  });

  it('stringifies non-string values', () => {
    expect(renderTemplateString('{{ count }}/{{ flag }}', { count: 3, flag: false })).toBe(
      '3/false',
    );
  });
});

describe('renderTemplate', () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  it('renders the invite template with its variables', async () => {
    const html = await renderTemplate('invite', {
      subject: 'You are invited',
      productName: 'GitOps',
      inviterName: 'Ada',
      organizationName: 'Kettu',
      recipientName: 'Grace',
      roleName: 'Developer',
      inviteUrl: 'https://gitops.local/invite/abc',
      expiresAt: '2026-01-01',
    });

    expect(html).toContain('Ada has invited you to join Kettu');
    expect(html).toContain('https://gitops.local/invite/abc');
    expect(html).toContain('Developer');
    expect(html).not.toContain('{{');
  });

  it('rejects template names that could escape the templates folder', async () => {
    await expect(renderTemplate('../../secret')).rejects.toThrow(/Invalid email template name/);
  });

  it('fails when the template does not exist', async () => {
    await expect(renderTemplate('missing-template')).rejects.toThrow();
  });
});
