# 💡 GitOps - Ideas de Producto y Roadmap

¡Bienvenido al buzón de ideas y visión de futuro de **GitOps**! 🚀

GitOps es una suite de herramientas _open source_ pensada para revolucionar la ingeniería de plataforma, SecOps y la experiencia de desarrollo (DevX). Actualmente contamos con módulos potentes para reportes de vulnerabilidades, gestión de secretos (estilo Infisical) e interfaz de estados de IaC (estilo Pulumi Cloud).

Este documento recopila las próximas grandes ideas de productos y características que planeamos integrar en la suite para consolidarla como el IDP (Internal Developer Platform) definitivo.

---

## 🗺️ Visión de la Suite de Productos

```
                    ┌──────────────────────────────┐
                    │     GitOps Core (Portal)   │
                    └──────────────┬───────────────┘
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
 [ SEGURIDAD / SecOps ]    [ GESTIÓN DE SECRETOS ]     [ INFRAESTRUCTURA / IaC ]
  ├── Open Report (NPM, etc)├── Vault (Replica Infisical) ├── Pulumi Open State
  ├── *Guard (OPA/Checkov)   └── *Ephemeral (JIT access)  └── *Drifter (Detección Drift)
  └── *Compliance (SOC2/ISO) └── *Rotation (Automated)    └── *IAM-Least-Privilege
```

_\*Productos propuestos en este roadmap._

---

## 1. 🛡️ GitOps Guard (Policy-as-Code & Gobernanza)

_Asegura que tu infraestructura y configuraciones cumplan las políticas de seguridad de la organización antes de llegar a producción._

- **El Problema:** Los desarrolladores a menudo crean recursos de infraestructura en Pulumi o Kubernetes que no siguen las mejores prácticas de seguridad (ej. abrir puertos públicos, bases de datos sin cifrar).
- **Nuestra Solución:** Un motor de políticas integrado que analiza los planes de despliegue de Pulumi y manifiestos de Kubernetes antes de ser aplicados, bloqueando cualquier cambio que viole las reglas definidas.
- **Características Clave:**
  - **Integración con OPA (Open Policy Agent) y Checkov:** Soporte nativo para reglas declarativas (Rego).
  - **Dashboard de Violaciones:** Visualización interactiva en GitOps de qué políticas se han violado, en qué línea de código y quién fue el autor del cambio.
  - **Políticas Out-of-the-Box:** Reglas preconfiguradas para AWS, GCP, Azure y Kubernetes (ej. _"Ningún bucket de S3 puede ser de acceso público"_).
  - **Modo Hard vs. Soft:** Capacidad de configurar advertencias (warnings) o bloqueos absolutos de la pipeline de CI/CD.

---

## 2. ⏳ GitOps Ephemeral (Just-In-Time Access & Secretos Dinámicos)

_Elimina las credenciales permanentes. Acceso temporal y dinámico bajo el principio de "Zero Standing Privileges" (ZSP)._

- **El Problema:** Guardar contraseñas fijas de bases de datos o tokens de administración en el Vault de producción sigue siendo un riesgo de seguridad si una cuenta de desarrollador se ve comprometida.
- **Nuestra Solución:** Las credenciales de acceso de alto nivel no existen de forma permanente. Se crean bajo demanda y expiran/se destruyen automáticamente después de un tiempo límite preestablecido.
- **Características Clave:**
  - **Accesos Just-in-Time (JIT):** Un desarrollador solicita acceso de lectura a la base de datos de producción desde el panel de GitOps.
  - **Aprobación en un Clic:** Los administradores aprueban la solicitud directamente (o vía integraciones con Slack/Teams).
  - **Auto-destrucción:** GitOps interactúa directamente con la base de datos (PostgreSQL, MySQL, MongoDB) o el proveedor de nube para crear un usuario temporal (`usr_tmp_12345`) y lo elimina automáticamente tras expirar el plazo (ej. 1 hora).
  - **Auditoría Completa:** Registro centralizado de quién solicitó el acceso, quién lo aprobó, qué credencial se generó y cuándo fue eliminada.

---

## 3. 🔄 GitOps Rotation (Ciclo de Vida Automático de Secretos)

_La muerte de las contraseñas estáticas de larga duración. Automatización total de la rotación de secretos._

- **El Problema:** La rotación manual de contraseñas de bases de datos, claves de APIs (como Stripe o AWS) y tokens de servicios es tediosa y propensa a causar caídas en producción si se olvida actualizar alguna aplicación.
- **Nuestra Solución:** Un orquestador que cambia los secretos en el sistema de destino y actualiza de forma síncrona y transparente las variables de entorno en GitOps de forma periódica.
- **Características Clave:**
  - **Rotación Programada:** Configuración de intervalos (ej. "rotar la clave de base de datos cada 30 días").
  - **Estrategia Zero-Downtime:** Rotación mediante doble credencial (crear la nueva clave, inyectarla en la app, verificar el estado y eliminar la vieja después) para evitar cualquier interrupción del servicio.
  - **Catálogo de Integraciones (Plugins):** Soporte nativo para bases de datos relacionales, AWS IAM, GCP Service Accounts, Slack APIs, Stripe, etc.

---

## 4. 🚨 GitOps Drifter (Detección de Desviación de Configuración)

_Detecta y soluciona la temida "desviación de configuración" (Drift) entre tu código de Pulumi y la realidad de la nube._

- **El Problema:** A veces, en una emergencia o por descuido, un administrador modifica un recurso directamente desde la consola web de AWS/GCP (ej. añade una regla de firewall o cambia el tamaño de una máquina), haciendo que el código de Pulumi quede desactualizado e inexacto.
- **Nuestra Solución:** Un agente en segundo plano que compara de forma continua el estado real de tus proveedores Cloud con el estado registrado en tu _Pulumi Open State_, alertando inmediatamente ante cualquier diferencia.
- **Características Clave:**
  - **Alertas Instantáneas:** Notificaciones vía Webhooks, Slack, Teams o Email cuando se detecta un cambio manual ("drift").
  - **Visualización de Diferencias (Diff):** Una interfaz visual interactiva que muestra exactamente qué cambió (ej. _Estado en Pulumi: `port: 443` | Estado Real Cloud: `ports: 443, 22`_).
  - **Auto-Healing (Auto-reparación):** Opción para revertir automáticamente los cambios manuales y volver a aplicar el estado definido en el repositorio de GitOps.

---

## 🛠️ Próximos Pasos de Desarrollo

Para la comunidad y colaboradores que deseen participar en el desarrollo de estas ideas:

1. **Fase 1 (Seguridad Activa):** Implementación de **GitOps Guard**, aprovechando la infraestructura existente de escaneos e informes para centralizar el "Policy-as-Code".
2. **Fase 2 (Gestión Dinámica de Identidad):** Desarrollo de **GitOps Ephemeral**, permitiendo interacciones seguras y temporales con bases de datos SQL y NoSQL.
3. **Fase 3 (Gobernanza de IaC):** Integración de **GitOps Drifter** sobre la interfaz de "Pulumi Open State" para dar visibilidad en tiempo real de la infraestructura en la nube.
