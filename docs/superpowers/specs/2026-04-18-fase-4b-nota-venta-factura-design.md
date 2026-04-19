# Conico PMS — Fase 4b: Nota de Venta + Factura

**Fecha:** 2026-04-18  
**Estado:** Aprobado

## Contexto

Fase 4b implementa el ciclo de ventas completo: Cotización → Nota de Venta → Factura. Cada documento tiene número correlativo propio y gestiona su propio estado. Una NV puede existir sin Factura; una Factura puede existir sin NV (standalone).

---

## Decisiones de diseño

- **Estados independientes:** NV y Factura tienen su propio campo `estado`. Sin sincronización automática.
- **Líneas copiadas:** Al generar NV desde cotización (o Factura desde NV), las líneas se copian como snapshot — editable por rol.
- **Permisos de estado NV:** Vendedor puede marcar `despachada`/`entregada`; solo admin/subadmin pueden `pagada`/`cancelada`.
- **Líneas de Factura:** Fijas por defecto; solo Admin puede editarlas.
- **Creación NV desde cotización:** Copia todas las líneas automáticamente (editables después). La cotización queda con estado `cerrada_fv` automáticamente.
- **Una Factura por NV:** Una NV puede tener como máximo una Factura vinculada. El botón "Generar Factura" se deshabilita si ya existe una. Una Factura standalone (sin NV) no tiene esta restricción.

---

## Modelos de datos

### `NotaVenta`

```python
class NotaVenta(Base):
    __tablename__ = "nota_ventas"
    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[int] = mapped_column(unique=True, index=True)
    cotizacion_id: Mapped[int | None] = mapped_column(ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"))
    empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True)
    vendedor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    contacto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha: Mapped[date] = mapped_column(Date, default=date.today)
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    correo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total_iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), ...)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), ...)
    # relaciones
    cliente: Mapped["Cliente"] = relationship(...)
    empresa: Mapped["Empresa | None"] = relationship(...)
    vendedor: Mapped["User | None"] = relationship(...)
    cotizacion: Mapped["Cotizacion | None"] = relationship(...)
    lineas: Mapped[list["NotaVentaLinea"]] = relationship(cascade="all, delete-orphan")
    factura: Mapped["Factura | None"] = relationship(back_populates="nv", uselist=False)
```

Estados válidos: `pendiente | despachada | entregada | pagada | cancelada`

### `NotaVentaLinea`

```python
class NotaVentaLinea(Base):
    __tablename__ = "nota_venta_lineas"
    id: Mapped[int] = mapped_column(primary_key=True)
    nv_id: Mapped[int] = mapped_column(ForeignKey("nota_ventas.id", ondelete="CASCADE"))
    orden: Mapped[int] = mapped_column(default=0)
    producto_id: Mapped[int | None] = mapped_column(ForeignKey("productos.id", ondelete="SET NULL"), nullable=True)
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    descripcion: Mapped[str] = mapped_column(String(500))
    formato: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cantidad: Mapped[Decimal] = mapped_column(Numeric(12, 4))
    valor_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    iva: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    margen: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
```

### `Factura`

```python
class Factura(Base):
    __tablename__ = "facturas"
    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[int] = mapped_column(unique=True, index=True)
    cotizacion_id: Mapped[int | None] = mapped_column(ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True)
    nv_id: Mapped[int | None] = mapped_column(ForeignKey("nota_ventas.id", ondelete="SET NULL"), nullable=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"))
    empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True)
    vendedor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    contacto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha: Mapped[date] = mapped_column(Date, default=date.today)
    estado: Mapped[str] = mapped_column(String(20), default="emitida")
    fecha_vencimiento: Mapped[date | None] = mapped_column(Date, nullable=True)
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    correo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total_iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    fecha_pago: Mapped[date | None] = mapped_column(Date, nullable=True)
    monto_pagado: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    metodo_pago: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), ...)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), ...)
    # relaciones
    cliente: Mapped["Cliente"] = relationship(...)
    empresa: Mapped["Empresa | None"] = relationship(...)
    vendedor: Mapped["User | None"] = relationship(...)
    cotizacion: Mapped["Cotizacion | None"] = relationship(...)
    nv: Mapped["NotaVenta | None"] = relationship(back_populates="facturas")
    lineas: Mapped[list["FacturaLinea"]] = relationship(cascade="all, delete-orphan")
```

