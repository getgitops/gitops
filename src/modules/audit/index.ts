import { AuditService } from './application/audit.service';

export const auditService = new AuditService();
export type { AuditEvent, AuditListOptions, AuditListResult, EntityRowChange } from './application/audit.service';
