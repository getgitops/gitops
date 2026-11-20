import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEventDefinition, type EventDefinition } from '#lib/events/catalog';
import type { MailNotification } from '#lib/server/infra/notifications';
import type { AnyDomainEvent } from '#lib/server/events';
import type { AlertEmail, SystemEmail } from '../application/alert-engine';
import { AlertMailNotifier } from './alert-mail.notifier';

class RecordingSender {
  sent: { notification: MailNotification; context?: Record<string, unknown> }[] = [];
  async enqueue(notification: MailNotification, context?: Record<string, unknown>) {
    this.sent.push({ notification, context });
  }
  get last() {
    return this.sent[this.sent.length - 1].notification;
  }
}

const XSS = '<script>alert(1)</script>';
const ORIGIN = 'https://gitops.example.com';

function analysisEvent(): AnyDomainEvent {
  return {
    id: 'event-1',
    type: 'code_report.analysis.completed',
    occurredAt: '2026-11-20T10:00:00.000Z',
    actor: { kind: 'system' },
    scope: { organizationId: 'org-1', projectId: 'p1' },
    payload: {
      analysisId: 'analysis-1',
      serviceId: 'svc-gateway',
      tool: 'trivy',
      gitInfo: {
        repositoryUrl: null,
        branch: 'feature/<b>',
        commit: 'abcdef1234567890',
        version: null,
      },
      summary: { critical: 3, high: 5, medium: 1, low: 0, unknown: 0, total: 9, secrets: 0 },
      policies: {
        status: 'violated',
        totalViolations: 2,
        blockingFailures: 1,
        failedPolicyIds: ['p'],
      },
    },
  };
}

function alertEmail(overrides: Partial<AlertEmail> = {}): AlertEmail {
  return {
    recipient: { userId: 'u1', username: 'ana', email: 'ana@example.com' },
    alert: { id: 'alert-1', name: 'Críticas en api-gateway', description: null, scope: 'project' },
    event: analysisEvent(),
    definition: getEventDefinition('code_report.analysis.completed') as EventDefinition,
    suppressed: 0,
    names: new Map([['svc-gateway', `api-gateway ${XSS}`]]),
    where: { organization: 'Kettu', organizationSlug: 'kettu', project: 'Web', projectSlug: 'web' },
    ...overrides,
  };
}

function expectClean(html: string) {
  expect(html).not.toMatch(/\{\{|\}\}/);
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('alerts.email.');
}

