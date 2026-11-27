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
    version: '1.6.0',
    date: '2026-11-27',
    es: {
      title: 'CVEs por tecnología y alertas en Slack',
      summary:
        'Sigue los CVEs que se publican para las tecnologías que usa tu organización, aunque todavía no estén en ningún análisis, y recibe las alertas también en Slack.',
      changes: [
        'Nueva pestaña «CVEs por tecnología» junto a «Mis CVEs», con el feed de OSV, NVD, CISA KEV y EPSS.',
        'Elige qué tecnologías sigue la organización desde un catálogo, añade paquetes o CPE propios y acepta sugerencias sacadas de tus análisis.',
        'Marca «Te afecta» cuando un CVE del feed también aparece en tus proyectos.',
        'Eventos de CVE nuevo, escalado, con fix o que afecta a un proyecto, listos para tus alertas.',
        'Canal de notificación Slack (Incoming Webhook con Block Kit), con idioma por canal y el detalle de qué cambió.',
      ],
    },
    en: {
      title: 'CVEs by technology and Slack alerts',
      summary:
        'Follow the CVEs published for the technologies your organization uses, even before they show up in a scan, and get your alerts in Slack too.',
      changes: [
        'New “CVEs by technology” tab next to “My CVEs”, fed by OSV, NVD, CISA KEV and EPSS.',
        'Choose the technologies your organization follows from a catalog, add your own packages or CPEs and accept suggestions from your scans.',
        '“Affects you” flag when a feed CVE also shows up in your projects.',
        'Events for new, escalated, fixed and project-affecting CVEs, ready for your alerts.',
        'Slack notification channel (Incoming Webhook with Block Kit), with a language per channel and details of what changed.',
      ],
    },
  },
  {
    version: '1.5.0',
    date: '2026-11-27',
    es: {
      title: 'State IaC: el estado de Pulumi de tus proyectos',
      summary:
        'Nuevo módulo para ver los stacks de Pulumi que guardas en GCS o S3: recursos, outputs, historial de despliegues y qué cambió entre versiones.',
      changes: [
        'Backends de estado por organización (GCS, S3 y compatibles), en solo lectura y con credenciales cifradas.',
        'Asigna cada proyecto de Pulumi a un proyecto de GitOps: cada proyecto ve solo sus stacks.',
        'Dashboard por stack con salud, recursos, último despliegue, tasa de éxito y avisos.',
        'Árbol de recursos con filtros, historial de despliegues y diff entre dos versiones del estado, sin revelar nunca los secretos.',
        'Alertas: destinatarios de email externos con verificación y canales webhook firmados con HMAC.',
      ],
    },
    en: {
      title: 'State IaC: the Pulumi state of your projects',
      summary:
        'A new module to see the Pulumi stacks you keep in GCS or S3: resources, outputs, deployment history and what changed between versions.',
      changes: [
        'Organization state backends (GCS, S3 and compatible), read-only and with encrypted credentials.',
        'Assign each Pulumi project to a GitOps project: every project only sees its own stacks.',
        'Per-stack dashboard with health, resources, last deployment, success rate and warnings.',
        'Resource tree with filters, deployment history and a diff between two versions of the state that never reveals secrets.',
        'Alerts: verified external email recipients and HMAC-signed webhook channels.',
      ],
    },
  },
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
