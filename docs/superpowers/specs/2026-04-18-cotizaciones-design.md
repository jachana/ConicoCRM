# Conico PMS — Fase 3: Cotizaciones

**Fecha:** 2026-04-18
**Estado:** Aprobado

## Contexto

Fase 3 reemplaza el módulo de cotizaciones de Monday.com. Los vendedores generan cotizaciones diariamente y el flujo principal es: crear cotización con líneas de productos → generar PDF → enviar por email al cliente. La numeración actual está en ~12250 y debe continuar desde allí.

---

## Alcance

Esta fase cubre:
- Extensión del catálogo: campo `formato` en Producto
- `SystemConfig`: tabla de configuración admin para ajustes globales
- Módulo Cotizaciones completo: modelos, API, PDF, email scaffolding, frontend
- **Fuera de alcance:** conversión a Nota de Venta (Fase 4), integración SII

---

## Arquitectura

Cinco componentes nuevos sobre el stack existente (FastAPI + SQLAlchemy + React + React Query):

1. **SystemConfig** — tabla key/value para configuración global
2. **Cotizacion + CotizacionLinea** — modelos del documento
3. **PDF service** — WeasyPrint + Jinja2
4. **Email service** — SMTP con smtplib, degradación elegante si no configurado
5. **Frontend** — lista + página detalle con líneas y autocomplete

---

## Modelo de datos

### Extensión a Producto (migración)

```python
sku: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
formato: Mapped[str | None] = mapped_column(String(50), nullable=True)
```

`sku` es el código de producto (ej. `161212`, `104282`). Campo libre, único cuando se provee.
`formato` valores típicos: `Balde`, `Tambor`, `Spray`, `Bins`. Campo libre, no enum.

`ProductoBusquedaOut` (esquema existente en `schemas/producto.py`) debe extenderse con:
```python
sku: str | None = None
formato: str | None = None
precio_costo: Decimal
```
Estos campos son necesarios para que el autocomplete pre-llene SKU, Formato y calcule Margen al seleccionar un producto.

### SystemConfig

```python
class SystemConfig(Base):
    __tablename__ = "system_config"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
```

Claves iniciales:
| key | valor inicial | descripción |
|---|---|---|
| `cotizacion_last_id` | `12250` | Último número de cotización usado |
| `empresa_nombre` | `Distribuidora Conico Ltda.` | Razón social para PDFs |
| `empresa_rut` | `82.638.800-5` | RUT empresa |
| `empresa_direccion` | `` | Dirección para PDFs |
| `empresa_logo_url` | `` | URL o path del logo |

### Cotizacion

```python
class Cotizacion(Base):
    __tablename__ = "cotizaciones"
    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id", ondelete="RESTRICT"))
    vendedor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    contacto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha: Mapped[date] = mapped_column(Date, default=date.today)
    estado: Mapped[str] = mapped_column(String(20), default="no_definido")
    # estados válidos: no_definido | abierta | cerrada_fv | rechazada
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    correo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), ...)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), ...)
    cliente: Mapped["Cliente"] = relationship("Cliente")
    vendedor: Mapped["User"] = relationship("User")
    lineas: Mapped[list["CotizacionLinea"]] = relationship(
        "CotizacionLinea", back_populates="cotizacion",
        cascade="all, delete-orphan", order_by="CotizacionLinea.orden"
    )
```

### CotizacionLinea

```python
class CotizacionLinea(Base):
    __tablename__ = "cotizacion_lineas"
    id: Mapped[int] = mapped_column(primary_key=True)
    cotizacion_id: Mapped[int] = mapped_column(ForeignKey("cotizaciones.id", ondelete="CASCADE"))
    orden: Mapped[int] = mapped_column(Integer)
    producto_id: Mapped[int | None] = mapped_column(
        ForeignKey("productos.id", ondelete="SET NULL"), nullable=True
    )
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    descripcion: Mapped[str] = mapped_column(String(500))
    formato: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cantidad: Mapped[int] = mapped_column(Integer, default=1)
    valor_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    margen: Mapped[Decimal | None] = mapped_column(Numeric(10, 8), nullable=True)
    cotizacion: Mapped["Cotizacion"] = relationship("Cotizacion", back_populates="lineas")
    producto: Mapped["Producto | None"] = relationship("Producto")
```

