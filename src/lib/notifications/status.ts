const STATUS_BADGE: Record<string, string> = {
  verified: 'k-badge k-badge-ok',
  pending: 'k-badge k-badge-warn',
  unsubscribed: 'k-badge k-badge-danger',
  blocked: 'k-badge',
};

export function statusBadgeClass(status: string): string {
  return STATUS_BADGE[status] ?? 'k-badge';
}
