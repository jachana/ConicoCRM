# Celery Background Jobs Reference

Referencia centralizada de las tareas asíncronas y periódicas que ejecuta Conico. Útil para depuración, operaciones y onboarding de nuevos desarrolladores.

---

## Configuración general

| Parámetro | Valor |
|-----------|-------|
| Broker | Redis (`settings.redis_url`, por defecto `redis://localhost:6379/0`) |
| Result backend | Redis (mismo URL) |
| Serialización | JSON (accept: `["json"]`) |
| Zona horaria | `America/Santiago` |
| UTC habilitado | Sí |
| Módulos incluidos | `dte`, `tareas`, `cobranza`, `caf`, `telemetry`, `audit_retention` |

### Iniciar en desarrollo

```bash
# Worker
celery -A app.celery_app worker --loglevel=info

# Beat scheduler (tareas periódicas)
celery -A app.celery_app beat --loglevel=info --scheduler celery.beat.PersistentScheduler
```

> **Nota:** No hay Flower configurado. Para instalarlo: `pip install flower` y luego `celery -A app.celery_app flower --port=5555`.

---

## Resumen del Beat schedule

| Beat key | Tarea | Cadencia |
|----------|-------|----------|
| `poll-dte-status` | `app.tasks.dte.poll_dte_status` | Cada 5 minutos |
| `generar-tareas-automaticas` | `app.tasks.tareas.generar_tareas_automaticas` | Cada 1 hora |
| `enviar-recordatorios` | `app.tasks.cobranza.enviar_recordatorios_automaticos` | Diario a las 08:00 |
| `enviar-alertas-caf` | `app.tasks.caf.send_caf_alerts_email` | Diario a las 08:30 |
| `aggregate-perf-hourly` | `app.tasks.telemetry.aggregate_perf_hourly` | Cada hora a los :05 |
| `aggregate-cost-hourly` | `app.tasks.telemetry.aggregate_cost_hourly` | Cada hora a los :10 |
| `cleanup-old-rollups` | `app.tasks.telemetry.cleanup_old_rollups` | Domingos a las 03:00 |
| `archive-audit-logs` | `app.tasks.audit_retention.archive_old_audit_logs` | Lunes a las 02:00 |

---

## Tareas detalladas

### `emit_dte` — Emisión DTE

**Archivo:** `backend/app/tasks/dte.py`  
**Nombre completo:** `app.tasks.dte.emit_dte`  
**Trigger:** Manual — `emit_dte.delay(emision_id)` — llamado al crear una emisión DTE

| Parámetro | Valor |
|-----------|-------|
| Binding | Sí (`bind=True`) |
| `max_retries` | 3 |
| Backoff | Exponencial: `60 * 2^intento` → 60s, 120s, 240s |
| Cola | Default |

**Qué hace:**
1. Carga el registro `DteEmision` por ID y valida que esté en estado `pendiente`.
2. Construye el payload según el tipo de documento: Factura (33), Boleta (39/41), NC (61), ND (56), Guía de Despacho (52) o Factura de Compra.
3. Llama al servicio DTE (`dte_service.emit()`), que comunica con Lioren.
4. Almacena `track_id` y `folio`, cambia estado a `procesando`.
5. Sincroniza el estado DTE al documento origen.

**Fallo:** Si se agotan los reintentos, marca la emisión como `rechazada` con `respuesta_sii = {"error": "Max retries exceeded"}`.

---

### `poll_dte_status` — Polling de estado DTE

**Archivo:** `backend/app/tasks/dte.py`  
**Nombre completo:** `app.tasks.dte.poll_dte_status`  
**Trigger:** Beat — cada **5 minutos**

| Parámetro | Valor |
|-----------|-------|
| Binding | No |
| Reintentos | Sin configurar (errores por emisión se loguean y continúan) |
| Cola | Default |

**Qué hace:**
1. Consulta todos los `DteEmision` con `estado = "procesando"` e `intentos_poll < 20`.
2. Para cada emisión, consulta el estado real en el SII via `dte_service` usando el `track_id`.
3. Actualiza el estado: `aceptada`, `rechazada`, `procesando`, o `timeout` (si `intentos_poll >= 20`).
4. Si `aceptada`: registra `aceptado_at`.
5. Sincroniza el estado al documento origen.

