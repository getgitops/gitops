# Changelog

## 1.6.0 — 2026-11-27

- Feed de CVEs por tecnología (`$modules/cve-feed`): pestañas «Mis CVEs» | «CVEs por tecnología»
  en `/org/<org>/cves`, con watchlist por organización, catálogo de tecnologías, entradas
  personalizadas (OSV o CPE) y sugerencias desde los análisis Trivy/SBOM. ADR 0004.
- Worker embebido con lease en GitDB y fuentes OSV, NVD 2.0 (`NVD_API_KEY` opcional), CISA KEV y
  EPSS. Solo guarda los CVEs que afectan a tecnologías seguidas, escribe por lotes y no escribe
  nada si no hay cambios; repositorio dedicado opcional (`CVE_FEED_GITDB_*`). Desactivado por
  defecto (`CVE_FEED_ENABLED`).
- Eventos `cve_feed.advisory.published|escalated|fix_available|affects_project`, deduplicados por
  organización, y permisos `organization:cves:feed:read|update`.
- Alertas: canal Slack (Incoming Webhook + Block Kit) con idioma por canal y detalle de cambios,
  sobre una base común para canales de chat con host fijo.

## 1.5.0 — 2026-11-27

- Módulo State IaC: backends de estado de Pulumi por organización (GCS, S3 y compatibles), en
  solo lectura y con credenciales cifradas (`GITDB_ENCRYPTION_KEY`). ADR 0003.
- Asignación de proyectos de Pulumi a proyectos de GitOps: cada proyecto ve solo sus stacks
  (`project:stateiac:*`); configuración en `organization:stateiac:backends:*`.
- Dashboard por stack (salud, recursos, último despliegue, éxito a 30 días, despliegues de 90
  días, avisos), árbol de recursos, outputs, historial y diff entre versiones del estado.
- Los secretos del estado se enmascaran al leerlo y nunca salen del servidor. Caché en memoria
  (`STATE_IAC_CACHE_SECONDS`) y límite de tamaño (`STATE_IAC_MAX_STATE_MB`).
- Alertas: destinatarios de email externos con verificación y dominios permitidos, base común de
  canales de notificación y canal webhook firmado con HMAC.

## 1.4.0 — 2026-11-24

- Módulo Monitoring: monitores HTTP (método, headers y body cifrados) enlazados con servicios de
  Code Report, con botón de prueba y comprobación cada 60 s por defecto.
- Dashboard de uptime con barras de estado, uptime 24 h / 7 d / 30 d / 90 d, latencia e
  incidencias; eventos `monitoring.monitor.*` disponibles para alertas.
- Workers sin estado y escalables (embebido o `bun run worker`) con una API interna de leases.
- Métricas en GitDB como incidencias y agregados por hora y por día, opcionalmente en un
  repositorio dedicado (`MONITORING_GITDB_REPOSITORY_URL`).
- Página «GitOps se está iniciando» mientras arranca el servidor, y correcciones en la vista de
  CVEs y en la barra lateral.

## 1.3.6 — 2026-11-20

- Gestión de alertas con condiciones configurables y destinatarios.
- Motor de alertas por email con plantillas y cola con reintentos.
- Registro de eventos de organización y proyecto con reconocimiento.
- Mejoras de acceso y compatibilidad con Google SSO.