Estados válidos: `emitida | pagada | anulada`

`metodo_pago` valores: `efectivo | transferencia | cheque | debito | credito | deposito`

### `FacturaLinea`

Estructura idéntica a `NotaVentaLinea`, con FK `factura_id → facturas.id`.

---

## SystemConfig

Dos nuevas claves en `system_config`:
- `nv_last_id` — número correlativo de NV (inicial: 1)
- `factura_last_id` — número correlativo de Factura (inicial: 1)

---

## API

### `/api/nota_ventas/`

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/` | Lista (filtros: estado, vendedor_id, cliente_id, fecha_desde, fecha_hasta) | todos |
| POST | `/` | Crear NV desde cero | admin/subadmin/vendedor |
| POST | `/from_cotizacion/{cot_id}` | Crear NV copiando líneas de cotización | admin/subadmin/vendedor |
| GET | `/{id}` | Detalle | todos |
| PATCH | `/{id}` | Actualizar header | admin/subadmin (o vendedor_id == current) |
| PUT | `/{id}/lineas` | Reemplazar líneas | admin/subadmin (o vendedor_id == current) |
| PATCH | `/{id}/estado` | Cambiar estado (con validación de rol) | ver permisos abajo |
| DELETE | `/{id}` | Solo si `pendiente` | admin/subadmin |
| GET | `/{id}/pdf` | PDF | todos |
| POST | `/{id}/email` | Email con PDF | admin/subadmin/vendedor |
| GET | `/export/excel` | Excel | todos |

**Permisos PATCH `/{id}/estado`:**
- `pendiente → despachada`: admin, subadmin, vendedor
- `despachada → entregada`: admin, subadmin, vendedor
- `entregada → pagada`: admin, subadmin solo
- `* → cancelada`: admin, subadmin solo
- Transiciones inválidas retornan 422

### `/api/facturas/`

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/` | Lista (filtros: estado, cliente_id, fecha_desde, fecha_hasta) | todos |
| POST | `/` | Crear Factura standalone | admin/subadmin |
| POST | `/from_nv/{nv_id}` | Generar desde NV (copia líneas + totales) | admin/subadmin |
| GET | `/{id}` | Detalle | todos |
| PATCH | `/{id}` | Actualizar header | admin/subadmin |
| PUT | `/{id}/lineas` | Reemplazar líneas | admin solo |
| PATCH | `/{id}/estado` | Cambiar estado | admin/subadmin |
| DELETE | `/{id}` | Solo si `emitida` | admin/subadmin |
| GET | `/{id}/pdf` | PDF | todos |
| POST | `/{id}/email` | Email con PDF | admin/subadmin |
| GET | `/export/excel` | Excel | todos |

**Permisos PATCH `/{id}/estado` Factura:**
- `emitida → pagada`: admin/subadmin (requiere fecha_pago, monto_pagado, metodo_pago en body)
- `emitida → anulada`: admin/subadmin
- `pagada → anulada`: admin solo
- Transiciones inválidas retornan 422

---

## Permisos (permissions.py)

`nota_venta` y `facturas` ya están en `MODULES`. Confirmar defaults:

```python
# subadmin
"nota_venta": {"view": True, "create": True, "edit": True, "delete": True},
"facturas":   {"view": True, "create": True, "edit": True, "delete": True},

# vendedor
"nota_venta": {"view": True, "create": True, "edit": True, "delete": False},
"facturas":   {"view": True, "create": False, "edit": False, "delete": False},
```

---

## Frontend

### Nuevas páginas

**`NotaVentas.tsx`**
- Tabla: Número, Fecha, Cliente, Empresa, Estado (badge coloreado), Total
- Filtros: estado, fechas
- Botón "Nueva NV" → abre `NotaVentaDetalle` en modo creación
- Excel export

