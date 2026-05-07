# Sistema de Auditoría — Internals

Referencia técnica del sistema de auditoría de Conico. Cubre la arquitectura de event listeners, el formato de diff, los modelos auditados, los campos excluidos, la API de consulta y la exportación CSV.

---

## Arquitectura general

El sistema tiene tres capas:

```
HTTP Request
     │
     ▼
AuditContextMiddleware          ← extrae user_id / IP / user-agent y los
     │                            expone vía ContextVar por duración del request
     ▼
FastAPI route / SQLAlchemy ORM
     │
     ▼
SQLAlchemy Session listeners    ← before_flush / after_flush_postexec /
     │                            after_commit / after_rollback
     ▼
audit_logs (tabla activa)       ← últimos 180 días
audit_log_archive (archivo)     ← filas movidas por la tarea Celery semanal
```

**Archivos clave:**

| Archivo | Rol |
|---------|-----|
| `backend/app/middleware/audit_context.py` | Middleware ASGI — propaga contexto del request |
| `backend/app/services/auditoria.py` | Listeners SQLAlchemy + registro idempotente |
| `backend/app/models/audit_log.py` | Modelo ORM `audit_logs` |
| `backend/app/models/audit_log_archive.py` | Modelo ORM `audit_log_archive` |
| `backend/app/api/auditoria.py` | Endpoints REST: list, export CSV, stats |
| `backend/app/tasks/audit_retention.py` | Tarea Celery de archivado semanal |

---

## Middleware: `AuditContextMiddleware`

**Ubicación:** `backend/app/middleware/audit_context.py`

Solo actúa en métodos mutantes (`POST`, `PATCH`, `PUT`, `DELETE`). Al entrar al request:

1. Lee el header `Authorization: Bearer <token>` → decodifica JWT → resuelve `user_id` vía DB (lazy lookup, una sesión efímera).
2. Lee `X-Forwarded-For` o `request.client.host` para obtener la IP real.
3. Lee `User-Agent` (truncado a 500 caracteres).
4. Almacena `{user_id, ip, user_agent}` en la `ContextVar` `_audit_context` para el tiempo de vida del request.

Los listeners leen el contexto vía `get_audit_context()`. Si la ContextVar está vacía (requests GET, tareas background, seeds), los logs quedan con `user_id=None`.

**Override para tests / jobs:** Se puede inyectar contexto directamente en `session.info`:

```python
session.info["audit_user_id"] = 42
session.info["audit_ip"] = "127.0.0.1"
session.info["audit_user_agent"] = "test"
```

Cuando alguna de esas claves existe en `session.info`, el middleware es ignorado.

---

## Listeners SQLAlchemy

**Ubicación:** `backend/app/services/auditoria.py` → `register_listeners()`

Se registran cuatro listeners contra la clase global `Session` (no contra una sesión específica):

| Evento | Qué hace |
|--------|----------|
| `before_flush` | Captura UPDATE y DELETE (estado `before` aún accesible). Acumula inserts pendientes en `session.info` para resolver PK post-flush. |
| `after_flush_postexec` | Resuelve inserts pendientes: ya tiene PKs asignadas. Escribe los `AuditLog` de acción `create`. |
| `after_commit` | Dispara invalidaciones de caché acumuladas durante el flush. |
| `after_rollback` | Descarta invalidaciones acumuladas. |

`register_listeners()` es idempotente — se puede llamar múltiples veces sin duplicar.  
`unregister_listeners()` existe solo para tests.

### Por qué dos eventos para INSERT

SQLAlchemy no asigna PKs autoincrement hasta ejecutar el INSERT en la DB. `before_flush` aún no tiene el `id` real → se acumula el objeto en `session.info["_audit_pending_inserts"]` → `after_flush_postexec` resuelve el id y escribe el log.

Para evitar que el propio `AuditLog` recién insertado vuelva a disparar un listener, `after_flush_postexec` establece `session.info["audit_disabled"] = True` durante el sub-add y lo restaura después.

---

## Formato diff (`diff_json`)

Todos los logs tienen el campo `diff_json` con la siguiente estructura según acción:

### `create`