**Cálculos (ejecutados en el backend al guardar líneas):**
```
total_neto_linea = cantidad × valor_neto
iva_linea        = total_neto_linea × 0.19
total_linea      = total_neto_linea + iva_linea
margen           = (valor_neto - producto.precio_costo) / valor_neto  # si producto existe
                   None  # si es línea libre

cotizacion.total_neto = SUM(linea.total_neto)
cotizacion.total_iva  = SUM(linea.iva)
cotizacion.total      = SUM(linea.total)
```

**Asignación de número correlativo:**
```python
# En transacción DB con SELECT FOR UPDATE en la fila SystemConfig
last_id = int(db.query(SystemConfig).filter_by(key="cotizacion_last_id").with_for_update().one().value)
numero = last_id + 1
# Crear cotización con numero=numero
# Actualizar SystemConfig cotizacion_last_id = str(numero)
```

---

## API

### SystemConfig — `/api/config/`

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/api/config/` | Listar todas las claves | admin |
| PATCH | `/api/config/` | Actualizar claves (body: `{key: value, ...}`) | admin |

### Cotizaciones — `/api/cotizaciones/`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/cotizaciones/` | Lista con filtros: `estado`, `vendedor_id`, `cliente_id`, `fecha_desde`, `fecha_hasta` |
| POST | `/api/cotizaciones/` | Crear con líneas, auto-asigna número |
| GET | `/api/cotizaciones/{id}` | Detalle completo con líneas |
| PATCH | `/api/cotizaciones/{id}` | Actualizar header |
| PUT | `/api/cotizaciones/{id}/lineas` | Reemplazar todas las líneas, recalcula totales |
| DELETE | `/api/cotizaciones/{id}` | Solo si `estado = no_definido` |
| GET | `/api/cotizaciones/{id}/pdf` | StreamingResponse PDF |
| POST | `/api/cotizaciones/{id}/email` | Enviar email; 503 si SMTP no configurado |
| GET | `/api/cotizaciones/export/excel` | Exportar lista a Excel |

**Permisos:**
- `vendedor`: crear propio (`vendedor_id = current_user.id`), ver todos, editar/eliminar solo propios
- `admin` / `subadmin`: CRUD completo sobre todas

**Módulo de permisos:** `"cotizaciones"` (ya existe en `permissions.py`)

---

## Servicio PDF

**Archivo:** `backend/app/services/pdf.py`
**Template:** `backend/app/templates/cotizacion.html` (Jinja2)

```python
from weasyprint import HTML
from jinja2 import Environment, FileSystemLoader

def generar_pdf_cotizacion(cotizacion: Cotizacion, config: dict) -> bytes:
    env = Environment(loader=FileSystemLoader("app/templates"))
    template = env.get_template("cotizacion.html")
    html_str = template.render(cotizacion=cotizacion, config=config)
    return HTML(string=html_str).write_pdf()
```

**Nombre de archivo PDF:** `COT - {numero} {fecha}.{contacto}. {razon_social}.pdf`

**Datos empresa en template** (desde SystemConfig):
- `empresa_nombre`, `empresa_rut`, `empresa_direccion`, `empresa_logo_url`

**Contenido del PDF:**
- Header: logo + datos empresa (izquierda), número COT + fecha (derecha)
- Datos cliente: razón social, RUT, contacto, email, teléfono
- Tabla de líneas: Nº, SKU, Descripción, Formato, Cantidad, Valor Neto, Total Neto
- Totales: Total Neto, IVA (19%), Total
- Nota (si existe)

**Margen NO aparece en el PDF** (es información interna).

---

## Servicio Email

**Archivo:** `backend/app/services/email.py`

Variables de entorno requeridas: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`

```python
def enviar_cotizacion(cotizacion: Cotizacion, pdf_bytes: bytes) -> None:
    """
    Raises EmailNotConfiguredError si faltan variables SMTP.
    Raises SMTPException si el envío falla.
    """
```

Comportamiento del endpoint `POST /api/cotizaciones/{id}/email`:
- Si SMTP no configurado → `503 Service Unavailable` con `{"detail": "Email no configurado. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM en el servidor."}`
- Si SMTP configurado y envío exitoso → `200 OK`
- Si SMTP configurado pero falla → `502 Bad Gateway` con detalle del error

Asunto del email: `Cotización COT-{numero} — {empresa_nombre}`
Cuerpo: texto simple en español con los datos de la cotización.
Adjunto: PDF generado en el momento.

---

## Frontend

### Archivos

```
frontend/src/
  types/index.ts           (modificar: agregar Cotizacion, CotizacionLinea, SystemConfig)
  router.tsx               (modificar: agregar ruta /cotizaciones y /cotizaciones/:id)
  pages/
    Cotizaciones.tsx        (nuevo: lista)
    Cotizaciones.test.tsx   (nuevo)
    CotizacionDetalle.tsx   (nuevo: crear/editar)
    CotizacionDetalle.test.tsx (nuevo)
