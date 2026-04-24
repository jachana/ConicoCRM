# Tareas y Recordatorios — Design Spec

**Fecha:** 2026-04-24
**Tier:** A (Roadmap CRM)
**Roadmap ref:** `docs/roadmap-crm.md` #5

## Objetivo

Módulo de tareas/recordatorios para convertir Conico en CRM completo: usuarios ven qué tienen que hacer, el sistema genera automáticamente recordatorios de eventos clave (cotización por vencer, factura vencida, etc.) y las tareas se vinculan a entidades (cliente/empresa/cotización/NV/factura/producto) para alimentar el Timeline (Tier A #4).

## Scope

**Incluye:**
- CRUD de tareas manuales con vinculación opcional a entidades.
- Auto-generación de tareas vía job Celery horario, con 6 reglas configurables por admin.
- Widget "Mis pendientes" permanente en sidebar + página `/tareas` con filtros.
- Integración en fichas de entidades (sección "Tareas relacionadas").
- Permisos granulares por rol.

**Explícitamente fuera:**
- Notificaciones por email (va en Roadmap #8).
- Push/websocket.
- Comentarios, subtareas, etiquetas.
- Recurrencia programada (ej. "cada lunes").

## Modelo de datos

### Tabla `tareas`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | PK | |
| `titulo` | `varchar(255)` NOT NULL | |
| `descripcion` | `text` nullable | |
| `due_date` | `date` NOT NULL | |
| `estado` | `varchar(20)` NOT NULL default `pendiente` | `pendiente` / `hecha` / `descartada` |
| `motivo_descarte` | `varchar(255)` nullable | requerido si `estado='descartada'` |
| `origen` | `varchar(20)` NOT NULL | `manual` / `auto` |
| `tipo_regla` | `varchar(40)` nullable | set si `origen='auto'` |
| `dedup_key` | `varchar(100)` nullable | para idempotencia auto-gen |
| `asignado_id` | FK `users.id` NOT NULL | `ON DELETE RESTRICT`, reasignado por hook al desactivar user |
| `creado_por_id` | FK `users.id` nullable | null = sistema |
| `cliente_id` | FK `clientes.id` nullable | `ON DELETE SET NULL` |
| `empresa_id` | FK `empresas.id` nullable | `ON DELETE SET NULL` |
| `cotizacion_id` | FK `cotizaciones.id` nullable | `ON DELETE SET NULL` |
| `nota_venta_id` | FK `notas_venta.id` nullable | `ON DELETE SET NULL` |
| `factura_id` | FK `facturas.id` nullable | `ON DELETE SET NULL` |
| `producto_id` | FK `productos.id` nullable | `ON DELETE SET NULL` |
| `completada_at` | timestamptz nullable | |
| `completada_por_id` | FK `users.id` nullable | |
| `created_at` | timestamptz default now | |
| `updated_at` | timestamptz | `onupdate` |

**Constraints:**

- `CHECK`: máximo UNA de `{cliente_id, empresa_id, cotizacion_id, nota_venta_id, factura_id, producto_id}` puede estar seteada. Ninguna también es válido (tarea libre).
- `UNIQUE (dedup_key) WHERE estado='pendiente'` — índice parcial que permite idempotencia en auto-gen y recreación tras descarte.
- `INDEX (asignado_id, estado, due_date)` — query principal "mis pendientes ordenadas".

**Prioridad derivada** (calculada en response, no en DB):

- `vencida` si `due_date < today` AND `estado='pendiente'`
- `hoy` si `due_date == today`
- `futura` si `due_date > today`

### Tabla `reglas_tarea`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | PK | |
| `tipo` | `varchar(40)` UNIQUE NOT NULL | ej. `cotizacion_vence` |
| `activa` | `boolean` NOT NULL default `true` | |
| `offset_dias` | `int` NOT NULL | |
| `asignado_rol` | `varchar(20)` NOT NULL | `vendedor` / `admin` / `owner` |

Seed inicial con 6 reglas (ver sección "Auto-generación").

## API

Todos los endpoints bajo `/api/tareas`. Auth requerida en todos.

### Listado

**`GET /api/tareas`** — lista paginada.

Query params:
- `asignado_id` (default: current user; admin puede pasar otro)
- `estado` (default `pendiente`)
- `prioridad_derivada` (`vencida` / `hoy` / `futura`)
- `cliente_id` / `empresa_id` / `cotizacion_id` / `nota_venta_id` / `factura_id` / `producto_id`
- `origen` (`manual` / `auto`)
- `page`, `page_size`

Orden default: `estado='pendiente'` primero, luego `due_date` asc.

**`GET /api/tareas/mis-pendientes`** — widget sidebar.

Retorna: `{ vencidas: N, hoy: N, futuras: N, total: N, tareas: [...top 5 por due_date] }`. Sin paginación.

### CRUD

- **`POST /api/tareas`** — crear manual.
  Body: `titulo`, `descripcion?`, `due_date`, `asignado_id`, `<entidad>_id?` (cualquier FK).
  Validación: vendedor solo `asignado_id = self`; admin a cualquiera. Rol requiere `tareas:create`.

- **`GET /api/tareas/{id}`** — detalle. Owner o admin.

- **`PATCH /api/tareas/{id}`** — editar campos.
  Owner (solo si `origen='manual'`) o admin.
  Si `origen='auto'`: `titulo`/`descripcion`/`tipo_regla`/`dedup_key` son read-only; solo `due_date`/`asignado_id` editables (y solo admin).

- **`DELETE /api/tareas/{id}`** — solo `origen='manual'` y solo creador/admin. Las `auto` se descartan, no se eliminan.

### Acciones

- **`POST /api/tareas/{id}/completar`** — set `estado='hecha'`, `completada_at`, `completada_por_id`. Owner o admin.

- **`POST /api/tareas/{id}/descartar`** — body: `motivo` (requerido). Set `estado='descartada'`. Owner o admin.

- **`POST /api/tareas/{id}/reasignar`** — body: `asignado_id`. Solo admin. Requiere `tareas:admin`.

### Config reglas (admin)

- **`GET /api/tareas/reglas`** — lista todas. Requiere `tareas:admin`.

- **`PATCH /api/tareas/reglas/{tipo}`** — body: `activa?`, `offset_dias?`, `asignado_rol?`. Requiere `tareas:admin`.

### Timeline (consumido por #4)

- **`GET /api/tareas/timeline/{entidad_tipo}/{entidad_id}`** — `entidad_tipo` ∈ {`cliente`, `empresa`, `cotizacion`, `nota_venta`, `factura`, `producto`}. Retorna tareas en cualquier estado vinculadas a la entidad.

### Permisos (nuevo módulo `tareas`)

| Permiso | Acción | Default |
|---|---|---|
| `tareas:view` | ver propias | todos |
| `tareas:view_all` | ver todas + filtro por asignado | solo admin |
| `tareas:create` | crear manuales | todos |
| `tareas:admin` | config reglas, reasignar, descarte forzado | solo admin |

## Auto-generación

Job Celery `generar_tareas_automaticas` corre cada hora (`crontab(minute=0)`). Idempotente vía `dedup_key`.

### Reglas seed (6)

| `tipo` | Condición | `dedup_key` | `asignado_rol` default | `offset_dias` default | Título generado |
|---|---|---|---|---|---|
| `cotizacion_vence` | Cotización `estado='abierta'` y `fecha_expiracion - today ≤ offset_dias` | `cotizacion_vence:{id}` | `owner` | 2 | `"Cotización #{numero} vence en {N} días"` |
| `factura_vencida` | Factura `estado='emitida'` y `fecha_vencimiento < today - offset_dias` | `factura_vencida:{id}` | `owner` | 1 | `"Factura #{numero} vencida hace {N} días"` |
| `aprobacion_pendiente` | `AprobacionCredito` o `AprobacionMargen` en `pendiente` hace ≥ `offset_dias` | `aprobacion_{credito|margen}:{id}` | `admin` | 1 | `"Aprobación pendiente desde hace {N} días"` |
| `nv_despachada_sin_avanzar` | NV `estado='despachada'` hace ≥ `offset_dias` días sin pasar a `entregada`/`pagada` | `nv_atascada:{id}` | `owner` | 3 | `"NV #{numero} despachada hace {N}d sin avanzar"` |
| `cliente_sin_actividad` | Cliente sin cotizaciones ni NV en últimos `offset_dias` días | `cliente_inactivo:{id}` | `owner` (último vendedor que le cotizó; fallback primer admin) | 30 | `"Cliente {nombre} sin actividad hace {N}d"` |
| `stock_bajo_minimo` | Producto con `stock_actual < stock_minimo` | `stock_bajo:{producto_id}` | `admin` | 0 | `"Stock bajo: {nombre} ({stock_actual}/{stock_minimo})"` |

### Resolución de `asignado_id`

- `owner`: FK `vendedor_id` de la entidad. Si null o user inactivo → primer admin activo (ordenado por `id` asc).
- `vendedor`: primer vendedor activo (fallback primer admin activo).
- `admin`: primer admin activo (ordenado por `id` asc, estable).

### Mecánica

```python
def generar_tareas_automaticas():
    for regla in reglas.filter(activa=True):
        # 1. Generar faltantes
        candidatos = query_candidatos(regla)  # filtra según condición
        if len(candidatos) > 500:
            log.warning(f"Regla {regla.tipo} excede 500 candidatos, omitida")
            continue
        for entidad in candidatos:
            key = f"{regla.tipo}:{entidad.id}"
            if not existe_pendiente(key):
                crear_tarea(regla, entidad, key)

        # 2. Auto-descarte de obsoletas
        for tarea in Tarea.filter(origen='auto', estado='pendiente', tipo_regla=regla.tipo):
            if not sigue_aplicando(tarea, regla):
                descartar(tarea, motivo="evento resuelto")
```

### Auto-cierre por regla

| Regla | Condición que auto-descarta |
|---|---|
| `cotizacion_vence` | Cotización pasa a `cerrada_fv` / `rechazada` |
| `factura_vencida` | Factura pasa a `pagada` o `anulada` |
| `aprobacion_pendiente` | Aprobación pasa a `aprobada` / `denegada` |
| `nv_despachada_sin_avanzar` | NV pasa a `entregada` / `pagada` / `cancelada` |
| `cliente_sin_actividad` | Cliente registra nueva cotización o NV |
| `stock_bajo_minimo` | Producto vuelve a `stock_actual ≥ stock_minimo` |

Tareas `origen='manual'` **nunca** se auto-descartan.

## UI

### Rutas nuevas

- `/tareas` — página principal
- `/admin/tareas/config` — config de reglas (requiere `tareas:admin`)

### `/tareas` — página principal

Layout igual al resto del proyecto (sidebar + contenido).

**Tabs top:** `Pendientes` (default, con badge count) / `Hechas` / `Descartadas`.

**Filtros (colapsable):**
- Asignado a (admin ve dropdown; vendedor no ve filtro)
- Origen (`manual` / `auto` / todas)
- Vinculado a (tipo entidad + autocomplete)
- Rango `due_date`

**Tabla:**

| Prioridad | Título | Vinculado a | Asignado | Vence | Acciones |
|---|---|---|---|---|---|
| 🔴 vencida / 🟡 hoy / ⚪ futura | "Cotización #12345 vence en 2 días" | link clickeable a entidad | avatar + nombre | `DD/MM/YYYY` | ✓ Completar · ✕ Descartar · ✎ Editar |

Click en fila → drawer lateral con detalle completo + acciones.

**Botón "+ Nueva tarea"** (top derecha) → modal:
- Título (req)
- Descripción (textarea opcional)
- Fecha vencimiento (date picker, default `tomorrow()`)
- Asignar a (dropdown admin; vendedor ve su propio nombre disabled)
- Vincular a (radio: ninguno / cliente / empresa / cotización / NV / factura / producto + autocomplete dinámico según tipo)

### Widget sidebar "Mis pendientes"

Componente permanente bajo nav:

```
┌─ Mis pendientes ─┐
│ 🔴 3 vencidas    │
│ 🟡 5 hoy         │
│ ⚪ 12 próximas   │
│  [Ver todas →]   │
└──────────────────┘
```

Fuente: `GET /api/tareas/mis-pendientes`. Click en línea → `/tareas` con filtro aplicado. Refresh al montar + polling cada 5 min.

### Timeline en fichas

En `CotizacionDetalle`, `NotaVentaDetalle`, `FacturaDetalle`, `ClienteDetalle`, `EmpresaDetalle`, `ProductoDetalle` — nueva sección colapsable **"Tareas relacionadas"**:

- Lista tareas vinculadas (cualquier estado).
- Botón "+ Crear tarea para esta [entidad]" → modal pre-poblado con vínculo fijo (no editable).

### Config reglas `/admin/tareas/config`

Tabla editable:

| Regla | Activa | Días offset | Asignar a |
|---|---|---|---|
| Cotización vence | `[toggle]` | `[input 2]` | `[select vendedor/admin/owner]` |
| Factura vencida | ... | ... | ... |
| ... 6 filas ... | | | |

Botón "Guardar cambios" al final. Cambios aplican en la próxima corrida del job.

### Permisos visuales

- Vendedor: `/tareas` forzado a `asignado_id=self`. Sin dropdown asignado. Botón "Reasignar" oculto.
- Admin: ve todo, reasigna, configura reglas.
- Botón "Descartar": solo si `origen='auto'` O si user es admin.

## Edge cases

| Caso | Manejo |
|---|---|
| User asignado desactivado | Hook en `PATCH /users/{id}` con `is_active=false`: reasigna tareas `pendiente` a primer admin activo. |
| Entidad vinculada eliminada | FK `ON DELETE SET NULL`. Si `origen='auto'` y queda sin vínculo, siguiente corrida la descarta con motivo "entidad eliminada". |
| Job duplicado (dev + beat) | `dedup_key` unique parcial (`WHERE estado='pendiente'`) garantiza idempotencia a nivel DB. |
| Reasignación inválida | Validación backend: `asignado_id` debe ser user activo; 422 si no. Vendedor reasignando → 403. |
| Muchos candidatos (stock bajo) | Safeguard: skip regla si `len(candidatos) > 500`; log warning. |
| Timezone `due_date` | `Date` puro; comparaciones vs `date.today()` en TZ del servidor (convención proyecto). |

## Testing

Pytest, convención proyecto (backend-only, no tests de frontend).

- **`tests/test_tareas_model.py`**: CHECK constraint máx 1 FK, dedup unique parcial, cálculo prioridad derivada.
- **`tests/test_tareas_api.py`**: CRUD por rol (admin/vendedor), `/mis-pendientes`, cada filtro, `completar`/`descartar`/`reasignar`, permisos.
- **`tests/test_tareas_auto.py`**: cada una de las 6 reglas — happy path, idempotencia (correr 2× no duplica), auto-cierre cuando evento se resuelve. `freezegun` para mock de `date.today()`.
- **Integration**: cotización `fecha_expiracion = today + 2d` → job → tarea creada. Luego `estado='cerrada_fv'` → job → tarea descartada con motivo "evento resuelto".

## Migración

Una migración Alembic única:

1. Crear tabla `tareas` con columnas, FKs, CHECK, índice parcial en `dedup_key`, índice `(asignado_id, estado, due_date)`.
2. Crear tabla `reglas_tarea`.
3. Seed 6 reglas con defaults (INSERT en `op.execute` dentro de `upgrade()`).
4. Agregar permisos `tareas:view` / `tareas:view_all` / `tareas:create` / `tareas:admin` a seed permissions.
5. Otorgar:
   - Todos los roles: `tareas:view`, `tareas:create`.
   - Solo admin: `tareas:view_all`, `tareas:admin`.

## Celery

Registrar en `celery_app`:

```python
# app/tasks/tareas.py
@celery.task
def generar_tareas_automaticas():
    ...
```

Schedule en `beat_schedule`:

```python
"tareas-auto": {
    "task": "app.tasks.tareas.generar_tareas_automaticas",
    "schedule": crontab(minute=0),
}
```