**`NotaVentaDetalle.tsx`** (patrón igual a `CotizacionDetalle.tsx`)
- Header editable: fecha, cliente, empresa, vendedor, contacto, correo, nota
- Referencia a cotización (si viene de una): badge read-only con link
- Tabla de líneas: autocomplete producto, cantidad, precio, totales — editable
- Totales: neto, IVA, total
- Badge de estado con botón "Cambiar estado" (dropdown con transiciones válidas según rol)
- Botones: PDF, Email
- Botón "Generar Factura" (visible si no tiene factura) → POST `/api/facturas/from_nv/{id}`
- Si tiene Factura: badge/link a la factura generada

**`Facturas.tsx`**
- Tabla: Número, Fecha, Cliente, Estado (badge), Vencimiento, Total
- Excel export

**`FacturaDetalle.tsx`**
- Header: fecha, cliente, empresa, vendedor, contacto, correo, nota, fecha_vencimiento
- Referencias (read-only): NV origen, Cotización origen
- Tabla de líneas: read-only (admin puede editar con botón "Editar líneas")
- Estado badge + botón cambiar estado
- Panel de pago (visible cuando estado = `pagada`): fecha_pago, monto_pagado, metodo_pago
- Botones: PDF, Email

### Páginas modificadas

**`CotizacionDetalle.tsx`** — botón "Crear NV" que llama a `POST /api/nota_ventas/from_cotizacion/{id}` y redirige al detalle de la NV creada.

**`Sidebar.tsx` + `router.tsx`** — agregar "Notas de Venta" (FileText icon) y "Facturas" (Receipt icon) después de Cotizaciones.

**`frontend/src/types/index.ts`** — agregar `NotaVenta`, `NotaVentaLinea`, `Factura`, `FacturaLinea`, actualizar `Module` type.

---

## PDF y Email

### Nota de Venta
- Template: `backend/app/templates/nota_venta.html` (copia de `cotizacion.html`, título "NOTA DE VENTA")
- Filename: `NV - {numero} {fecha}.{contacto or cliente}.pdf`
- Email subject: `Nota de Venta NV-{numero:05d} — Conico`

### Factura
- Template: `backend/app/templates/factura.html` (título "FACTURA")
- Campos adicionales (pendiente confirmar con cliente): fecha_vencimiento y condición de pago mostrados en el documento
- Filename: `FAC - {numero} {fecha}.{contacto or cliente}.pdf`
- Email subject: `Factura FAC-{numero:05d} — Conico`

> **Pendiente confirmar con cliente:** campos adicionales requeridos en PDF de Factura (número OC cliente, condición de pago, etc.) — ver `docs/dudas-cliente.md`

---

## Testing

### Backend

**`test_nota_ventas.py`:**
- Sin auth → 401
- Crear NV desde cero → 201, numero asignado
- Crear NV desde cotización → líneas copiadas, cotizacion_id seteado
- Listar, obtener, obtener 404
- Actualizar header
- Reemplazar líneas → totales recalculados
- Cambio de estado: vendedor puede despachada/entregada, no pagada → 403
- Admin puede pagada/cancelada
- Transición inválida → 422
- Eliminar en estado pendiente → 204
- Eliminar en estado no-pendiente → 409
- PDF → bytes (200)
- Excel export

**`test_facturas.py`:**
- Sin auth → 401
- Crear Factura standalone → 201
- Generar desde NV → líneas copiadas, nv_id seteado, estado=emitida
- Listar, obtener, obtener 404
- Actualizar header
- Vendedor no puede editar líneas → 403
- Admin puede editar líneas → 200
- Cambio estado emitida→pagada: requiere fecha_pago, monto, método
- Cambio estado emitida→anulada
- Eliminar en emitida → 204
- Eliminar en pagada → 409
- PDF + Excel

### Frontend

**`NotaVentas.test.tsx`:** renderiza tabla, muestra estado badge, botón nueva NV.

**`Facturas.test.tsx`:** renderiza tabla, muestra estado badge.

---

## Fuera de alcance (esta fase)

- Integración SII / DTE
- Campos PDF adicionales de Factura pendientes de confirmar con cliente (se agregan cuando se confirmen)
- Historial de pagos múltiples (un solo registro de pago por factura)
- Notas de crédito