describe('AlertMailNotifier', () => {
  let sender: RecordingSender;
  let notifier: AlertMailNotifier;
  const previousOrigin = process.env.ORIGIN;

  beforeEach(() => {
    sender = new RecordingSender();
    notifier = new AlertMailNotifier(sender);
    process.env.ORIGIN = `${ORIGIN}/`;
  });

  afterEach(() => {
    if (previousOrigin === undefined) delete process.env.ORIGIN;
    else process.env.ORIGIN = previousOrigin;
  });

  describe('code report analysis template', () => {
    it('renders service, git info, severities, policies and links', async () => {
      await notifier.sendAlert(alertEmail({ suppressed: 2 }));

      const mail = sender.last;
      expect(mail.to).toEqual(['ana@example.com']);
      expect(mail.subject).toBe(
        '[GitOps] Críticas en api-gateway: 3 critical, 5 high (9 in total)',
      );
      expectClean(mail.content);
      expect(mail.content).toContain('<html lang="en">');
      expect(mail.content).toContain('api-gateway &lt;script&gt;alert(1)&lt;/script&gt;');
      expect(mail.content).toContain('feature/&lt;b&gt;');
      expect(mail.content).toContain('abcdef123456');
      expect(mail.content).toContain('data-severities');
      expect(mail.content).toContain('2 security policies were violated (1 blocking).');
      expect(mail.content).toContain('2 more matching events were skipped');
      expect(mail.content).toContain(
        `href="${ORIGIN}/org/kettu/projects/web/code-report/history/analysis-1"`,
      );
      expect(mail.content).toContain(
        `href="${ORIGIN}/org/kettu/projects/web/settings/alerts/alert-1"`,
      );
      expect(mail.content).toContain('because of the alert “Críticas en api-gateway” in Web');
      expect(sender.sent[0].context).toEqual({
        alertId: 'alert-1',
        eventId: 'event-1',
        kind: 'alert',
      });
    });

    it('also serves failed analyses', async () => {
      await notifier.sendAlert(
        alertEmail({
          event: {
            ...analysisEvent(),
            type: 'code_report.analysis.failed',
            payload: {
              analysisId: 'analysis-2',
              serviceId: 'svc-gateway',
              tool: 'grype',
              gitInfo: { repositoryUrl: null, branch: 'main', commit: null, version: null },
              error: `scanner crashed ${XSS}`,
            },
          },
          definition: getEventDefinition('code_report.analysis.failed') as EventDefinition,
        }),
      );
      expect(sender.last.subject).toBe('[GitOps] Críticas en api-gateway: grype analysis failed');
      expectClean(sender.last.content);
      expect(sender.last.content).toContain('scanner crashed &lt;script&gt;');
      expect(sender.last.content).not.toContain('data-severities');
    });
  });

  describe('generic template', () => {
    it('builds the field table from the catalog definition', async () => {
      const definition = getEventDefinition('vault.secret.deleted') as EventDefinition;
      await notifier.sendAlert(
        alertEmail({
          alert: {
            id: 'alert-2',
            name: 'Secretos borrados',
            description: null,
            scope: 'organization',
          },
          event: {
            id: 'event-3',
            type: 'vault.secret.deleted',
            occurredAt: '2026-11-20T10:00:00.000Z',
            actor: { kind: 'user', userId: 'u2' },
            scope: { organizationId: 'org-1', projectId: 'p1' },
            payload: {
              secretId: 's1',
              key: `DB_${XSS}`,
              folderId: null,
              folderPath: '/',
              environmentIds: ['env-prod'],
            },
          },
          definition,
          names: new Map([['env-prod', 'Production']]),
        }),
      );

      const html = sender.last.content;
      expectClean(html);
      expect(sender.last.subject).toMatch(/^\[GitOps\] Secretos borrados: /);
      expect(html).toContain('data-fields');
      expect(html).toContain('DB_&lt;script&gt;');
      expect(html).toContain('Production');
      // the date, the project and one row per catalog field present in the payload
      const fieldRows = definition.fields.length;
      expect((html.match(/<tr><td/g) ?? []).length).toBeGreaterThanOrEqual(2 + fieldRows - 1);
      expect(html).toContain(`href="${ORIGIN}/org/kettu/projects/web/vault"`);
      // organization alerts are managed from the organization settings
      expect(html).toContain(`href="${ORIGIN}/org/kettu/settings/alerts/alert-2"`);
      expect(html).toContain('in Kettu');
    });

    it('leaves the links out without ORIGIN', async () => {
      delete process.env.ORIGIN;
      await notifier.sendAlert(alertEmail());
      expectClean(sender.last.content);
      expect(sender.last.content).not.toContain('href=');
    });

    it('writes in the recipient language when known', async () => {
      await notifier.sendAlert(
        alertEmail({
          recipient: { userId: 'u1', username: 'ana', email: 'ana@example.com', locale: 'es' },
        }),
      );
      expect(sender.last.subject).toBe(
        '[GitOps] Críticas en api-gateway: 3 críticas, 5 altas (9 en total)',
      );
      expect(sender.last.content).toContain('<html lang="es">');
    });
  });

  describe('system templates', () => {
    function systemEmail(
      kind: SystemEmail['kind'],
      payload: Record<string, unknown> = {},
    ): SystemEmail {
      return {
        recipient: { userId: 'u1', username: `ana ${XSS}`, email: 'ana@example.com' },
        kind,
        event: { ...analysisEvent(), payload } as unknown as AnyDomainEvent,
        names: {
          organization: 'Kettu',
          organizationSlug: 'kettu',
          project: 'Web',
          projectSlug: 'web',
          role: 'Developer',
        },
      };
    }

    it('tells users about access changes', async () => {
      await notifier.sendSystemNotification(systemEmail('access_granted'));
      expect(sender.last.subject).toBe('You now have access to the project Web (Kettu)');
      expectClean(sender.last.content);
      expect(sender.last.content).toContain('with the role Developer');
      expect(sender.last.content).toContain('Hi ana &lt;script&gt;');
      expect(sender.last.content).toContain(`href="${ORIGIN}/org/kettu/projects/web/overview"`);

      await notifier.sendSystemNotification(systemEmail('access_revoked'));
      expect(sender.last.subject).toBe('You no longer have access to the project Web (Kettu)');
      expect(sender.last.content).not.toContain('href=');
    });

    it('warns about new personal API keys', async () => {
      await notifier.sendSystemNotification(
        systemEmail('api_key_created', { name: `laptop ${XSS}`, keyPrefix: 'gvs_abc' }),
      );
      expect(sender.last.subject).toBe('A personal API key was created');
      expectClean(sender.last.content);
      expect(sender.last.content).toContain('laptop &lt;script&gt;');
      expect(sender.last.content).toContain('revoke the API key');
      expect(sender.last.content).toContain(`href="${ORIGIN}/profile"`);
    });
  });
});
