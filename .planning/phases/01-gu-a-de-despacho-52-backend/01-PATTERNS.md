# Phase 1: Guía de Despacho 52 — Backend - Pattern Map

**Mapped:** 2026-04-26
**Files analyzed:** 18
**Analogs found:** 18 / 18

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/app/models/guia_despacho.py` | model | CRUD | `backend/app/models/boleta.py` | exact |
| `backend/app/schemas/guia_despacho.py` | schema | request-response | `backend/app/schemas/boleta.py` | exact |
| `backend/app/api/guias_despacho.py` | router | CRUD | `backend/app/api/boletas.py` | exact |
| `backend/app/api/dte.py` | router | request-response | same file (sección `emitir_factura`/`emitir_nc`) | exact |
| `backend/app/services/dte_service.py` | service | request-response | same file (`build_boleta_payload`) | exact |
| `backend/app/tasks/dte.py` | task | event-driven | same file (`_process_emit`/`_sync_dte_estado`) | exact |
| `backend/app/services/pdf.py` | service | transform | same file (`generar_pdf_boleta`) | exact |
| `backend/app/services/email.py` | service | request-response | same file (`enviar_boleta`) | exact |
| `backend/app/templates/guia_despacho.html` | template | transform | `backend/app/templates/boleta.html` | role-match |
| `backend/app/services/auditoria.py` | service | event-driven | same file (lines 47–68) | exact |
| `backend/app/core/permissions.py` | config | — | same file (lines 5–46) | exact |
| `backend/app/models/dte_emision.py` | model | CRUD | same file (lines 7–17) | exact |
| `backend/app/models/nota_credito.py` | model | CRUD | same file (lines 8–47) | exact |
| `backend/app/schemas/dte.py` | schema | request-response | same file (`NotaCreditoCreate`) | exact |
| `backend/app/main.py` | wiring | — | same file (line 85 `boletas`) | exact |
| `backend/tests/conftest.py` | test | — | same file (line 77 `app.models.boleta`) | exact |
| `backend/tests/test_guias_despacho.py` | test | CRUD | `backend/tests/test_boletas.py` | exact |
| `backend/migrations/versions/XXXXXXXXXXXX_add_guias_despacho.py` | migration | — | `backend/migrations/versions/z5a6b7c8d9e0_add_boletas.py` | exact |

---

## Pattern Assignments

### `backend/app/models/guia_despacho.py` (model, CRUD)

**Analog:** `backend/app/models/boleta.py` (lines 1–92)

**Imports pattern** (lines 1–6):
```python
from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
```

**Core model pattern** (lines 8–69):
```python
class GuiaDespacho(Base):
    __tablename__ = "guias_despacho"

    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    fecha: Mapped[date] = mapped_column(Date, default=date.today)
    # D-02: campos específicos de guía (NO copiar tipo_dte ni metodo_pago de boleta)
    motivo_traslado: Mapped[int] = mapped_column(Integer)           # 1..9
    direccion_destino: Mapped[str | None] = mapped_column(String(255), nullable=True)
    comuna_destino: Mapped[str | None] = mapped_column(String(100), nullable=True)
    nota_venta_id: Mapped[int | None] = mapped_column(
        ForeignKey("nota_ventas.id", ondelete="SET NULL"), nullable=True
    )
    cliente_id: Mapped[int | None] = mapped_column(
        ForeignKey("clientes.id", ondelete="SET NULL"), nullable=True
    )
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True
    )
    email_envio: Mapped[str | None] = mapped_column(String(255), nullable=True)
    vendedor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    estado: Mapped[str] = mapped_column(String(20), default="emitida", server_default=text("'emitida'"))
    dte_estado: Mapped[str] = mapped_column(String(20), default="no_emitida", server_default=text("'no_emitida'"))
    xml_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    track_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    folio_sii: Mapped[int | None] = mapped_column(Integer, nullable=True)
    email_enviado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    cliente: Mapped["Cliente | None"] = relationship("Cliente")
    empresa: Mapped["Empresa | None"] = relationship("Empresa")
    vendedor: Mapped["User | None"] = relationship("User")
    lineas: Mapped[list["GuiaDespachoLinea"]] = relationship(
        "GuiaDespachoLinea",
        back_populates="guia_despacho",
        cascade="all, delete-orphan",
        order_by="GuiaDespachoLinea.orden",
    )
    emision: Mapped["DteEmision | None"] = relationship(
        "DteEmision",
        primaryjoin="DteEmision.guia_despacho_id == GuiaDespacho.id",
        foreign_keys="DteEmision.guia_despacho_id",
        uselist=False,
    )

    @property
    def is_locked(self) -> bool:
        return self.estado != "emitida"   # igual que Boleta.is_locked
```

**Línea model pattern** (lines 72–92, `BoletaLinea` → `GuiaDespachoLinea`):
```python
class GuiaDespachoLinea(Base):
    __tablename__ = "guia_despacho_lineas"

    id: Mapped[int] = mapped_column(primary_key=True)
    guia_despacho_id: Mapped[int] = mapped_column(
        ForeignKey("guias_despacho.id", ondelete="CASCADE")
    )
    # Resto de campos idénticos a BoletaLinea (orden, producto_id, descripcion,
    # cantidad, precio_unitario, descuento_pct, exenta, total_neto, iva, total_linea)
    guia_despacho: Mapped["GuiaDespacho"] = relationship("GuiaDespacho", back_populates="lineas")
    producto: Mapped["Producto | None"] = relationship("Producto")
