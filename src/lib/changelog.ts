export type ChangelogEntry = {
  version: string;
  date: string;
  es: {
    title: string;
    summary: string;
    changes: string[];
  };
  en: {
    title: string;
    summary: string;
    changes: string[];
  };
};

export const changelog: ChangelogEntry[] = [
  {
    version: '1.3.6',
    date: '2026-11-20',
    es: {
      title: 'Alertas, eventos y nuevas opciones de acceso',
      summary: 'Esta versión amplía la monitorización y las opciones de comunicación de GitOps.',
      changes: [
        'Gestión de alertas con condiciones configurables y destinatarios.',
        'Motor de alertas por email con plantillas y cola con reintentos.',
        'Registro de eventos de organización y proyecto con reconocimiento.',
        'Mejoras de acceso y compatibilidad con Google SSO.',
      ],
    },
    en: {
      title: 'Alerts, events and more access options',
      summary: 'This release expands monitoring and communication options in GitOps.',
      changes: [
        'Alert management with configurable conditions and recipients.',
        'Email alert engine with templates and a retry queue.',
        'Organization and project event log with acknowledgements.',
        'Access improvements and Google SSO compatibility.',
      ],
    },
  },
];

export function getChangelogEntry(version: string): ChangelogEntry | null {
  return changelog.find((entry) => entry.version === version) ?? null;
}

export function shouldShowWhatsNew(currentVersion: string, seenVersion: string | null): boolean {
  return getChangelogEntry(currentVersion) !== null && seenVersion !== currentVersion;
}
