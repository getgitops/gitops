import { AuditService } from './application/audit.service';

export const auditService = new AuditService();
export type { AuditEvent, AuditQueryOptions, AuditQueryResult, EntityRowChange } from './application/audit.service';
