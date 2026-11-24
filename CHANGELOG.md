# Changelog

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
