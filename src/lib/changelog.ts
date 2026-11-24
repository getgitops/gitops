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
    version: '1.4.0',
    date: '2026-11-24',
    es: {
      title: 'Monitoring: uptime de tus servicios',
      summary:
        'Nuevo módulo para vigilar tus URLs cada minuto, con uptime, latencia e incidencias enlazados a tus servicios.',
      changes: [
        'Monitores HTTP con método, headers y body cifrados, enlazados con servicios de Code Report.',
        'Dashboard con barras de estado, uptime 24 h / 7 d / 30 d / 90 d y gráfica de tiempo de respuesta.',
        'Incidencias automáticas y alertas por email cuando un monitor cae, se degrada o se recupera.',
        'Workers escalables: integrado por defecto o dedicados con `bun run worker`.',
        'Página de arranque mientras GitOps se inicia y correcciones en CVEs y la barra lateral.',
      ],
    },
    en: {
      title: 'Monitoring: uptime for your services',
      summary:
        'A new module that checks your URLs every minute, with uptime, latency and incidents linked to your services.',
      changes: [
        'HTTP monitors with method, encrypted headers and body, linked to Code Report services.',
        'Dashboard with status bars, uptime 24 h / 7 d / 30 d / 90 d and a response time chart.',
        'Automatic incidents and email alerts when a monitor goes down, degrades or recovers.',
        'Scalable workers: embedded by default or dedicated with `bun run worker`.',
        'Startup page while GitOps boots, plus CVE and sidebar fixes.',
      ],
    },
  },
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