```json
{
  "after": {
    "id": 123,
    "nombre": "Empresa Nueva",
    "rut": "76123456-7",
    "created_at": "2026-05-06T14:30:00+00:00"
  }
}
```

Solo contiene `after` — snapshot completo de columnas al momento de creación.

### `update`

```json
{
  "before": { "nombre": "Empresa Vieja", "email": "old@mail.com" },
  "after":  { "nombre": "Empresa Nueva", "email": "new@mail.com" },
  "changed": ["nombre", "email"]
}
```

Solo incluye los campos que cambiaron. `changed` es la lista de keys para búsqueda rápida.

### `delete`

```json
{
  "before": {
    "id": 99,
    "nombre": "Empresa Eliminada",
    "rut": "76999999-9"
  }
}
```

Solo contiene `before` — snapshot completo del registro antes de eliminarse.

### Tipos de valor serializados

| Tipo Python | Serialización JSON |
|-------------|-------------------|
| `None`, `bool`, `int`, `float`, `str` | Valor directo |
| `Decimal` | `"1234.56"` (string para preservar precisión) |
| `datetime` | `"2026-05-06T14:30:00+00:00"` (ISO 8601) |
| `date` | `"2026-05-06"` |
| `list` / `dict` | Recursivo |
| Otros | `repr()` |

---

## Modelos auditados

Los siguientes modelos generan registros automáticamente en cada `create`, `update` y `delete`:

| Modelo | Tabla | Notas |
|--------|-------|-------|
| `Cotizacion` | `cotizaciones` | |
| `CotizacionLinea` | `cotizacion_lineas` | |
| `NotaVenta` | `nota_ventas` | |
| `NotaVentaLinea` | `nota_venta_lineas` | |
| `Factura` | `facturas` | También invalida caché de reportes |
| `FacturaLinea` | `factura_lineas` | |
| `NotaCredito` | `notas_credito` | |
| `NotaCreditoLinea` | `nota_credito_lineas` | |
| `NotaDebito` | `notas_debito` | |
| `NotaDebitoLinea` | `nota_debito_lineas` | |
| `Boleta` | `boletas` | |
| `BoletaLinea` | `boleta_lineas` | |
| `GuiaDespacho` | `guias_despacho` | |
| `GuiaDespachoLinea` | `guia_despacho_lineas` | |
| `Producto` | `productos` | |
| `ListaPrecios` | `listas_precios` | |
| `ListaPreciosItem` | `lista_precios_items` | |
| `Empresa` | `empresas` | También invalida caché de reportes |
| `Cliente` | `clientes` | También invalida caché de reportes |
| `User` | `users` | |
| `PermissionOverride` | `permission_overrides` | |
| `SystemConfig` | `system_config` | |

Para agregar un nuevo modelo, añadir su classname a `_AUDITABLE_MODEL_NAMES` en `services/auditoria.py`.

---

## Campos sensibles excluidos

Los siguientes campos **nunca** aparecen en `diff_json`, independiente del modelo:

```python
SENSITIVE_FIELDS = {
    "password",
    "hashed_password",
    "password_hash",
    "jwt_secret",
    "secret_key",
    "totp_secret",
    "lioren_api_key",
    "lioren_token",
    "smtp_password",
    "refresh_token",
    "access_token",
    "api_key",
    "token",
}
```

La exclusión opera sobre el nombre de la columna ORM (`.key`), no sobre el nombre de la tabla. Si se agrega una columna sensible, incluirla en este set.

---

## API de auditoría

**Base URL:** `/api/audit`  
**Permiso requerido:** `usuarios:admin`

### `GET /api/audit` — listado paginado

```
GET /api/audit?entity_type=Factura&action=update&from_date=2026-04-01&to_date=2026-04-30&limit=50&offset=0
```

**Query params:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `user_id` | `int` | Filtrar por usuario que realizó la acción |
| `entity_type` | `string` | Classname del modelo (ej: `Factura`, `Cliente`) |
| `action` | `string` | `create`, `update` o `delete` |
| `entity_id` | `string` | PK de la entidad (como string) |
| `from_date` | `string` | ISO 8601 o `YYYY-MM-DD` (inclusive, inicio de día UTC) |
| `to_date` | `string` | ISO 8601 o `YYYY-MM-DD` (inclusive, fin de día 23:59:59 UTC) |
| `limit` | `int` | Registros por página. Default: 50. Máx: 200 |
| `offset` | `int` | Offset para paginación. Default: 0 |