```

**Adaptation notes:**
- Eliminar `tipo_dte`, `metodo_pago`, `monto_pagado`, `patente_vehiculo`, `nombre_receptor`, `rut_receptor`.
- Agregar `motivo_traslado`, `direccion_destino`, `comuna_destino`, `nota_venta_id`.
- `BoletaLinea` → `GuiaDespachoLinea` con FK `guia_despacho_id` → `guias_despacho.id`.

---

### `backend/app/schemas/guia_despacho.py` (schema, request-response)

**Analog:** `backend/app/schemas/boleta.py` (lines 1–133)

**Imports pattern** (lines 1–4):
```python
from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, field_validator
```

**GuiaDespachoCreate pattern** (lines 36–59 de boleta.py adaptado):
```python
class GuiaDespachoCreate(BaseModel):
    fecha: date | None = None
    motivo_traslado: Literal[1, 2, 3, 4, 5, 6, 7, 8, 9]   # D-05
    direccion_destino: str | None = None
    comuna_destino: str | None = None
    cliente_id: int | None = None
    empresa_id: int | None = None
    nota_venta_id: int | None = None                        # D-04
    email_envio: str | None = None
    lineas: list[GuiaDespachoLineaCreate]

    @field_validator("lineas")
    @classmethod
    def lineas_no_vacias(cls, v):
        if not v:
            raise ValueError("Guía requiere al menos una línea")
        return v
```

**GuiaDespachoUpdate pattern** (lines 62–71 de boleta.py adaptado, D-06):
```python
class GuiaDespachoUpdate(BaseModel):
    """Solo metadata accesoria. Sin líneas, sin totales, sin motivo."""
    direccion_destino: str | None = None
    comuna_destino: str | None = None
    email_envio: str | None = None
```

**GuiaDespachoOut / GuiaDespachoListOut** (lines 87–133 de boleta.py): reemplazar campos boleta-específicos con los de guía; `GuiaDespachoListOut` sin campo `lineas`, `GuiaDespachoOut` con `lineas: list[GuiaDespachoLineaOut] = []`.

**Adaptation notes:**
- Usar `Literal[1,2,3,4,5,6,7,8,9]` para `motivo_traslado` (D-05), no `Literal["39","41"]`.
- Eliminar `tipo_dte`, `metodo_pago`, `monto_pagado`, `patente_vehiculo`, `nombre_receptor`, `rut_receptor`.
- `ClienteMinOut` y `VendedorMinOut` pueden importarse desde `schemas/boleta.py` o duplicarse; codebase convention es duplicar.

---

### `backend/app/api/guias_despacho.py` (router, CRUD)

**Analog:** `backend/app/api/boletas.py` (lines 1–379)

**Imports pattern** (lines 1–23):
```python
from datetime import date, datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import require_permission
from app.api.dte import _next_numero          # D-07: reutilizar, NO duplicar
from app.models.guia_despacho import GuiaDespacho, GuiaDespachoLinea
from app.models.dte_emision import DteEmision
from app.models.user import User
from app.schemas.guia_despacho import (
    GuiaDespachoCreate, GuiaDespachoListOut,
    GuiaDespachoOut, GuiaDespachoUpdate,
)
from app.services.email import EmailNotConfiguredError, enviar_guia_despacho as _enviar_guia_email
from app.services.pdf import generar_pdf_guia_despacho
from app.tasks.dte import emit_dte

router = APIRouter()
```

**Numeración interna** (lines 27–40 de boletas.py como referencia — pero D-07 dice importar `_next_numero` de `dte.py`):
```python
# NO redefinir _asignar_numero aquí.
# Usar directamente: numero = _next_numero(db, "guia_despacho_last_id")
```

**Calcular líneas y totales** (lines 43–72 de boletas.py, adaptar):
```python
def _calcular_lineas_y_totales_guia(guia: GuiaDespacho) -> None:
    # En guía, precio se ingresa bruto (con IVA), igual que boleta — ver A1
    total_neto = Decimal("0")
    total_iva = Decimal("0")
    total_bruto = Decimal("0")
    tasa = Decimal("0.19")

    for linea in guia.lineas:
        bruto_unit = linea.precio_unitario
        cantidad = linea.cantidad
        descuento = linea.descuento_pct or Decimal("0")
        bruto = bruto_unit * cantidad * (Decimal("1") - descuento / Decimal("100"))

        if linea.exenta:
            neto = bruto.quantize(Decimal("0.01"))
            iva_linea = Decimal("0")
        else:
            neto = (bruto / (Decimal("1") + tasa)).quantize(Decimal("0.01"))
            iva_linea = (bruto - neto).quantize(Decimal("0.01"))

        linea.total_neto = neto
        linea.iva = iva_linea
        linea.total_linea = (neto + iva_linea).quantize(Decimal("0.01"))
        total_neto += linea.total_neto
        total_iva += linea.iva
        total_bruto += linea.total_linea

    guia.total_neto = total_neto
    guia.total_iva = total_iva
    guia.total = total_bruto
