# P2 · Entregable 14 — SLO, alertas y operación (Fase I)

---

## 1. SLO iniciales

Sujetos a validación con datos reales de producción (F1). Ventana de
medición: 30 días móviles. Error budget = (1 − SLO) × ventana.

| SLO | Objetivo | Error budget / mes | Cómo se mide |
|---|---|---|---|
| Disponibilidad de la app | 99.9 % | ~43 min | `/api/health` desde monitoreo externo + Vercel status |
| API normal (rutas no-IA) p95 | < 800 ms | 5 % de requests | Vercel Speed Insights / Sentry performance |
| Arranque de job p95 (`started_at − created_at`) | < 10 s | 5 % de jobs | `metricas_operacion()` → `jobs.arranque_seg.p95` |
| Jobs completados sin intervención | > 98 % | 2 % de jobs terminados | `metricas_operacion()` → `jobs.sin_intervencion_pct` |
| Errores no controlados (5xx) | < 0.5 % de requests | — | Sentry issue rate / Vercel |

**Consumo de error budget**: si se agota antes de fin de mes, se congelan
los cambios de alto impacto (nuevos flags al 100 %, migraciones no
aditivas) hasta recuperarlo.

## 2. Clasificación de severidad

| Sev | Definición | Ejemplos | Respuesta |
|---|---|---|---|
| **SEV1** | Caída total o pérdida/exposición de datos | app no responde; worker no procesa ningún job > 5 min; fuga de datos entre organizaciones; borrado accidental | *page* inmediato al on-call; sala de incidente; comunicación a afectados |
| **SEV2** | Degradación funcional seria, sin pérdida de datos | un proveedor de IA caído (circuit breaker abierto); DLQ creciendo (≥ 20/h); SLO de arranque o de jobs sin intervención incumplido; p95 de API > 2× | alerta al on-call en horario; mitigar en < 4 h |
| **SEV3** | Anomalía que aún no impacta al usuario | una organización sobre el 80 % de su cuota de IA; error de estimación de tokens sistemático; warnings recurrentes | *digest*; revisar en el siguiente día hábil |

Las alertas las emite `/api/cron/monitoreo` (cada 10 min) → Sentry
(`fatal`/`error`/`warning`) y, si `ALERTAS_WEBHOOK_URL` está configurada, a
ese webhook (Slack/Teams).

## 3. Matriz de responsables

| Rol | Responsabilidad | Contacto |
|---|---|---|
| On-call de plataforma | Primer respondedor de SEV1/SEV2; ejecuta runbooks | *(configurar)* |
| Dueño de datos / privacidad | Coordina respuesta a fuga de datos; comunicación legal | *(configurar)* |
| Dueño de producto | Decide degradación funcional / comunicación a clientes | *(configurar)* |
| Aprobador de despliegue a producción | *Required reviewer* del Environment `production` | ver `.github/CODEOWNERS` |

## 4. Procedimiento de incidente

1. **Declarar** — abrir un issue con la plantilla `incidente` (severidad,
   hora de inicio, impacto observado). Para SEV1, avisar al canal de guardia.
2. **Mitigar** — ejecutar el runbook correspondiente ([runbooks/](runbooks/)).
   Priorizar detener el daño sobre encontrar la causa raíz.
3. **Comunicar** — actualizar el issue cada 30 min (SEV1) / al cerrar
   (SEV2/3). Actualizar la página de estado si aplica.
4. **Cerrar** — confirmar recuperación con el dashboard de salud
   (`/admin/salud`) y `/api/ready`.
5. **Postmortem** — dentro de 5 días hábiles para SEV1/SEV2, con la
   plantilla `postmortem`. Sin culpables: se analizan los factores
   sistémicos y las acciones de mejora, no las personas.

## 5. Dashboard de salud

`/admin/salud` (client) → `GET /api/admin/salud` → `metricas_operacion()`.
Acceso: sesión + correo en `PLATFORM_ADMIN_EMAILS` (fail-closed).

Muestra: SLO de arranque y de jobs sin intervención, DLQ (1h / 24h), jobs
atascados, jobs por estado, circuit breakers, consumo de IA del mes por
organización (top 10 + orgs sobre el 80 % de cuota), feature flags activos.
Se refresca cada 30 s.

## 6. Runbooks

Ver [runbooks/](runbooks/):

- [proveedor-ia-caido.md](runbooks/proveedor-ia-caido.md)
- [dlq-creciendo.md](runbooks/dlq-creciendo.md)
- [worker-no-procesa.md](runbooks/worker-no-procesa.md)
- [consumo-anormal-ia.md](runbooks/consumo-anormal-ia.md)
- [migracion-fallida.md](runbooks/migracion-fallida.md)
- [revocar-sesiones.md](runbooks/revocar-sesiones.md)
- [fuga-de-datos.md](runbooks/fuga-de-datos.md)
- [documento-malicioso.md](runbooks/documento-malicioso.md)