**Respuesta:**

```json
{
  "items": [
    {
      "id": 4521,
      "user_id": 3,
      "user_name": "Ana López",
      "user_email": "ana@empresa.cl",
      "action": "update",
      "entity_type": "Factura",
      "entity_id": "88",
      "diff_json": {
        "before": { "monto_total": "100000" },
        "after":  { "monto_total": "120000" },
        "changed": ["monto_total"]
      },
      "ip": "192.168.1.5",
      "user_agent": "Mozilla/5.0 ...",
      "created_at": "2026-04-15T10:22:31+00:00"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

Los resultados se ordenan por `created_at DESC, id DESC`.

### `GET /api/audit/export.csv` — exportación CSV

Mismos parámetros de filtro que el listado (sin `limit`/`offset`). Devuelve un CSV con BOM UTF-8 (compatible con Excel).

**Columnas:** `id`, `created_at`, `user_id`, `user_name`, `user_email`, `action`, `entity_type`, `entity_id`, `ip`, `user_agent`, `diff_json`

El campo `diff_json` se serializa como JSON compacto en la celda CSV.

**Ejemplo con curl:**

```bash
curl -H "Authorization: Bearer <token>" \
  "https://crm.conico.juliocode.com/api/audit/export.csv?entity_type=Factura&from_date=2026-01-01" \
  -o auditoria_facturas.csv
```

### `GET /api/audit/stats` — estadísticas de retención

```json
{
  "active_rows": 14820,
  "archive_rows": 38500,
  "oldest_active": "2025-11-06T00:00:00+00:00",
  "retention_days": 180
}
```

---

## Retención y archivado

Los registros más antiguos que `retention_days` (por defecto **180 días**) se mueven semanalmente a la tabla `audit_log_archive` mediante la tarea Celery `archive_old_audit_logs`.

**Diferencias entre `audit_logs` y `audit_log_archive`:**

| | `audit_logs` | `audit_log_archive` |
|-|-------------|---------------------|
| FK a `users` | Sí (`ON DELETE SET NULL`) | No (users puede haberse eliminado) |
| Índices | entity, user_id, action, created_at | Mismos |
| Autoincrement PK | Sí | No (preserva id original) |

**Proceso de archivado (por lotes de 2.000 filas):**

1. Selecciona filas con `created_at < cutoff` con `SELECT ... FOR UPDATE SKIP LOCKED`.
2. Inserta en `audit_log_archive` (bulk).
3. Elimina las filas originales de `audit_logs`.
4. Commit por lote — si falla, reintenta hasta 3 veces con backoff de 5 minutos.

Para consultar el archivo no hay endpoint de API — acceder directamente a la DB o vía admin SQL.

---

## Invalidación de caché

Como efecto secundario del listener `before_flush`, los modelos con `empresa_id` acumulan qué endpoints de reporte deben invalidarse. En `after_commit` se llama `ReportCache.invalidate_pattern` por empresa:

| Modelo | Endpoints invalidados |
|--------|----------------------|
| `Factura` | `ventas`, `cobranza`, `margenes`, `dte`, `kpis`, `por_marca` |
| `NotaVenta` | `ventas`, `kpis` |
| `Cliente` | `ventas`, `cobranza`, `kpis` |

Para modelos sin `empresa_id` directo (ej: `Producto`, `OrdenCompra`), la invalidación se llama desde el API layer mediante `invalidate_cache_for_empresa(empresa_id, endpoints)`.

---

## Deshabilitar auditoría temporalmente

Para operaciones batch o seeds que no deben generar registros de auditoría:

```python
with SessionLocal() as db:
    db.info["audit_disabled"] = True
    # ... operaciones batch ...
    db.commit()
```

---

## Escribir logs manuales

Para eventos que no pasan por ORM (ej: login, logout, intentos fallidos):

```python
from app.services.auditoria import log_manual

log_manual(
    db,
    action="login",
    entity_type="User",
    entity_id=str(user.id),
    diff={"ip": request_ip},
)
db.commit()
```
