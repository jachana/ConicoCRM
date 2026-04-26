# Phase 1: Guía de Despacho 52 — Backend - Research

**Researched:** 2026-04-26
**Domain:** DTE 52 Backend (FastAPI + SQLAlchemy + Celery + Lioren v1)
**Confidence:** HIGH (codebase verified) / LOW (Lioren payload DTE 52 — no docs API accesibles)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- D-01 a D-35: todas las decisiones de diseño de CONTEXT.md son locked. Ver archivo para detalle completo.
- Modelo `GuiaDespacho` + `GuiaDespachoLinea` mirrorean `Boleta`/`BoletaLinea`.
- Numeración: reutilizar `_next_numero(db, "guia_despacho_last_id")` de `app/api/dte.py`.
- Pipeline DTE: extender `DteEmision` con FK `guia_despacho_id`, tipo `"052"`.
- Stock: NO descuenta stock (invariante D-13).
- Anulación: NC tipo 61 con `guia_despacho_id`; `guia.estado='anulada'` solo cuando NC aceptada.
- PDF: WeasyPrint, template `guia_despacho.html` (copiar `boleta.html`).
- Email: `enviar_guia_despacho` en `email.py` (copiar `enviar_boleta`).
- Permisos: módulo `"guias_despacho"` en `MODULES`.
- Auditoría: agregar `"GuiaDespacho"`, `"GuiaDespachoLinea"` a `_AUDITABLE_MODEL_NAMES`.
- Migración Alembic monolítica (D-34): 6 pasos, incluyendo drop+create de check constraint.

### Claude's Discretion

- Naming exacto de campos Lioren para `tipo_dte: 52` — researcher debe confirmar (HIGH RISK, ver sección Lioren).
- Wording exacto del asunto/cuerpo del email.
- `pytest.mark.smoke` para test concurrencia — planner decide si entra en sprint.

### Deferred Ideas (OUT OF SCOPE)

- `POST /guias-despacho/{id}/anular` endpoint dedicado.
- Bulk emisión.
- Folio CAF management.
- Test Postgres-only de concurrencia (puede diferirse con TODO explícito).
- Reapertura de guía anulada.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DTE-01 | Emitir Guía de Despacho DTE 52 con numeración correlativa, vínculo NV opcional, motivos 1..9 | Modelo + schema + `_next_numero` reutilizable verificados |
| DTE-02 | Enviar a SII vía Lioren con webhook HMAC + polling Celery | Pipeline existente extendible; payload DTE 52 necesita validación (ver Lioren section) |
| DTE-03 | PDF WeasyPrint + email SMTP | `generar_pdf_boleta`/`enviar_boleta` patrón verificado y replicable |
| DTE-04 | Anular con NC tipo 61 vinculada (`guia_despacho_id`) | Extensión modelo `NotaCredito` verificada |
| DTE-06 | Permisos `guias_despacho:view/create/edit/delete` por rol | `MODULES` + `_DEFAULT` patrón verificado |
| DTE-07 | Auditoría `GuiaDespacho` + `GuiaDespachoLinea` en audit_log con diff | `_AUDITABLE_MODEL_NAMES` mecanismo verificado |
</phase_requirements>

---

## Summary

Esta fase replica el patrón boleta DTE 39/41 (W1-04, `HEAD 2481d8e`) para Guías de Despacho DTE 52. El 90% del trabajo es copia mecánica con adaptaciones: modelo + schema + router + migración + permisos + auditoría + PDF/email + extensión del pipeline DTE existente. La mayor incertidumbre es el payload exacto de Lioren v1 para `tipo_dte: 52` — la API no es pública sin credenciales y no existe documentación publicada con los field names JSON. La hipótesis del CONTEXT.md D-11 (campos `ind_traslado`, `destino: {direccion, comuna}`) está basada en el patrón SII XML canónico (IndTraslado, DirDest, CmunDest) pero DEBE validarse contra el ambiente sandbox de Lioren con las credenciales reales antes de considerar `build_guia_payload` terminado.

Adicionalmente, la Resolución Exenta N°154 del SII introdujo nuevos campos obligatorios para guías de despacho que transportan mercaderías físicas (conductor, patente, fechas salida/llegada). Estos campos pueden o no ser requeridos por Lioren v1 según su nivel de abstracción — planner debe contemplar una tarea de validación sandbox antes del merge.

**Primary recommendation:** Implementar en el orden del 8-step de STRUCTURE.md (modelo → schema → router → main.py → permissions → migration → auditoria → tests). La migración Alembic es el paso más riesgoso (drop+create check constraint sobre tabla con datos reales) — debe probarse en SQLite + Postgres antes de merge.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CRUD GuiaDespacho | API / Backend | DB / Storage | Router FastAPI + SA ORM |
| Numeración correlativa | DB / Storage | API / Backend | SELECT FOR UPDATE sobre `system_config` |
| Payload DTE Lioren | API / Backend | — | `DteService.build_guia_payload` en `services/dte_service.py` |
| Envío a SII | Celery Worker | API / Backend | `emit_dte` task polimórfica |
| Polling / Webhook | Celery Worker | API / Backend | `poll_dte_status` + `POST /api/dte/webhook` |
| Estado anulación | API / Backend | DB / Storage | `_sync_dte_estado` cuando NC aceptada |
| PDF | API / Backend | — | WeasyPrint síncrono en request handler |
| Email | API / Backend | — | SMTP síncrono en request handler |
| Auditoría | SA Event Listener | DB / Storage | `before_flush` hook, zero-code adicional |
| Permisos | API / Backend | — | `require_permission("guias_despacho", action)` |

---

## Standard Stack

