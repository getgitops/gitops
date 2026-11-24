/**
 * Badge colors of external recipient statuses, shared by the notification settings and the alert
 * editor: confirmed green, waiting amber, unsubscribed red (the owner said no), blocked grey (the
 * organization removed the domain).
 */
const STATUS_BADGE: Record<string, string> = {
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  unsubscribed: 'border-red-200 bg-red-50 text-red-700',
  blocked: 'border-slate-300 bg-slate-100 text-slate-600',
};

export function statusBadgeClass(status: string): string {
  return STATUS_BADGE[status] ?? 'border-slate-200 bg-slate-50 text-slate-600';
}