**Fallo por timeout:** Tras 20 intentos sin respuesta definitiva (~100 minutos), la emisión pasa a `timeout`.

---

### `generar_tareas_automaticas` — Generación de tareas CRM

**Archivo:** `backend/app/tasks/tareas.py`  
**Nombre completo:** `app.tasks.tareas.generar_tareas_automaticas`  
**Trigger:** Beat — cada **1 hora**

| Parámetro | Valor |
|-----------|-------|
| Binding | No |
| Reintentos | Sin configurar |
| Cola | Default |

**Qué hace:**
Evalúa todas las `ReglaTarea` activas y genera tareas según el tipo de regla:

| Tipo de regla | Condición |
|--------------|-----------|
| `cotizacion_vence` | Cotizaciones próximas a vencer |
| `factura_vencida` | Facturas vencidas sin pagar |
| `aprobacion_pendiente` | Aprobaciones de crédito/margen pendientes |
| `nv_despachada_sin_avanzar` | NV despachadas sin avanzar a factura |
| `cliente_sin_actividad` | Clientes sin actividad reciente |
| `stock_bajo_minimo` | Productos bajo mínimo de stock |

Usa `dedup_key` para evitar tareas duplicadas. Marca como `descartada` las tareas obsoletas.

---

### `enviar_recordatorios_automaticos` — Recordatorios de cobranza

**Archivo:** `backend/app/tasks/cobranza.py`  
**Nombre completo:** `app.tasks.cobranza.enviar_recordatorios_automaticos`  
**Trigger:** Beat — diario a las **08:00 (Santiago)**

| Parámetro | Valor |
|-----------|-------|
| Binding | Sí (`bind=True`) |
| `max_retries` | 3 |
| `countdown` | 60 segundos (fijo) |
| Cola | Default |

**Qué hace:**
1. Itera sobre todas las `Empresa` con `CobranzaConfig` configurada.
2. Consulta facturas en estado `emitida` o `pagada_parcial`, con `fecha_vencimiento <= hoy - dias_frecuencia` y `exclude_recordatorio = False`.
3. Envía email de recordatorio a cada cliente (incluye nro. factura, vencimiento, monto, días de mora).
4. Actualiza `ultimo_recordatorio = hoy`.

**Fallo por empresa:** Error en una empresa se loguea pero no detiene el loop.

---

### `send_caf_alerts_email` — Alertas de CAF agotado/vencido

**Archivo:** `backend/app/tasks/caf.py`  
**Nombre completo:** `app.tasks.caf.send_caf_alerts_email`  
**Trigger:** Beat — diario a las **08:30 (Santiago)**

| Parámetro | Valor |
|-----------|-------|
| Binding | Sí (`bind=True`) |
| `max_retries` | 3 |
| `countdown` | 60 segundos (fijo) |
| Cola | Default |

**Qué hace:**
1. Por cada `Empresa`, evalúa sus CAFs vigentes con alguna de estas condiciones:
   - Stock >= 90% consumido (`LOW_STOCK_RATIO = 0.9`)
   - Vencimiento dentro de 30 días (`EXPIRY_DAYS = 30`)
2. Si hay alertas, envía email a todos los usuarios admin activos de la empresa.

**Fallo por empresa:** Error se loguea pero el loop continúa.

---

### `aggregate_perf_hourly` — Agregación de métricas de rendimiento

**Archivo:** `backend/app/tasks/telemetry.py`  
**Nombre completo:** `app.tasks.telemetry.aggregate_perf_hourly`  
**Trigger:** Beat — cada hora a los **:05 minutos**

| Parámetro | Valor |
|-----------|-------|
| Binding | Sí (`bind=True`) |
| `max_retries` | 3 |
| `countdown` | 60 segundos |
| Cola | Default |