```

**_load_guia helper** (lines 84–97 de boletas.py):
```python
def _load_guia(db: Session, guia_id: int) -> GuiaDespacho:
    guia = (
        db.query(GuiaDespacho)
        .options(
            joinedload(GuiaDespacho.cliente),
            joinedload(GuiaDespacho.vendedor),
            joinedload(GuiaDespacho.lineas),
        )
        .filter(GuiaDespacho.id == guia_id)
        .first()
    )
    if not guia:
        raise HTTPException(status_code=404, detail="Guía no encontrada")
    return guia
```

**crear_guia_despacho** (lines 100–165 de boletas.py adaptado):
```python
@router.post("/", response_model=GuiaDespachoOut, status_code=status.HTTP_201_CREATED)
def crear_guia_despacho(
    body: GuiaDespachoCreate,
    perms: tuple[User, Session] = require_permission("guias_despacho", "create"),
):
    current_user, db = perms
    numero = _next_numero(db, "guia_despacho_last_id")   # D-07
    guia = GuiaDespacho(
        numero=numero,
        fecha=body.fecha or date.today(),
        motivo_traslado=body.motivo_traslado,
        direccion_destino=body.direccion_destino,
        comuna_destino=body.comuna_destino,
        cliente_id=body.cliente_id,
        empresa_id=body.empresa_id,
        nota_venta_id=body.nota_venta_id,
        email_envio=body.email_envio,
        vendedor_id=current_user.id,
    )
    db.add(guia)
    db.flush()

    guia.lineas = [GuiaDespachoLinea(guia_despacho_id=guia.id, ...) for l in body.lineas]
    db.flush()

    _calcular_lineas_y_totales_guia(guia)

    # Guía DTE 52 NO descuenta stock — el documento tributario asociado lo hace
    # (ver INV-04 / docs/architecture.md). Invariante intencional hasta Phase 3.

    emision = DteEmision(
        tipo="052",
        guia_despacho_id=guia.id,
        monto_neto=int(guia.total_neto),
        monto_iva=int(guia.total_iva),
        monto_total=int(guia.total),
    )
    db.add(emision)
    db.flush()

    guia.dte_estado = "pendiente"
    db.commit()
    db.refresh(guia)
    emit_dte.delay(emision.id)
    return guia
```

**DELETE con guard 409** (lines 294–337 de boletas.py, adaptar):
```python
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
            detail="No se puede eliminar guía emitida; usá NC para anular",
        )
    db.delete(guia)
    db.commit()
```

**PDF endpoint** (lines 340–352 de boletas.py):
```python
@router.get("/{guia_id}/pdf")
def descargar_pdf(
    guia_id: int,
    perms: tuple[User, Session] = require_permission("guias_despacho", "view"),
):
    _, db = perms
    guia = _load_guia(db, guia_id)
    pdf_bytes = generar_pdf_guia_despacho(guia, _config_dict(db))
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="guia-{guia.numero}.pdf"'},
    )
```

**Email endpoint** (lines 355–379 de boletas.py):
```python
@router.post("/{guia_id}/email", response_model=GuiaDespachoOut)
def enviar_email_guia(
    guia_id: int,
    body: GuiaEmailBody,
    perms: tuple[User, Session] = require_permission("guias_despacho", "edit"),
):
    _, db = perms
    guia = _load_guia(db, guia_id)
    destino = body.email or guia.email_envio
    if not destino:
        raise HTTPException(status_code=422, detail="No hay email destino")
    pdf_bytes = generar_pdf_guia_despacho(guia, _config_dict(db))
    try:
        _enviar_guia_email(guia, pdf_bytes, destino)
    except EmailNotConfiguredError:
        raise HTTPException(status_code=503, detail="Email no configurado")
    guia.email_enviado_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(guia)
    return guia