### Core (todos verificados en codebase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | existente | Router HTTP | Stack del proyecto |
| SQLAlchemy 2.0 | existente | ORM declarativo | Stack del proyecto |
| Alembic | existente | Migraciones DB | Stack del proyecto |
| Pydantic v2 | existente | DTOs + validación | Stack del proyecto |
| Celery | existente | Tasks asíncronas | `emit_dte`, `poll_dte_status` |
| httpx | existente | Llamadas Lioren | `DteService.emit()` |
| WeasyPrint 62.3 | existente | PDF | `generar_pdf_boleta` patrón |
| Jinja2 | existente | Templates HTML→PDF | `boleta.html` patrón |
| smtplib (stdlib) | — | Email SMTP | `enviar_boleta` patrón |

[VERIFIED: codebase grep + requirements.txt]

### No hay librerías nuevas a instalar

Esta fase NO requiere nuevas dependencias — todo reutiliza el stack existente.

---

## Architecture Patterns

### Flujo de datos: crear → emitir → sincronizar

```
POST /api/guias-despacho/
    ↓ _asignar_numero_guia_despacho() → SELECT FOR UPDATE system_config
    ↓ GuiaDespacho + GuiaDespachoLinea → db.flush()
    ↓ _calcular_lineas_y_totales_guia()
    ↓ # NO descontar_stock (D-13)
    ↓ DteEmision(tipo="052", guia_despacho_id=...) → db.flush()
    ↓ guia.dte_estado = "pendiente" → db.commit()
    ↓ emit_dte.delay(emision.id) → Celery queue

Celery worker:
    emit_dte(emision_id)
        ↓ _process_emit: elif emision.guia_despacho_id → build_guia_payload()
        ↓ svc.emit(payload) → POST /v1/documentos Lioren
        ↓ emision.track_id, .estado="procesando"
        ↓ _sync_dte_estado → guia.dte_estado = "procesando"
        ↓ db.commit()

Webhook POST /api/dte/webhook:
    ↓ _lioren_to_estado(data["estado"])
    ↓ _sync_dte_estado(db, emision, nuevo_estado)
        ↓ elif emision.guia_despacho_id:
            ↓ guia.dte_estado = nuevo_estado
            ↓ if nuevo_estado == "aceptada" and nc.guia_despacho_id:
                ↓ guia.estado = "anulada"  # solo si NC tiene guia FK
```

### Estructura de archivos nuevos / modificados

```
backend/app/
├── models/guia_despacho.py          # NUEVO — GuiaDespacho + GuiaDespachoLinea
├── schemas/guia_despacho.py         # NUEVO — Create/Update/Out/ListOut
├── api/guias_despacho.py            # NUEVO — router CRUD + pdf + email
├── api/dte.py                       # MODIFICAR — add emitir_guia_despacho
├── services/dte_service.py          # MODIFICAR — add build_guia_payload()
├── services/pdf.py                  # MODIFICAR — add generar_pdf_guia_despacho()
├── services/email.py                # MODIFICAR — add enviar_guia_despacho()
├── services/auditoria.py            # MODIFICAR — add "GuiaDespacho", "GuiaDespachoLinea"
├── tasks/dte.py                     # MODIFICAR — add elif guia_despacho_id branches
├── core/permissions.py              # MODIFICAR — add "guias_despacho" to MODULES + _DEFAULT
├── main.py                          # MODIFICAR — include_router guias_despacho
├── models/dte_emision.py            # MODIFICAR — add guia_despacho_id FK + check constraint
├── models/nota_credito.py           # MODIFICAR — add guia_despacho_id FK
├── schemas/dte.py                   # MODIFICAR — NotaCreditoCreate += guia_despacho_id + XOR validator
└── templates/guia_despacho.html     # NUEVO — copiar boleta.html + adaptar
migrations/versions/
└── XXXXXXXXXXXX_add_guias_despacho.py  # NUEVO — migración monolítica D-34
tests/
├── conftest.py                      # MODIFICAR — add import app.models.guia_despacho noqa:F401
└── test_guias_despacho.py           # NUEVO — tests D-27
```

### Pattern 1: Calcular líneas y totales (precio NETO, no bruto como boleta)

**Diferencia crítica respecto a boleta:**

```python
# Source: backend/app/api/boletas.py:_calcular_lineas_y_totales [VERIFIED]
# En boleta: precio_unitario es BRUTO (precio al público con IVA incluido)
# bruto_unit = linea.precio_unitario  # precio bruto
# neto = bruto / (1 + 0.19)  # se divide para obtener neto

# Para guía de despacho: se recomienda precio NETO (igual que factura)
# ya que la guía no es un comprobante de pago al consumidor
# build_factura_payload usa int(l.valor_neto) — ver dte_service.py:53
# build_boleta_payload usa int(l.precio_unitario) — precio bruto
```

[ASSUMED] — La guía 52 puede ser emitida con precio bruto (como boleta) o neto (como factura). La decisión del CONTEXT.md no especifica explícitamente si el precio ingresado en la UI será bruto o neto. El patrón más común para B2B (clientes RUT) es precio neto. **Planner debe decidir**: si precio_unitario en `GuiaDespachoLineaCreate` es bruto (como boleta) o neto (como factura). La boleta lo hace bruto porque es consumidor final; la guía se emite también a empresas. Recomendación: seguir el patrón boleta (bruto) para consistencia con D-03, ya que el cálculo es idéntico. El campo en el modelo es `precio_unitario` y los totales calculados (`total_neto`, `iva`, `total_linea`) se pueden derivar igual que `_calcular_lineas_y_totales` de boleta.

[VERIFIED: backend/app/api/boletas.py:43-72, backend/app/services/dte_service.py:165-195]

### Pattern 2: Numeración correlativa (VERIFICADO, reutilizar tal cual)