**Qué hace:**
1. Drena la lista Redis `conico:perf_events` (hasta 100 000 items).
2. Agrupa por `(hora_redondeada, route, empresa_id)`.
3. Calcula: count, p50/p95/p99 de latencia (ms), errores (`status >= 500`), total queries.
4. Inserta filas `PerfRollup` en DB.

**Si Redis no está disponible:** Loguea warning y retorna sin error.

---

### `aggregate_cost_hourly` — Agregación de costos

**Archivo:** `backend/app/tasks/telemetry.py`  
**Nombre completo:** `app.tasks.telemetry.aggregate_cost_hourly`  
**Trigger:** Beat — cada hora a los **:10 minutos**

| Parámetro | Valor |
|-----------|-------|
| Binding | Sí (`bind=True`) |
| `max_retries` | 3 |
| `countdown` | 60 segundos |
| Cola | Default |

**Qué hace:**
1. Drena la lista Redis `conico:cost_events` (hasta 100 000 items).
2. Agrupa por `(hora_redondeada, empresa_id)`.
3. Suma `total_cost_clp` y cuenta eventos.
4. Inserta filas `CostRollup` en DB.

**Si Redis no está disponible:** Retorna silenciosamente.

---

### `cleanup_old_rollups` — Limpieza de métricas antiguas

**Archivo:** `backend/app/tasks/telemetry.py`  
**Nombre completo:** `app.tasks.telemetry.cleanup_old_rollups`  
**Trigger:** Beat — **domingos a las 03:00 (Santiago)**

| Parámetro | Valor |
|-----------|-------|
| Binding | No |
| Reintentos | Sin configurar |
| Cola | Default |

**Qué hace:** Elimina filas `PerfRollup` y `CostRollup` con `hour < ahora - 90 días`.

---

### `archive_old_audit_logs` — Archivado de logs de auditoría

**Archivo:** `backend/app/tasks/audit_retention.py`  
**Nombre completo:** `app.tasks.audit_retention.archive_old_audit_logs`  
**Trigger:** Beat — **lunes a las 02:00 (Santiago)**

| Parámetro | Valor |
|-----------|-------|
| Binding | Sí (`bind=True`) |
| `max_retries` | 3 |
| `countdown` | 300 segundos (5 min) |
| Cola | Default |
| Retención | `settings.audit_log_retention_days` (default: 180 días) |

**Qué hace:**
1. Calcula el cutoff: `ahora - audit_log_retention_days`.
2. Procesa en lotes de 2 000 filas con `with_for_update(skip_locked=True)`.
3. Copia filas `AuditLog` a `AuditLogArchive`.
4. Elimina las filas originales.
5. Hace commit por cada lote.

**Resultado:** Retorna `{"archived": N}`.

---

## Agregar una nueva tarea periódica

1. Crear la función en `backend/app/tasks/<módulo>.py`:

```python
from app.celery_app import celery_app

@celery_app.task(bind=True, max_retries=3)
def mi_tarea_periodica(self):
    db = SessionLocal()
    try:
        # lógica
        db.commit()
    except Exception as exc:
        db.rollback()
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()
```

2. Registrar en el Beat schedule en `backend/app/celery_app.py`:

```python
"mi-tarea": {
    "task": "app.tasks.<módulo>.mi_tarea_periodica",
    "schedule": crontab(hour=9, minute=0),  # diario a las 09:00
},
```

3. Asegurarse de incluir el módulo en `include=[...]` del constructor `Celery(...)`.

---

## Monitoreo y depuración

| Herramienta | Comando |
|-------------|---------|
| Logs worker | `docker compose logs -f celery_worker` |
| Logs beat | `docker compose logs -f celery_beat` |
| Inspect activas | `celery -A app.celery_app inspect active` |
| Inspect registradas | `celery -A app.celery_app inspect registered` |
| Purge cola | `celery -A app.celery_app purge` |
| Flower (si instalado) | `celery -A app.celery_app flower --port=5555` |

Todas las tareas emiten logs con `logging.getLogger(__name__)`. Las de telemetría y audit_retention usan loguru adicionalmente. Las excepciones críticas se capturan via Sentry si `settings.sentry_dsn` está configurado.