```

**Adaptation notes:**
- NO importar ni llamar `descontar_stock_boleta` / `revertir_stock_boleta` (D-13).
- NO implementar `POST /{id}/anular` (D-17 diferido).
- `_validar_boleta_41` no aplica — guía siempre admite líneas afectas y exentas mezcladas.
- Filtros de listado: `estado`, `dte_estado`, `cliente_id`, `desde`, `hasta` (como boletas, sin `patente`).

---

### `backend/app/api/dte.py` (modify — add `emitir_guia_despacho`)

**Analog:** `emitir_factura` (lines 78–104) y `emitir_nc` (lines 153–179) en el mismo archivo.

**Nuevo import a agregar** (al bloque de imports existente):
```python
from app.models.guia_despacho import GuiaDespacho
```

**Sección a agregar** (después de la sección `# ── Notas de Débito ──`, antes de `# ── Webhook ──`):
```python
# ── Guías de Despacho ─────────────────────────────────────────────────────────

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

**Adaptation notes:**
- Patrón idéntico a `emitir_factura` (lines 78–104) con `tipo="052"` y `guia_despacho_id`.
- El endpoint vive en `dte.py`, no en `guias_despacho.py` (D-31).

---

### `backend/app/services/dte_service.py` (modify — add `build_guia_payload`)

**Analog:** `build_boleta_payload` (lines 144–195) en el mismo archivo.

**Nuevo import a agregar**:
```python
from app.models.guia_despacho import GuiaDespacho
```

**Método a agregar dentro de `class DteService`**:
```python
def build_guia_payload(self, guia: GuiaDespacho, db: Session) -> dict:
    cfg = _get_config(db)
    receptor = {}
    if guia.cliente:
        receptor = {
            "rut": guia.cliente.rut or "",
            "razon_social": guia.cliente.nombre,
            "giro": "",
            "direccion": getattr(guia.cliente, "direccion_despacho", "") or "",
            "ciudad": getattr(guia.cliente, "comuna", "") or "",
            "comuna": getattr(guia.cliente, "comuna", "") or "",
        }

    detalle = [
        {
            "nombre": l.descripcion,
            "cantidad": float(l.cantidad),
            "precio_unitario": int(l.precio_unitario),   # bruto, igual que boleta
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
        # Campos específicos DTE 52 — nombres [ASSUMED, validar contra sandbox Lioren]:
        # TODO(W1-05-sandbox): verificar que "ind_traslado" y "destino" son los field names
        # exactos de Lioren v1 para tipo_dte=52 antes de merge a producción.
        "ind_traslado": guia.motivo_traslado,
        "destino": {
            "direccion": guia.direccion_destino or "",
            "comuna": guia.comuna_destino or "",
        },
    }
    return payload
```

**Adaptation notes:**
- Seguir firma idéntica a `build_boleta_payload(self, boleta, db)` → `build_guia_payload(self, guia, db)`.
- Los field names `ind_traslado` y `destino.{direccion,comuna}` son hipótesis (LOW confidence, A2/A3).
- NO agregar `referencias: [{tipo: "PATENTE"}]` a menos que sandbox lo requiera.

---

### `backend/app/tasks/dte.py` (modify — add elif guia_despacho_id branches)

**Analog:** ramas existentes en `_process_emit` (lines 51–77) y `_sync_dte_estado` (lines 27–48).

**Nuevo import a agregar** (al bloque de imports, línea ~11):
```python
from app.models.guia_despacho import GuiaDespacho
```

**Rama en `_process_emit`** (insertar antes del `else` final en línea 76):
```python
elif emision.guia_despacho_id:
    doc = db.query(GuiaDespacho).options(
        joinedload(GuiaDespacho.lineas),
        joinedload(GuiaDespacho.cliente),
    ).filter_by(id=emision.guia_despacho_id).first()
    payload = svc.build_guia_payload(doc, db)
```

**Rama en `_sync_dte_estado`** (insertar antes de `# fin` / después del `elif emision.boleta_id:` en línea 40–48):
```python
elif emision.guia_despacho_id:
    guia = db.get(GuiaDespacho, emision.guia_despacho_id)
    if guia:
        guia.dte_estado = estado
        # D-12: NO revertir stock — guía DTE 52 no tiene impacto de inventario (D-13)

# ADEMÁS, dentro del branch elif emision.nota_credito_id: (líneas 33–35),
# AGREGAR DESPUÉS de nc.dte_estado = estado:
        if estado == "aceptada" and getattr(nc, "guia_despacho_id", None):
            guia = db.get(GuiaDespacho, nc.guia_despacho_id)
            if guia:
                guia.estado = "anulada"    # D-16: NC aceptada anula guía
```

**LANDMINE crítico:** el branch `elif emision.boleta_id:` (líneas 40–48) llama `revertir_stock_boleta` cuando `estado=="rechazada"`. El branch de guía NUNCA debe hacer esto. El `elif` de guía va después del de boleta, sin stock reversal.

---

### `backend/app/services/pdf.py` (modify — add `generar_pdf_guia_despacho`)

**Analog:** `generar_pdf_boleta` (lines 36–40).

**Función a agregar** (después de `generar_pdf_boleta`):
```python
def generar_pdf_guia_despacho(guia_despacho, config: dict) -> bytes:
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
    template = env.get_template("guia_despacho.html")
    html_str = template.render(guia_despacho=guia_despacho, config=config)
    return HTML(string=html_str, base_url=TEMPLATES_DIR).write_pdf()
```

**Adaptation notes:**
- Firma idéntica a `generar_pdf_boleta(boleta, config)`.
- Nombre de variable de contexto en template: `guia_despacho` (no `boleta`).

---

### `backend/app/services/email.py` (modify — add `enviar_guia_despacho`)

**Analog:** `enviar_boleta` (lines 183–212).

**Función a agregar** (después de `enviar_boleta`):
```python
def enviar_guia_despacho(guia_despacho, pdf_bytes: bytes, destinatario: str) -> None:
    cfg = _get_smtp_config()
    if not destinatario:
        raise ValueError("La guía no tiene correo de destino")

    numero_str = f"GD-{guia_despacho.folio_sii or guia_despacho.numero:05d}"
    fecha_str = guia_despacho.fecha.strftime("%d/%m/%Y") if guia_despacho.fecha else ""

    msg = MIMEMultipart()
    msg["From"] = cfg["from"]
    msg["To"] = destinatario
    msg["Subject"] = f"Guía de Despacho N°{guia_despacho.numero} — Conico"  # D-20

    body = (
        f"Adjuntamos la Guía de Despacho electrónica {numero_str} "
        f"de fecha {fecha_str} por un total de $ {int(guia_despacho.total):,}.\n\n"
        f"Saludos,\nConico"
    )
    msg.attach(MIMEText(body, "plain", "utf-8"))

    filename = f"{numero_str} {fecha_str}.pdf".strip().replace("  ", " ")
    attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
    attachment.add_header("Content-Disposition", "attachment", filename=filename)
    msg.attach(attachment)

    with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
        server.ehlo()
        server.starttls()
        server.login(cfg["user"], cfg["password"])
        server.sendmail(cfg["from"], destinatario, msg.as_string())
```

**Adaptation notes:**
- Firma: `enviar_guia_despacho(guia_despacho, pdf_bytes, destinatario)` — igual a `enviar_boleta`.
- `_get_smtp_config()` ya existe; raises `EmailNotConfiguredError` si no configurado.

---

### `backend/app/templates/guia_despacho.html` (new template)

**Analog:** `backend/app/templates/boleta.html`

Instrucción al implementador: copiar `boleta.html` completo y realizar estas adaptaciones:
- Cambiar título a `"Guía de Despacho Electrónica"`.
- Reemplazar bloque de receptor por `{{ guia_despacho.cliente.nombre }}` etc. (variable `guia_despacho`).
- Agregar sección de motivo de traslado: `Motivo: {{ guia_despacho.motivo_traslado }}`.
- Agregar sección de destino: `Dirección: {{ guia_despacho.direccion_destino }}`, `Comuna: {{ guia_despacho.comuna_destino }}`.
- Mostrar NV vinculada si `guia_despacho.nota_venta_id`.
- Footer: `Folio SII: {{ guia_despacho.folio_sii or '—' }}`, `Track ID: {{ guia_despacho.track_id or '—' }}`.
- Eliminar sección `Método de Pago` (no aplica a guías).

---

### `backend/app/services/auditoria.py` (modify — extend `_AUDITABLE_MODEL_NAMES`)

**Analog:** lines 47–68 del mismo archivo.

**Modificación:** agregar dos strings al set en línea 47:
```python
_AUDITABLE_MODEL_NAMES: set[str] = {
    # ... existentes ...
    "Boleta",
    "BoletaLinea",
    "GuiaDespacho",       # AGREGAR (D-25)
    "GuiaDespachoLinea",  # AGREGAR (D-25)
    # ...
}
```

**Adaptation notes:** Cero código adicional. El listener `before_flush` ya maneja el resto automáticamente. Verificar que `motivo_traslado`, `direccion_destino`, `estado`, `dte_estado`, `track_id`, `folio_sii` NO están en `SENSITIVE_FIELDS` (líneas 25–39) — confirmado que no lo están.

---

### `backend/app/core/permissions.py` (modify — add `"guias_despacho"` to MODULES + `_DEFAULT`)

**Analog:** lines 5–46 del mismo archivo.

**MODULES** (línea 5):
```python
MODULES = [
    "catalogo", "clientes", "proveedores", "empresas", "cotizaciones", "nota_venta",
    "facturas", "boletas", "guias_despacho",   # AGREGAR aquí (D-22)
    "ordenes_compra", "inventario", "rrhh", "dashboard", "usuarios", "tareas",
]
```

**`_DEFAULT` para subadmin** (después de `"boletas": {...}`):
```python
"guias_despacho": {"view": True, "create": True, "edit": True, "delete": True},
```

**`_DEFAULT` para vendedor** (después de `"boletas": {...}`):
```python
"guias_despacho": {"view": True, "create": True, "edit": True, "delete": False},
```

**Adaptation notes:** Admin hereda full automáticamente por el bucle `{m: {a: True for a in ACTIONS} for m in MODULES}` en línea 13.

---

### `backend/app/models/dte_emision.py` (modify — add `guia_despacho_id` + update check constraint)

**Analog:** lines 7–17 del mismo archivo.

**`__table_args__` actualizado** (líneas 9–17):
```python
__table_args__ = (
    CheckConstraint(
        "(CASE WHEN factura_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN nota_credito_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN nota_debito_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN boleta_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN guia_despacho_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
        name="ck_dte_emision_one_document",
    ),
)
```

**Nueva columna** (después de `boleta_id`, línea ~35):
```python
guia_despacho_id: Mapped[int | None] = mapped_column(
    ForeignKey("guias_despacho.id", ondelete="CASCADE"), nullable=True
)
```

**LANDMINE:** Si solo se edita la migración sin editar este modelo, `alembic check` falla y las queries `filter_by(guia_despacho_id=...)` lanzan `AttributeError`.

---

### `backend/app/models/nota_credito.py` (modify — add `guia_despacho_id` FK)

**Analog:** `boleta_id` FK (lines 17–19) del mismo archivo.

**Nueva columna** (después de `boleta_id`, línea 19):
```python
guia_despacho_id: Mapped[int | None] = mapped_column(
    ForeignKey("guias_despacho.id", ondelete="SET NULL"), nullable=True
)
```

**Adaptation notes:** NC existentes quedan con `guia_despacho_id = NULL` — sin breaking change.

---

### `backend/app/schemas/dte.py` (modify — extend `NotaCreditoCreate` + XOR validator)

**Analog:** `NotaCreditoCreate` (lines 19–23) del mismo archivo.

**`NotaCreditoCreate` extendido:**
```python
from pydantic import BaseModel, model_validator

class NotaCreditoCreate(BaseModel):
    fecha: date | None = None
    cliente_id: int
    razon: str
    lineas: list[NotaCreditoLineaCreate] = []
    guia_despacho_id: int | None = None    # AGREGAR (D-15)

    @model_validator(mode="after")
    def xor_factura_guia(self) -> "NotaCreditoCreate":
        # D-15: NC anula UNA cosa — factura_id XOR guia_despacho_id
        # (factura_id no existe aún en schema pero se contempla para futuro)
        return self
```

**Adaptation notes:**
- El schema actual de `NotaCreditoCreate` no tiene `factura_id` explícito (la NC se vincula via `boleta_id` en el modelo, no en el schema de creación). El XOR validator aplica si en el futuro se agrega `factura_id` al schema. Por ahora agregar solo `guia_despacho_id: int | None = None`.
- Ver Pitfall 6 en RESEARCH.md para el caso donde sí existen ambos campos.

---

### `backend/app/main.py` (modify — include_router)

**Analog:** línea 85 del mismo archivo.

**Agregar** (después de `app.include_router(boletas.router, ...)`):
```python
from app.api import guias_despacho  # en el bloque de imports, línea ~17
# ...
app.include_router(guias_despacho.router, prefix="/api/guias-despacho", tags=["guias-despacho"])
```

---

### `backend/tests/conftest.py` (modify — register model)

**Analog:** línea 77 del mismo archivo.

**Agregar** (después de `import app.models.boleta`):
```python
import app.models.guia_despacho  # noqa: F401 — registers GuiaDespacho with Base.metadata
import app.models.nota_credito   # noqa: F401 — (ya debe estar; si no, agregar)
```

---

### `backend/tests/test_guias_despacho.py` (new test file)

**Analog:** `backend/tests/test_boletas.py` (lines 1–80 como estructura base)

**Imports y helper pattern** (lines 1–22 de test_boletas.py):
```python
import os
from decimal import Decimal
import pytest
from unittest.mock import patch


def _create_producto(client, admin_token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Prod Guia", "sku": f"SKU-GD-{...}", "precio_venta": 1190, "precio_costo": 600},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()
```

**test_crear_guia_basica** (D-27, basado en `test_post_boleta_anonima_crea_emision` lines 24–44):
```python
@patch("app.api.guias_despacho.emit_dte")
def test_crear_guia_basica(mock_emit, client, admin_token):
    r = client.post(
        "/api/guias-despacho/",
        json={
            "motivo_traslado": 1,
            "direccion_destino": "Av. Providencia 123",
            "lineas": [{"descripcion": "Item", "cantidad": "1", "precio_unitario": "1190"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["dte_estado"] == "pendiente"
    assert body["motivo_traslado"] == 1
    mock_emit.delay.assert_called_once()
```

**test_guia_no_descuenta_stock** (D-27, invariante D-13 — basado en `test_post_boleta_descuenta_stock` lines 47–68 como inverso):
```python
@patch("app.api.guias_despacho.emit_dte")
def test_guia_no_descuenta_stock(mock_emit, client, admin_token, db):
    prod = _create_producto(client, admin_token)
    from app.models.producto import Producto
    stock_antes = db.get(Producto, prod["id"]).stock_actual
    r = client.post(
        "/api/guias-despacho/",
        json={
            "motivo_traslado": 1,
            "lineas": [{"producto_id": prod["id"], "descripcion": "Item", "cantidad": "3", "precio_unitario": "100"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    db.expire_all()
    stock_despues = db.get(Producto, prod["id"]).stock_actual
    assert stock_despues == stock_antes   # D-13: guía NO descuenta stock
    from app.models.movimiento_inventario import MovimientoInventario
    movs = db.query(MovimientoInventario).filter_by(referencia_tipo="guia_despacho").all()
    assert len(movs) == 0
```

**skipif pattern para concurrencia** (lines 275–280 de test_boletas.py):
```python
@pytest.mark.skipif(
    "sqlite" in os.environ.get("DATABASE_URL", "sqlite"),
    reason="row-level lock with_for_update requires Postgres",
)
@patch("app.api.guias_despacho.emit_dte")
def test_numeracion_concurrente_guias(mock_emit, client, admin_token):
    # TODO(W1-05-followup): implementar si planner decide incluir en sprint
    pass
```

**Simulación webhook para anulación** (D-27, patrón de RESEARCH.md):
```python
from app.tasks.dte import _sync_dte_estado
from app.models.dte_emision import DteEmision

def test_anular_guia_via_nc_emitida(client, admin_token, db):
    # 1. crear guía → 2. crear NC con guia_despacho_id → 3. DteEmision NC
    # 4. simular webhook:
    emision_nc.estado = "aceptada"
    _sync_dte_estado(db, emision_nc, "aceptada")
    db.commit()
    # 5. verificar
    db.expire_all()
    guia_obj = db.get(GuiaDespacho, guia_id)
    assert guia_obj.estado == "anulada"
```

---

### `backend/migrations/versions/XXXXXXXXXXXX_add_guias_despacho.py` (new migration)

**Analog:** `backend/migrations/versions/z5a6b7c8d9e0_add_boletas.py` (lines 1–194)

**Docstring y metadata**:
```python
"""add_guias_despacho

Revision ID: <generar con alembic revision>
Revises: z5a6b7c8d9e0
Create Date: 2026-04-26

W1-05: tablas guias_despacho + guia_despacho_lineas, FK guia_despacho_id en
dte_emisiones (+ drop+recreate ck_dte_emision_one_document con 5 FKs) y notas_credito,
seed system_config guia_despacho_last_id.

Reversible — guías y NCs vinculadas se pierden si downgrade tras emisión real.
"""
```

**`op.create_table('guias_despacho', ...)` pattern** (lines 33–66 de z5a6b7c8d9e0, adaptado):
```python
op.create_table(
    'guias_despacho',
    sa.Column('id', sa.Integer(), primary_key=True),
    sa.Column('numero', sa.Integer(), nullable=False),
    sa.Column('fecha', sa.Date(), nullable=False),
    sa.Column('motivo_traslado', sa.Integer(), nullable=False),
    sa.Column('direccion_destino', sa.String(255), nullable=True),
    sa.Column('comuna_destino', sa.String(100), nullable=True),
    sa.Column('cliente_id', sa.Integer(), sa.ForeignKey('clientes.id', ondelete='SET NULL'), nullable=True),
    sa.Column('empresa_id', sa.Integer(), sa.ForeignKey('empresas.id', ondelete='SET NULL'), nullable=True),
    sa.Column('nota_venta_id', sa.Integer(), sa.ForeignKey('nota_ventas.id', ondelete='SET NULL'), nullable=True),
    sa.Column('email_envio', sa.String(255), nullable=True),
    sa.Column('vendedor_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    sa.Column('total_neto', sa.Numeric(12, 2), nullable=False, server_default='0'),
    sa.Column('total_iva', sa.Numeric(12, 2), nullable=False, server_default='0'),
    sa.Column('total', sa.Numeric(12, 2), nullable=False, server_default='0'),
    sa.Column('estado', sa.String(20), nullable=False, server_default='emitida'),
    sa.Column('dte_estado', sa.String(20), nullable=False, server_default='no_emitida'),
    sa.Column('xml_raw', sa.Text(), nullable=True),
    sa.Column('track_id', sa.String(100), nullable=True),
    sa.Column('folio_sii', sa.Integer(), nullable=True),
    sa.Column('email_enviado_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
)
op.create_index('ix_guias_despacho_numero', 'guias_despacho', ['numero'], unique=True)
op.create_index('ix_guias_despacho_fecha', 'guias_despacho', ['fecha'])
op.create_index('ix_guias_despacho_cliente_id', 'guias_despacho', ['cliente_id'])
op.create_index('ix_guias_despacho_dte_estado', 'guias_despacho', ['dte_estado'])
op.create_index('ix_guias_despacho_track_id', 'guias_despacho', ['track_id'])
```

**`op.create_table('guia_despacho_lineas', ...)` pattern** (lines 71–86 de z5a6b7c8d9e0, adaptado):
```python
op.create_table(
    'guia_despacho_lineas',
    sa.Column('id', sa.Integer(), primary_key=True),
    sa.Column('guia_despacho_id', sa.Integer(), sa.ForeignKey('guias_despacho.id', ondelete='CASCADE'), nullable=False),
    sa.Column('orden', sa.Integer(), nullable=False, server_default='0'),
    sa.Column('producto_id', sa.Integer(), sa.ForeignKey('productos.id', ondelete='SET NULL'), nullable=True),
    sa.Column('descripcion', sa.String(500), nullable=False),
    sa.Column('cantidad', sa.Numeric(10, 2), nullable=False, server_default='1'),
    sa.Column('precio_unitario', sa.Numeric(12, 2), nullable=False, server_default='0'),
    sa.Column('descuento_pct', sa.Numeric(5, 2), nullable=False, server_default='0'),
    sa.Column('exenta', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    sa.Column('total_neto', sa.Numeric(12, 2), nullable=False, server_default='0'),
    sa.Column('iva', sa.Numeric(12, 2), nullable=False, server_default='0'),
    sa.Column('total_linea', sa.Numeric(12, 2), nullable=False, server_default='0'),
)
op.create_index('ix_guia_despacho_lineas_guia_id', 'guia_despacho_lineas', ['guia_despacho_id'])
```

**FK en `dte_emisiones` + drop+recreate check constraint** (lines 91–118 de z5a6b7c8d9e0, adaptado con 5 FKs):
```python
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
    with op.batch_alter_table('dte_emisiones') as batch_op:
        batch_op.add_column(sa.Column('guia_despacho_id', sa.Integer(), nullable=True))
```

**FK en `notas_credito`** (lines 122–131 de z5a6b7c8d9e0, adaptado):
```python
if bind.dialect.name == 'postgresql':
    op.add_column('notas_credito', sa.Column('guia_despacho_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_notas_credito_guia_despacho_id', 'notas_credito', 'guias_despacho',
        ['guia_despacho_id'], ['id'], ondelete='SET NULL',
    )
else:
    with op.batch_alter_table('notas_credito') as batch_op:
        batch_op.add_column(sa.Column('guia_despacho_id', sa.Integer(), nullable=True))
```

**Seed system_config** (lines 136–145 de z5a6b7c8d9e0, clave diferente):
```python
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

**`downgrade()` pattern** (lines 148–194 de z5a6b7c8d9e0, reverso completo): seguir el mismo orden inverso: seed delete → notas_credito FK drop → dte_emisiones constraint restore (4 FKs) + FK drop → guia_despacho_lineas drop → guias_despacho drop.

---

## Shared Patterns

### Patrón `require_permission` (RBAC)
**Fuente:** `backend/app/api/deps.py` (usado en `boletas.py` lines 103, 180, 222, 267, 277, 298, 341, 360)
**Aplica a:** todos los endpoints de `guias_despacho.py` y `emitir_guia_despacho` en `dte.py`
```python
perms: tuple[User, Session] = require_permission("guias_despacho", "<action>")
current_user, db = perms   # o: _, db = perms
```

### Patrón error HTTP + rollback
**Fuente:** convención del proyecto (`CONVENTIONS.md`)
**Aplica a:** todos los handlers de `guias_despacho.py`
```python
except Exception:
    db.rollback()
    raise
```
Y HTTPException con `detail` en español corto: `"Guía no encontrada"`, `"Motivo de traslado inválido"`.

### Patrón `_config_dict(db)`
**Fuente:** `backend/app/api/boletas.py` lines 212–213
**Aplica a:** endpoints PDF y email de `guias_despacho.py`
```python
def _config_dict(db: Session) -> dict:
    return {r.key: r.value for r in db.query(SystemConfig).all()}
```

### Tipo DTE con cero líder (`"052"`)
**Fuente:** `backend/app/models/dte_emision.py` line 20 (`tipo: Mapped[str] = mapped_column(String(3))`)
**Aplica a:** `DteEmision(tipo="052", ...)` en `crear_guia_despacho` y `emitir_guia_despacho`

### Mock `emit_dte` en tests
**Fuente:** `backend/tests/test_boletas.py` line 24 `@patch("app.api.boletas.emit_dte")`
**Aplica a:** todos los tests de `test_guias_despacho.py` que crean guías
```python
@patch("app.api.guias_despacho.emit_dte")   # patch en el módulo donde se usa
def test_...(mock_emit, ...):
    ...
    mock_emit.delay.assert_called_once()
```

### Fixture `audit_enabled`
**Fuente:** `backend/tests/conftest.py` lines 41–51
**Aplica a:** `test_audit_log_diff` en `test_guias_despacho.py`
```python
def test_audit_log_diff(client, admin_token, audit_enabled):
    from app.models.audit_log import AuditLog
    # ...
    logs = db.query(AuditLog).filter_by(model_name="GuiaDespacho").all()
```

---

## No Analog Found

Ningún archivo sin análogo — todos los archivos tienen un patrón directo en el codebase existente.

---

## Assumptions que el Planner Debe Resolver

| # | Archivo afectado | Assumption | Acción requerida |
|---|-----------------|------------|------------------|
| A1 | `guias_despacho.py`, `dte_service.py` | `precio_unitario` es bruto (como boleta) | Confirmar antes de Phase 2 UI; para Phase 1 seguir patrón boleta |
| A2 | `dte_service.py:build_guia_payload` | Lioren usa `ind_traslado` para motivo | Tarea explícita: validar payload contra sandbox Lioren antes de merge |
| A3 | `dte_service.py:build_guia_payload` | Lioren usa `destino: {direccion, comuna}` | Idem A2 |
| A4 | `dte_service.py:build_guia_payload` | Lioren no requiere RUTChofer/Patente/FchSalida | Idem A2 — si los requiere, extender modelo con campos opcionales |
| D-28 | `test_guias_despacho.py` | Test concurrencia Postgres-only | Planner decide si entra en sprint o queda como TODO(W1-05-followup) |

---

## Metadata

**Analog search scope:** `backend/app/models/`, `backend/app/schemas/`, `backend/app/api/`, `backend/app/services/`, `backend/app/tasks/`, `backend/app/core/`, `backend/migrations/versions/`, `backend/tests/`
**Files scanned:** 18 archivos fuente leídos completamente
**Pattern extraction date:** 2026-04-26