```python
# Source: backend/app/api/dte.py:25-33 [VERIFIED]
def _next_numero(db: Session, key: str) -> int:
    cfg = db.query(SystemConfig).filter_by(key=key).with_for_update().first()
    if not cfg:
        cfg = SystemConfig(key=key, value="0")
        db.add(cfg)
        db.flush()
    numero = int(cfg.value) + 1
    cfg.value = str(numero)
    return numero

# Uso en guias_despacho.py:
# numero = _next_numero(db, "guia_despacho_last_id")
# La seed en migración D-34 inicializa el contador en 0.
```

[VERIFIED: backend/app/api/dte.py:25-33] — `with_for_update()` confirmado. Importar desde `app.api.dte` en `guias_despacho.py` (igual que `boletas.py:12` que ya lo hace así).

### Pattern 3: `_calcular_lineas_y_totales_guia` (adaptar de boleta)

```python
# Adaptar de backend/app/api/boletas.py:43-72 [VERIFIED]
def _calcular_lineas_y_totales_guia(guia: GuiaDespacho) -> None:
    # Guía admite líneas afectas Y exentas (D-03)
    # IVA 19% solo en líneas no exentas
    # precio_unitario es BRUTO (como boleta) — ver [ASSUMED] arriba
    tasa = Decimal("0.19")
    for linea in guia.lineas:
        bruto = linea.precio_unitario * linea.cantidad * (1 - linea.descuento_pct/100)
        if linea.exenta:
            neto = bruto; iva_linea = Decimal("0")
        else:
            neto = bruto / (1 + tasa)
            iva_linea = bruto - neto
        linea.total_neto = neto.quantize(Decimal("0.01"))
        linea.iva = iva_linea.quantize(Decimal("0.01"))
        linea.total_linea = (neto + iva_linea).quantize(Decimal("0.01"))
    guia.total_neto = sum(l.total_neto for l in guia.lineas)
    guia.total_iva = sum(l.iva for l in guia.lineas)
    guia.total = sum(l.total_linea for l in guia.lineas)
```

### Pattern 4: Extensión `_sync_dte_estado` (verificado, agregar rama)

```python
# Source: backend/app/tasks/dte.py:27-48 [VERIFIED]
# Agregar rama ANTES del else final:
elif emision.guia_despacho_id:
    guia = db.get(GuiaDespacho, emision.guia_despacho_id)
    if guia:
        guia.dte_estado = estado
        # D-16: si estado=="aceptada", verificar si hay NC vinculada
        if estado == "aceptada":
            nc = db.query(NotaCredito).filter_by(
                guia_despacho_id=guia.id, dte_estado="aceptada"
            ).first()
            if nc:
                guia.estado = "anulada"
        # D-12: NO revertir stock (a diferencia de boleta)
        # Guía 52 no tiene impacto de inventario (D-13)
```

**LANDMINE:** En `_sync_dte_estado` el branch de boleta llama `revertir_stock_boleta` cuando `estado=="rechazada"`. El branch de guía NO debe hacer esto. Es crítico no copiar esa lógica. [VERIFIED: backend/app/tasks/dte.py:40-48]

### Pattern 5: Extensión `_process_emit` (verificado, agregar rama)

```python
# Source: backend/app/tasks/dte.py:51-78 [VERIFIED]
# Agregar rama:
elif emision.guia_despacho_id:
    doc = db.query(GuiaDespacho).options(
        joinedload(GuiaDespacho.lineas),
        joinedload(GuiaDespacho.cliente),
    ).filter_by(id=emision.guia_despacho_id).first()
    payload = svc.build_guia_payload(doc, db)
```

### Anti-Patterns a Evitar

- **No llamar `descontar_stock_boleta` ni `revertir_stock_boleta`** en ningún código de guía (D-13). Agregar comentario inline `# Guía DTE 52 NO descuenta stock — ver D-13 / docs/architecture.md`.
- **No crear endpoint `POST /guias-despacho/{id}/anular`** (D-17 diferido). Solo la primitiva: NC con `guia_despacho_id`.
- **No copiar `_validar_boleta_41`** — la guía no tiene tipo DTE 41 (es siempre tipo 52 de SII). La guía SÍ admite líneas exentas y afectas en el mismo documento.
- **No importar `descontar_stock_boleta`** en `guias_despacho.py` ni en `tasks/dte.py` para el branch de guía.
- **No usar `Depends(get_db)` separado** — siempre usar `require_permission("guias_despacho", action)` unpack: `current_user, db = perms`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Numeración correlativa concurrente | `MAX(numero)+1` o contador local | `_next_numero(db, key)` de `app/api/dte.py` | Ya tiene `SELECT FOR UPDATE` probado |
| Payload SII DTE | XML propio | `DteService.build_guia_payload()` + `svc.emit()` | Lioren abstrae CAF, firma XML, envío |
| Webhook signature | Validación custom | `svc.validate_webhook_signature()` | Ya implementado con `hmac.compare_digest` |
| PDF generation | HTML hardcodeado | WeasyPrint + Jinja2 template | Consistente con todos los otros documentos |
| Email SMTP | MIME manual | `enviar_guia_despacho()` copiando `enviar_boleta` | Ya tiene STARTTLS, `EmailNotConfiguredError` |
| Auditoría diff | Log custom | `_AUDITABLE_MODEL_NAMES` whitelist | Listener global ya funciona — zero code |
| Permisos RBAC | `if role == "admin"` inline | `require_permission("guias_despacho", action)` | Evita split permission layer (CONCERNS.md CC-02) |

---

## Lioren v1 Payload — DTE 52

### Estado de investigación

**La API de Lioren v1 NO es pública sin credenciales.** La documentación en `lioren.cl/docs` está detrás de autenticación y no fue posible acceder al schema JSON para `tipo_dte: 52` en esta sesión de investigación.

### Hipótesis basada en SII XML canónico y código existente

El codebase muestra el patrón para boleta (`build_boleta_payload`), que usa `referencias: [{tipo: "PATENTE", valor: patente}]` para datos extra. El SII XML canónico para DTE 52 usa:

| XML SII | Hipótesis campo JSON Lioren | Descripción |
|---------|----------------------------|-------------|
| `IndTraslado` | `ind_traslado` (int 1..9) | Motivo de traslado |
| `DirDest` | `destino.direccion` | Dirección destino |
| `CmunDest` | `destino.comuna` | Comuna destino |
| `CiudadDest` | `destino.ciudad` | Ciudad destino |
| `Patente` | `referencias: [{tipo: "PATENTE", valor: ...}]` o `transporte.patente` | Patente vehículo |

[ASSUMED] — Basado en: (1) patrón `referencias: [{tipo: "PATENTE"}]` de `build_boleta_payload`; (2) nombres de campo camelCase→snake_case que Lioren aplica consistentemente (ej: `monto_neto`, `tasa_iva`); (3) documentación SII XML. Los field names exactos DEBEN verificarse con sandbox Lioren.

### Resolución Exenta N°154 SII (impacto)

[CITED: https://www.webfactura.cl/blog/resolucion-exenta-154-sii/] — Esta resolución hizo **obligatorios** los siguientes campos XML para guías que transportan mercaderías físicas:
- `RUTChofer`, `NombreChofer`, `DirDest`, `CmnaDest`, `CiudadDest`
- `FchSalida`, `HraSalida`, `Patente`

**Implicación:** Lioren puede o no exigir estos campos en su payload JSON dependiendo de su versión de abstracción. Si los requiere, `build_guia_payload` necesitará campos adicionales en el modelo o como parámetros opcionales. El CONTEXT.md D-02 no incluye `patente_vehiculo`, `rut_chofer`, `nombre_chofer` — planner debe contemplar como extensión futura o verificar con sandbox.

### Estructura hipotética de `build_guia_payload`

```python
# Source: hipótesis basada en build_boleta_payload [ASSUMED]
# Validar contra Lioren sandbox antes de merge
def build_guia_payload(self, guia, db: Session) -> dict:
    cfg = _get_config(db)
    receptor = {}
    if guia.cliente:
        receptor = {
            "rut": guia.cliente.rut or "",
            "razon_social": guia.cliente.nombre,
            "giro": "",
            "direccion": guia.cliente.direccion_despacho or "",
            "ciudad": guia.cliente.comuna or "",
            "comuna": guia.cliente.comuna or "",
        }

    detalle = [
        {
            "nombre": l.descripcion,
            "cantidad": float(l.cantidad),
            "precio_unitario": int(l.precio_unitario),  # bruto o neto — ver [ASSUMED]
            "descuento_porcentaje": float(l.descuento_pct or 0),
            "exenta": bool(l.exenta),
        }
        for l in guia.lineas
    ]

    payload = {
        "tipo_dte": 52,
        "fecha_emision": (guia.fecha or date.today()).isoformat(),
        "emisor": self._emisor(cfg),
        "receptor": receptor,
        "detalle": detalle,
        "totales": {
            "monto_neto": int(guia.total_neto),
            "tasa_iva": 19,
            "iva": int(guia.total_iva),
            "monto_total": int(guia.total),
        },
        # Campos específicos DTE 52 — nombres [ASSUMED]:
        "ind_traslado": guia.motivo_traslado,  # int 1..9
        "destino": {
            "direccion": guia.direccion_destino or "",
            "comuna": guia.comuna_destino or "",
        },
    }
    return payload
```

**Tarea de validación requerida:** Antes de considerar `emitir_guia_despacho` como terminado, ejecutar `svc.emit(payload)` contra el sandbox Lioren y verificar que (a) no devuelve error 422 por campos faltantes, (b) el track_id se obtiene correctamente. Documentar los field names reales en un comentario inline.

---

## Migración Alembic Monolítica — Shape Exacto

### Check constraint con 5 FKs (PostgreSQL)

El constraint actual (4 FKs) está en `dte_emision.py:11-16` y la migración W1-04 `z5a6b7c8d9e0`:

```python
# Constraint ACTUAL (4 FKs): [VERIFIED backend/app/models/dte_emision.py:10-16]
"(CASE WHEN factura_id IS NOT NULL THEN 1 ELSE 0 END) + "
"(CASE WHEN nota_credito_id IS NOT NULL THEN 1 ELSE 0 END) + "
"(CASE WHEN nota_debito_id IS NOT NULL THEN 1 ELSE 0 END) + "
"(CASE WHEN boleta_id IS NOT NULL THEN 1 ELSE 0 END) = 1"

# Constraint NUEVO (5 FKs) — agregar guia_despacho_id:
"(CASE WHEN factura_id IS NOT NULL THEN 1 ELSE 0 END) + "
"(CASE WHEN nota_credito_id IS NOT NULL THEN 1 ELSE 0 END) + "
"(CASE WHEN nota_debito_id IS NOT NULL THEN 1 ELSE 0 END) + "
"(CASE WHEN boleta_id IS NOT NULL THEN 1 ELSE 0 END) + "
"(CASE WHEN guia_despacho_id IS NOT NULL THEN 1 ELSE 0 END) = 1"
```

### Patrón de migración SQLite/Postgres dual (del W1-04)

```python
# Source: backend/migrations/versions/z5a6b7c8d9e0_add_boletas.py:91-113 [VERIFIED]
bind = op.get_bind()
if bind.dialect.name == 'postgresql':
    op.add_column('dte_emisiones', sa.Column('guia_despacho_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_dte_emisiones_guia_despacho_id', 'dte_emisiones', 'guias_despacho',
        ['guia_despacho_id'], ['id'], ondelete='CASCADE',
    )
    result = bind.execute(sa.text(
        "SELECT 1 FROM pg_constraint WHERE conname = 'ck_dte_emision_one_document'"
    )).fetchone()
    if result:
        op.drop_constraint('ck_dte_emision_one_document', 'dte_emisiones', type_='check')
    op.create_check_constraint(
        'ck_dte_emision_one_document',
        'dte_emisiones',
        "(CASE WHEN factura_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN nota_credito_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN nota_debito_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN boleta_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN guia_despacho_id IS NOT NULL THEN 1 ELSE 0 END) = 1"
    )
else:
    # SQLite: batch_alter_table, check constraints not enforced anyway
    with op.batch_alter_table('dte_emisiones') as batch_op:
        batch_op.add_column(sa.Column('guia_despacho_id', sa.Integer(), nullable=True))
```

### Seed system_config dual (SQLite/Postgres)

```python
# Source: z5a6b7c8d9e0_add_boletas.py:136-145 [VERIFIED]
if bind.dialect.name == 'postgresql':
    op.execute(
        "INSERT INTO system_config (key, value) VALUES ('guia_despacho_last_id', '0') "
        "ON CONFLICT (key) DO NOTHING"
    )
else:
    op.execute(
        "INSERT OR IGNORE INTO system_config (key, value) VALUES ('guia_despacho_last_id', '0')"
    )
```

### Orden exacto de 6 pasos en upgrade()

1. `op.create_table('guias_despacho', ...)` — con columnas D-02, índices, FKs
2. `op.create_table('guia_despacho_lineas', ...)` — con columnas D-03
3. Agregar `guia_despacho_id` a `dte_emisiones` + FK + recrear check constraint (5 FKs)
4. Agregar `guia_despacho_id` a `notas_credito` + FK + índice
5. Seed `system_config('guia_despacho_last_id', '0')`
6. (Opcional) Crear índices adicionales: `ix_guias_despacho_numero`, `ix_guias_despacho_dte_estado`, `ix_guias_despacho_track_id`

**LANDMINE migración:** El modelo `DteEmision` en `dte_emision.py` tiene el constraint hardcodeado (líneas 10-16). Después de la migración, el modelo Python TAMBIÉN debe actualizarse con `guia_despacho_id` y la nueva expresión del constraint — de lo contrario `alembic check` fallará.

---

## Concurrencia Numeración — Pattern skipif

```python
# Source: backend/tests/test_boletas.py:275-280 [VERIFIED]
import os
import threading
@pytest.mark.skipif(
    "sqlite" in os.environ.get("DATABASE_URL", "sqlite"),
    reason="row-level lock with_for_update requires Postgres",
)
@patch("app.api.guias_despacho.emit_dte")  # adaptar módulo
def test_numeracion_concurrente_guias(mock_emit, client, admin_token):
    # ... mismo patrón que test_boletas:280-305
```

[VERIFIED: tests/test_boletas.py:275-280] — El `pytest.ini addopts = -m "not smoke"` NO excluye este test (el skipif es condición en runtime, no marker). El test se ejecuta en todos los entornos pero es skipped automáticamente cuando `DATABASE_URL` contiene `"sqlite"`.

---

## Stock Invariante — Confirmación D-13

[VERIFIED: backend/app/services/boleta_stock.py] — `descontar_stock_boleta` y `revertir_stock_boleta` son las ÚNICAS funciones que crean `MovimientoInventario` en el contexto de DTE. No hay side-effect path en `emit_dte` que llame automáticamente a stock para tipos distintos — el branch `elif emision.boleta_id:` en `_sync_dte_estado` es el único lugar donde se llama `revertir_stock_boleta`. El nuevo branch `elif emision.guia_despacho_id:` NO tiene esa llamada.

El comentario obligatorio en `crear_guia_despacho`:
```python
# Guía DTE 52 NO descuenta stock — el documento tributario asociado lo hace (ver INV-04 / docs/architecture.md).
# Este invariante es intencional y permanente hasta Phase 3 (stock-on-emit refactor).
```

---

## Tests — Patrones Verificados

### Mock `emit_dte.delay`

```python
# Source: backend/tests/test_boletas.py [VERIFIED]
from unittest.mock import patch

@patch("app.api.guias_despacho.emit_dte")  # patch en el módulo DONDE SE USA
def test_emitir_guia_dispara_dte(mock_emit, client, admin_token):
    ...
    mock_emit.delay.assert_called_once()
    # Verificar que se llamó con el ID de la DteEmision
    call_args = mock_emit.delay.call_args[0]
    assert isinstance(call_args[0], int)
```

### Simular webhook DTE aceptado

```python
# Patrón: llamar _sync_dte_estado directamente con db fixture, o POST /api/dte/webhook mock
# Opción recomendada (más realista): usar db fixture + _sync_dte_estado

from app.tasks.dte import _sync_dte_estado
from app.models.dte_emision import DteEmision

def test_anular_guia_via_nc_emitida(client, admin_token, db):
    # 1. Crear guía
    # 2. Crear NC con guia_despacho_id
    # 3. Crear DteEmision para la NC
    # 4. Simular webhook: emision.estado = "aceptada" + _sync_dte_estado
    emision_nc = DteEmision(tipo="061", nota_credito_id=nc_id, ...)
    db.add(emision_nc); db.flush()
    emision_nc.estado = "aceptada"
    _sync_dte_estado(db, emision_nc, "aceptada")
    db.commit()
    # 5. Verificar guia.estado == "anulada"
```

### Audit log diff

```python
# Source: conftest.py:41-51 [VERIFIED]
# audit_disabled es True por default. Usar fixture audit_enabled para opt-in.
def test_audit_log_diff(client, admin_token, audit_enabled):
    from app.models.audit_log import AuditLog
    from app.database import SessionLocal
    # ... crear + editar + verificar
    db = SessionLocal()
    logs = db.query(AuditLog).filter_by(model_name="GuiaDespacho").all()
    assert len(logs) >= 1
    assert logs[0].diff_json is not None
```

### Registration de modelo en conftest.py

```python
# Source: backend/tests/conftest.py:77 [VERIFIED]
# Agregar después de la línea import app.models.boleta:
import app.models.guia_despacho  # noqa: F401 — registers GuiaDespacho with Base.metadata
```

---

## Common Pitfalls

### Pitfall 1: Precio bruto vs neto en `GuiaDespachoLineaCreate`
**What goes wrong:** Si `precio_unitario` se trata como neto (sin IVA) en la API pero el frontend envía precio bruto, los totales quedan incorrectos.
**Why it happens:** Boleta usa precio bruto (consumidor final); factura usa precio neto (empresas). Guía puede ir a ambos.
**How to avoid:** Seguir exactamente el mismo patrón que boleta (precio bruto → dividir por 1.19 para neto). Documentarlo con comentario inline idéntico a boleta: `# En guía, precio se ingresa bruto (con IVA)`.
**Warning signs:** Totales en PDF no coinciden con lo que el usuario ingresó.

### Pitfall 2: Copiar la lógica de stock reversal de boleta
**What goes wrong:** El branch `elif emision.boleta_id:` en `_sync_dte_estado` llama `revertir_stock_boleta` cuando `estado=="rechazada"`. Si se copia sin quitar esa llamada, la guía rechazada revertiría stock inexistente.
**Why it happens:** Copy-paste de `_sync_dte_estado`.
**How to avoid:** El branch `guia_despacho_id` solo actualiza `dte_estado`. Cero llamadas a `boleta_stock`.
**Warning signs:** `test_guia_no_descuenta_stock` falla con `MovimientoInventario` encontrado.

### Pitfall 3: Olvidar actualizar el modelo Python de DteEmision
**What goes wrong:** La migración agrega `guia_despacho_id` a la tabla pero el modelo `DteEmision` en Python no tiene el campo. `alembic check` falla. Las queries `filter_by(guia_despacho_id=...)` lanzan `AttributeError`.
**Why it happens:** Solo se edita la migración, no el modelo ORM.
**How to avoid:** Editar `backend/app/models/dte_emision.py` en la misma tarea que la migración: agregar `guia_despacho_id: Mapped[int | None]` y actualizar `__table_args__` con el nuevo check constraint.
**Warning signs:** Tests de integración pasan (SQLite no enforcea el constraint) pero Postgres falla.

### Pitfall 4: Lioren payload DTE 52 — fields name incorrectos
**What goes wrong:** `svc.emit(payload)` retorna 422 o 400 porque `ind_traslado` / `destino` no son los nombres exactos que Lioren espera.
**Why it happens:** No hay docs públicos verificables para DTE 52 en Lioren v1.
**How to avoid:** Tarea explícita de validación sandbox antes del merge: emitir una guía de prueba en el ambiente de test de Lioren y verificar la respuesta.
**Warning signs:** `emision.estado` permanece en `"pendiente"` sin `track_id` asignado.

### Pitfall 5: NotaCredito.guia_despacho_id no disparar `guia.estado='anulada'` correctamente
**What goes wrong:** Se crea NC con `guia_despacho_id` y se emite, pero la guía no queda `'anulada'` porque el webhook llama `_sync_dte_estado` con la emisión de la NC, no con la emisión de la guía.
**Why it happens:** `_sync_dte_estado` recibe la `DteEmision` de la NC. El branch `elif emision.nota_credito_id:` actualiza `nc.dte_estado` pero no verifica `nc.guia_despacho_id`.
**How to avoid:** Dentro del branch `elif emision.nota_credito_id:`, after `nc.dte_estado = estado`, agregar: si `estado == "aceptada" and nc.guia_despacho_id: guia.estado = "anulada"`.
**Warning signs:** `test_anular_guia_via_nc_emitida` falla porque `guia.estado != "anulada"`.

### Pitfall 6: XOR validator en NotaCreditoCreate no implementado
**What goes wrong:** Se crea NC con tanto `factura_id` como `guia_despacho_id`, violando la exclusividad de anulación.
**Why it happens:** Solo se agrega el campo `guia_despacho_id` al schema sin agregar el validator.
**How to avoid:** Agregar `@model_validator(mode='after')` en `NotaCreditoCreate` que verifique `not (self.factura_id and self.guia_despacho_id)`.
**Warning signs:** Test `test_nc_xor_validator` falla.

### Pitfall 7: Wiring incompleto — modelo no registrado en conftest.py
**What goes wrong:** `Base.metadata.create_all()` en tests no crea la tabla `guias_despacho` porque el modelo no fue importado.
**Why it happens:** conftest.py importa explícitamente cada modelo con `# noqa: F401`.
**How to avoid:** Agregar `import app.models.guia_despacho` en `conftest.py:setup_test_db`.
**Warning signs:** `OperationalError: no such table: guias_despacho` en el primer test.

### Pitfall 8: `DteEmision(tipo="052")` — string "052" no "52"
**What goes wrong:** El tipo se guarda como `"52"` en lugar de `"052"`, rompiendo posibles queries futuras.
**Why it happens:** Los otros tipos son `"033"`, `"061"`, `"056"`, `"039"`, `"041"` — todos con cero leading.
**How to avoid:** Siempre usar `tipo="052"` (3 caracteres, con cero). [VERIFIED: dte_emision.py:20 `tipo: Mapped[str] = mapped_column(String(3))`]

---

## Code Examples

### Verificado: Patrón `emitir_guia_despacho` en `dte.py`

```python
# Adaptar de emitir_boleta en boletas.py + emitir_factura en dte.py [VERIFIED]
@router.post("/guias-despacho/{guia_id}/emitir", response_model=DteEmisionOut)
def emitir_guia_despacho(
    guia_id: int,
    perms: tuple[User, Session] = require_permission("guias_despacho", "create"),
):
    _, db = perms
    guia = db.query(GuiaDespacho).filter_by(id=guia_id).first()
    if not guia:
        raise HTTPException(status_code=404, detail="Guía no encontrada")
    if guia.dte_estado != "no_emitida":
        raise HTTPException(status_code=409, detail=f"Guía ya en estado DTE: {guia.dte_estado}")
    existing = db.query(DteEmision).filter_by(guia_despacho_id=guia_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Ya existe una emisión para esta guía")
    emision = DteEmision(
        tipo="052",
        guia_despacho_id=guia.id,
        monto_neto=int(guia.total_neto),
        monto_iva=int(guia.total_iva),
        monto_total=int(guia.total),
    )
    db.add(emision)
    guia.dte_estado = "pendiente"
    db.commit()
    db.refresh(emision)
    emit_dte.delay(emision.id)
    return emision
```

### Verificado: `generar_pdf_guia_despacho` en `pdf.py`

```python
# Source: backend/app/services/pdf.py:36-40 [VERIFIED]
def generar_pdf_guia_despacho(guia, config: dict) -> bytes:
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
    template = env.get_template("guia_despacho.html")
    html_str = template.render(guia=guia, config=config)
    return HTML(string=html_str, base_url=TEMPLATES_DIR).write_pdf()
```

### Verificado: `enviar_guia_despacho` en `email.py`

```python
# Source: backend/app/services/email.py:enviar_boleta patrón [VERIFIED]
def enviar_guia_despacho(guia, pdf_bytes: bytes, destinatario: str) -> None:
    cfg = _get_smtp_config()  # raises EmailNotConfiguredError si no configurado
    empresa_nombre = "Conico"
    numero_str = f"GD-{guia.numero:05d}"
    fecha_str = guia.fecha.strftime("%d/%m/%Y") if guia.fecha else ""
    cliente_nombre = guia.cliente.nombre if guia.cliente else "Sin cliente"
    # Asunto (D-20): "Guía de Despacho N°{numero} - {emisor}"
    msg = MIMEMultipart()
    msg["Subject"] = f"Guía de Despacho N°{guia.numero} — {empresa_nombre}"
    # ... cuerpo + attachment pattern igual a enviar_boleta
```

### Verificado: DELETE con guard 409 si emitida

```python
# Source: backend/app/api/boletas.py:294-337 pattern [VERIFIED]
@router.delete("/{guia_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_guia(
    guia_id: int,
    perms: tuple[User, Session] = require_permission("guias_despacho", "delete"),
):
    _, db = perms
    guia = _load_guia(db, guia_id)
    if guia.dte_estado != "no_emitida":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede eliminar guía emitida; usá NC para anular"
        )
    db.delete(guia)
    db.commit()
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Guías en papel (obligación) | Guía electrónica DTE 52 obligatoria | 17 enero 2020 (Ley 21.131) | Toda guía debe pasar por SII |
| Campos opcionales Patente/DirDest | Obligatorios (Res. 154) | ~2023 | Lioren puede o no validarlos |
| IndTraslado 7 = "Guía de devolución" | IndTraslado 7 = "Devolución de Mercaderías" | Res. 154 | Solo renombre; código 7 igual |
| check constraint 4 FKs en dte_emisiones | 5 FKs (incluye guia_despacho_id) | Esta migración | Requiere drop+create en Postgres |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | El precio_unitario en GuiaDespachoLineaCreate es BRUTO (como boleta), no neto | Architecture Patterns / Calcular líneas | Totales incorrectos en PDF y en payload Lioren |
| A2 | Lioren usa `ind_traslado` (snake_case) para el motivo de traslado en el JSON body | Lioren Payload | `svc.emit()` retorna 400/422; emisión falla |
| A3 | Lioren usa `destino: {direccion, comuna}` para el destino físico | Lioren Payload | Campos de destino ignorados o error de validación |
| A4 | Lioren NO requiere RUTChofer/NombreChofer/Patente/FchSalida para DTE 52 en su abstracción | Lioren Payload | Lioren retorna 422 por campos faltantes; requiere extender modelo |
| A5 | La NC que anula guía debe tener `dte_estado == "aceptada"` en el momento que _sync_dte_estado evalúa guia.estado | Pitfall 5 | NC puede quedar aceptada pero guía no se anula, bug difícil de detectar |

---

## Open Questions

1. **¿`precio_unitario` en GuiaDespachoLinea es bruto o neto?**
   - What we know: boleta usa bruto; factura usa neto; guía puede ir a consumidores o empresas.
   - What's unclear: la UI de Phase 2 no está diseñada aún.
   - Recommendation: seguir patrón boleta (bruto) para consistencia. Si Phase 2 lo necesita diferente, el cálculo se adapta en el frontend.

2. **¿Campos obligatorios Resolución 154 en Lioren v1?**
   - What we know: SII requiere Patente, RUTChofer, DirDest, etc. para guías que transportan mercancías.
   - What's unclear: Lioren puede abstraerlos como opcionales o hacer validación propia.
   - Recommendation: Tarea explícita de validación sandbox con payload mínimo. Si falla, extender modelo con campos opcionales.

3. **¿Test de concurrencia entra en este sprint?**
   - What we know: D-28 lo describe como opcional con `@pytest.mark.smoke`. Deadline 2026-04-30.
   - What's unclear: Cuánto tiempo toma setup Postgres para CI local.
   - Recommendation: Diferir con `# TODO(W1-05-followup): test_numeracion_concurrente_guias`. El risk es bajo (Lioren rechaza folios duplicados como backstop).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | Migraciones prod + test de concurrencia | ✓ (via Docker) | 15-alpine | SQLite para tests normales |
| Redis | Celery broker | ✓ (via Docker) | 7-alpine | — |
| WeasyPrint | PDF | ✓ (mocked en tests) | 62.3 | Mock en conftest |
| Lioren sandbox | Validar payload DTE 52 | DESCONOCIDO | — | Diferir validación como tarea explícita |
| SMTP | Email | ✓ (vía env vars) | — | `EmailNotConfiguredError` graceful |

[VERIFIED: docker-compose.yml, requirements.txt, conftest.py:10-12]

**Missing dependencies con fallback:**
- Lioren sandbox: si credenciales no disponibles en dev, `build_guia_payload` se implementa con la hipótesis y se marca con TODO para validación.

---

## Security Domain

> `security_enforcement` no está explícitamente en config.json — se aplica por defecto.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | JWT Bearer existente; `require_permission` |
| V3 Session Management | no (stateless API) | — |
| V4 Access Control | yes | `require_permission("guias_despacho", action)` |
| V5 Input Validation | yes | Pydantic v2 con `Literal[1..9]` para motivo_traslado |
| V6 Cryptography | no (guía no requiere crypto nuevo) | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR — acceder guía de otro tenant | Spoofing | `require_permission` + FK validación |
| Motivo traslado inválido | Tampering | `Literal[1,2,3,4,5,6,7,8,9]` Pydantic |
| NC anulando guía de otro documento | Tampering | XOR validator `guia_despacho_id` XOR `factura_id` |
| Payload injection en descripción línea | Tampering | Pydantic `String(500)` con validación tipo |
| Webhook replay (DTE) | Elevation | Ya mitigado: `emision.estado in ("aceptada", "rechazada")` → skip |

---

## Sources

### Primary (HIGH confidence — codebase verificado)
- `backend/app/api/dte.py:25-33` — `_next_numero` con `with_for_update`
- `backend/app/api/boletas.py` — patrón router completo verificado
- `backend/app/models/boleta.py` — modelo boleta + línea verificado
- `backend/app/models/dte_emision.py` — check constraint 4 FKs verificado
- `backend/app/models/nota_credito.py` — boleta_id FK patrón verificado
- `backend/app/services/dte_service.py` — `build_boleta_payload` patrón verificado
- `backend/app/tasks/dte.py` — `_process_emit`, `_sync_dte_estado` verificados
- `backend/app/services/auditoria.py:47-68` — `_AUDITABLE_MODEL_NAMES` verificado
- `backend/app/core/permissions.py:5-46` — `MODULES` + `_DEFAULT` verificados
- `backend/app/services/pdf.py` + `backend/app/templates/boleta.html` — patrón PDF verificado
- `backend/app/services/email.py` — `enviar_boleta` + `EmailNotConfiguredError` verificados
- `backend/migrations/versions/z5a6b7c8d9e0_add_boletas.py` — Alembic shape verificado
- `backend/tests/conftest.py` — fixtures + audit_enabled + skipif pattern verificados
- `backend/tests/test_boletas.py:275-280` — skipif concurrency pattern verificado
- `backend/app/schemas/dte.py` — `NotaCreditoCreate` sin `guia_despacho_id` (a agregar) verificado

### Secondary (MEDIUM confidence — fuentes web verificadas con lógica SII)
- [API Gateway CL — tipos documentos](https://www.apigateway.cl/academy/integracion-para-la-emision-de-dte/introduccion/tipos-documentos) — IndTraslado 1..9 confirmados
- [WebFactura — Res. 154 SII](https://www.webfactura.cl/blog/resolucion-exenta-154-sii/) — campos obligatorios nuevos para guía con transporte físico

### Tertiary (LOW confidence — necesita validación)
- Hipótesis payload Lioren DTE 52: `ind_traslado`, `destino: {direccion, comuna}` — NO verificado contra API real

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — todo verificado en codebase
- Architecture patterns (copia boleta): HIGH — código fuente leído
- Migration shape: HIGH — z5a6b7c8d9e0 como template exacto
- Lioren payload DTE 52: LOW — sin acceso a docs API, hipótesis basada en SII XML canónico
- Tests patterns: HIGH — conftest + test_boletas verificados

**Research date:** 2026-04-26
**Valid until:** 2026-04-30 (deadline proyecto) — Lioren payload puede cambiar sin aviso

---

## RESEARCH COMPLETE

### Executive Summary (5 bullets para planner)

1. **Copia mecánica de boleta (W1-04).** El 90% del código es adaptar `Boleta`/`BoletaLinea` → `GuiaDespacho`/`GuiaDespachoLinea`. Todos los patrones (router, schema, modelo, migración, PDF, email, auditoría, permisos) están verificados en el código existente. Ninguna librería nueva.

2. **Migración Alembic monolítica con landmine crítico.** La migración debe: crear 2 tablas + agregar FK a `dte_emisiones` + drop+recrear `ck_dte_emision_one_document` con 5 FKs (expresión exacta verificada) + agregar FK a `notas_credito` + seed `system_config`. El modelo Python de `DteEmision` también debe actualizarse con `guia_despacho_id` en la misma tarea.

3. **Pipeline DTE: extender 3 puntos.** (a) Agregar `elif guia_despacho_id:` en `_process_emit` (llamar `build_guia_payload`). (b) Agregar `elif guia_despacho_id:` en `_sync_dte_estado` (actualizar `guia.dte_estado`, sin tocar stock). (c) Agregar `elif nota_credito_id and nc.guia_despacho_id and estado=="aceptada":` para marcar `guia.estado="anulada"`.

4. **Lioren payload DTE 52 es LOW confidence — requiere validación sandbox.** Los field names `ind_traslado`, `destino: {direccion, comuna}` son hipótesis. Planner debe incluir una tarea explícita de validación sandbox antes del merge. La Resolución 154 del SII añadió campos de transporte obligatorios (Patente, conductor) que Lioren puede o no requerir.

5. **Stock: cero código.** La invariante D-13 (no descuento) se garantiza simplemente NO importando `boleta_stock.py` en `guias_despacho.py` ni en el branch de guía en `tasks/dte.py`. Un comentario inline y el test de regresión `test_guia_no_descuenta_stock` son suficientes.