```

### `Cotizaciones.tsx` (lista)

Columnas: Nº, Fecha, Cliente (razón social), Contacto, Total, Estado, Encargado, Acciones
- Filtros: estado (select), fecha desde/hasta (date inputs)
- Badge de color por estado:
  - `no_definido` → gris
  - `abierta` → azul
  - `cerrada_fv` → verde
  - `rechazada` → rojo
- Acciones por fila: Ver/Editar, PDF, Email, Eliminar (solo no_definido)
- Botón "Nueva cotización"

### `CotizacionDetalle.tsx` (crear/editar)

Página completa (no modal). Dividida en dos secciones:

**Header:**
- Cliente (searchable select → `/api/clientes/`)
- Contacto (texto libre, pre-llenado desde cliente.nombre si se selecciona)
- Correo (pre-llenado desde cliente.email)
- Fecha (date picker, default hoy)
- Estado (select)
- Nota (textarea)
- Encargado (pre-llenado con usuario actual, editable por admin/subadmin)

**Tabla de líneas:**
Columnas: Nº, SKU, Descripción*, Formato, Cantidad*, Valor Neto*, Total Neto, IVA, Total, Margen, Acciones

- Descripción: input de texto con **autocomplete** → llama `GET /api/productos/buscar?q=` al escribir ≥2 caracteres; al seleccionar resultado pre-llena SKU, Formato, Valor Neto, Margen
- Margen: visible para todos, editable solo admin/subadmin
- Botón "Agregar línea" → nueva fila vacía (línea libre sin SKU)
- Botón "×" por fila para eliminar
- Totales calculados en tiempo real en el cliente (no requiere llamada API)

**Botones de acción (esquina superior derecha):**
- Guardar (POST/PATCH header + PUT lineas)
- PDF (GET pdf → abre en nueva pestaña)
- Enviar Email (POST email → toast de éxito/error)

### Tipos TypeScript nuevos

```typescript
export interface SystemConfig {
  key: string
  value: string
}

export interface CotizacionLinea {
  id?: number
  orden: number
  producto_id: number | null
  sku: string | null
  descripcion: string
  formato: string | null
  cantidad: number
  valor_neto: number
  total_neto: number
  iva: number
  total: number
  margen: number | null
}

export interface Cotizacion {
  id: number
  numero: number
  cliente_id: number
  vendedor_id: number
  contacto: string | null
  fecha: string
  estado: 'no_definido' | 'abierta' | 'cerrada_fv' | 'rechazada'
  nota: string | null
  correo: string | null
  total_neto: number
  total_iva: number
  total: number
  created_at: string
  updated_at: string
  cliente?: Cliente
  vendedor?: User
  lineas?: CotizacionLinea[]
}
```

También agregar al tipo `Producto` existente:
```typescript
sku: string | null
formato: string | null
```

---

## Dependencias nuevas

```
# backend/requirements.txt
weasyprint==62.3
jinja2==3.1.4   # ya incluida en FastAPI, verificar versión
```

WeasyPrint requiere librerías del sistema (`libpango`, `libcairo`). El `Dockerfile` debe incluir:
```dockerfile
RUN apt-get install -y libpango-1.0-0 libpangoft2-1.0-0 libcairo2 libgdk-pixbuf2.0-0
```

---

## Testing

**Backend:**
- Tests de modelos: crear cotización con líneas, verificar cálculos
- Tests de API: CRUD completo, permiso vendedor solo-propios, eliminar solo no_definido
- Test PDF: verifica que el endpoint retorna content-type `application/pdf`
- Test email sin SMTP: verifica 503
- Tests de SystemConfig: leer/actualizar

**Frontend:**
- `Cotizaciones.test.tsx`: renderiza lista, muestra badges de estado
- `CotizacionDetalle.test.tsx`: renderiza formulario, agrega línea, calcula totales

---

## Fuera de alcance (esta fase)

- Conversión cotización → Nota de Venta (Fase 4)
- Historial de cotizaciones en ficha de cliente
- Plantilla PDF personalizable desde UI
- Paginación del listado (suficiente con filtros por ahora dado volumen ~50/día)
