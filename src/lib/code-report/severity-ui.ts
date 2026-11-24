/**
 * Presentación de severidades en la UI v3, con el mismo código de color que /brand:
 * critical = danger, high = brand, medium = warn, low/unknown = neutro.
 */
export type SeverityKey = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

export const SEVERITY_ORDER: SeverityKey[] = ['critical', 'high', 'medium', 'low', 'unknown'];

export const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};

export const SEVERITY_LABEL: Record<SeverityKey, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
  unknown: 'Sin clasificar',
};

/** Clase `k-badge-*` de cada severidad. */
export const SEVERITY_BADGE: Record<SeverityKey, string> = {
  critical: 'k-badge-danger',
  high: 'k-badge-brand',
  medium: 'k-badge-warn',
  low: '',
  unknown: '',
};

/** Relleno sólido (barras, puntos). */
export const SEVERITY_FILL: Record<SeverityKey, string> = {
  critical: 'bg-red-500',
  high: 'bg-brand-500',
  medium: 'bg-amber-400',
  low: 'bg-white/30',
  unknown: 'bg-white/15',
};

export function severityBadge(severity: string): string {
  return SEVERITY_BADGE[severity as SeverityKey] ?? '';
}

export function severityLabel(severity: string): string {
  return SEVERITY_LABEL[severity as SeverityKey] ?? severity;
}

export type RiskLevel = {
  key: 'none' | 'low' | 'medium' | 'high' | 'critical';
  label: string;
  /** Texto y fondo del nivel. */
  tone: string;
  badge: string;
};

/** Mismos rangos que los ajustes de Code Report: 1-7 bajo, 8-19 medio, 20-39 alto, 40+ crítico. */
export function riskLevel(score: number, criticalCount: number): RiskLevel {
  if (criticalCount > 0 || score >= 40)
    return {
      key: 'critical',
      label: 'Riesgo crítico',
      tone: 'text-red-300',
      badge: 'k-badge-danger',
    };
  if (score >= 20)
    return { key: 'high', label: 'Riesgo alto', tone: 'text-brand-300', badge: 'k-badge-brand' };
  if (score >= 8)
    return { key: 'medium', label: 'Riesgo medio', tone: 'text-amber-300', badge: 'k-badge-warn' };
  if (score > 0) return { key: 'low', label: 'Riesgo bajo', tone: 'text-fg', badge: '' };
  return { key: 'none', label: 'Sin riesgo', tone: 'text-ok', badge: 'k-badge-ok' };
}
