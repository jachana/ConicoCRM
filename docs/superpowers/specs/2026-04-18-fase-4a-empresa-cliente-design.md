# Conico PMS — Fase 4a: Empresa + Cliente (actualización)

**Fecha:** 2026-04-18  
**Estado:** Aprobado

## Contexto

Fase 4a prepara el modelo de datos para soportar el ciclo NV → Factura (Fase 4b). El hallazgo clave: los documentos (cotizaciones, notas de venta, facturas) pueden referenciar tanto a un **Cliente** (persona de contacto) como a una **Empresa** (entidad de facturación). Varios clientes pueden pertenecer a la misma empresa.

Esta fase también extiende el modelo de `Cliente` con campos operacionales que existían en Monday.com pero faltaban en el sistema.

---

## Alcance

- Nuevo módulo `Empresa`: modelo, API, CRUD frontend, Excel
- Actualización `Cliente`: nuevos campos + relación con Empresa
- Migración `cotizaciones`: agregar `empresa_id` nullable
- Sidebar: agregar "Empresas" en Datos Maestros
- **Fuera de alcance:** Nota de Venta, Factura (Fase 4b)

---

## Modelos de datos

### `Empresa` (nuevo)

```python
class Empresa(Base):
    __tablename__ = "empresas"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255))
    razon_social: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rut: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    forma_pago: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prioridad: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    nota_cobranza: Mapped[str | None] = mapped_column(Text, nullable=True)
    ubicacion: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), ...)
    # relaciones
    clientes: Mapped[list["Cliente"]] = relationship("Cliente", back_populates="empresa")
```

### `Cliente` — campos nuevos (migración)

```python
# nuevos campos a agregar
empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True)
recibe_correo: Mapped[bool] = mapped_column(Boolean, default=True)
forma_pago: Mapped[str | None] = mapped_column(String(100), nullable=True)
despacho_o_retiro: Mapped[str | None] = mapped_column(String(20), nullable=True)  # despacho | retiro
comuna: Mapped[str | None] = mapped_column(String(100), nullable=True)
direccion_despacho: Mapped[str | None] = mapped_column(String(500), nullable=True)
ultimo_contacto: Mapped[date | None] = mapped_column(Date, nullable=True)
forma_captacion: Mapped[str | None] = mapped_column(String(100), nullable=True)
compromiso: Mapped[str | None] = mapped_column(Text, nullable=True)
es_nuevo: Mapped[bool] = mapped_column(Boolean, default=False)
# relación
empresa: Mapped["Empresa | None"] = relationship("Empresa", back_populates="clientes")
```

> Campo `direccion` existente se renombra a `direccion_despacho` en la migración. `notas` existente se mantiene.

### Migración `cotizaciones`

```python
empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True)
```

Todas las cotizaciones existentes quedan con `empresa_id = NULL` — sin ruptura de datos.

---

## API

### `Empresa` — `/api/empresas/`

| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/api/empresas/` | Lista con `?q=` por nombre/rut | todos |
| POST | `/api/empresas/` | Crear | admin/subadmin |
| GET | `/api/empresas/{id}` | Detalle | todos |
| PATCH | `/api/empresas/{id}` | Actualizar | admin/subadmin |
| DELETE | `/api/empresas/{id}` | Solo si sin clientes asociados | admin |
| GET | `/api/empresas/export/excel` | Excel | todos |

### `Cliente` — cambios a `/api/clientes/`

- `ClienteBase`, `ClienteCreate`, `ClienteUpdate` se actualizan: `direccion` → `direccion_despacho` + todos los campos nuevos (todos opcionales en Update)
- `ClienteOut` incluye objeto `empresa` anidado (nullable):
  ```python
  class EmpresaRef(BaseModel):
      id: int
      nombre: str
      razon_social: str | None
      rut: str | None
  
  class ClienteOut(ClienteBase):
      id: int
      empresa: EmpresaRef | None
      created_at: datetime
  ```
- Nuevo filtro `?empresa_id=` en GET `/api/clientes/`

### `Cotizacion` — cambio mínimo

- `POST` y `PATCH` aceptan `empresa_id: int | None`
- `CotizacionOut` incluye `empresa: EmpresaRef | None`
- Al crear cotización: si cliente tiene `empresa_id`, se sugiere pero no se fuerza

---

## Frontend

### Nueva página `Empresas.tsx`

Patrón idéntico a Clientes/Proveedores:
- Tabla: Nombre, Razón Social, RUT, Forma Pago, Prioridad, Sector, Acciones
- Búsqueda por nombre/RUT (`?q=`)
- Modal crear/editar con todos los campos de Empresa
- Confirmación de eliminación (muestra error si tiene clientes asociados)
- Botón exportar Excel

### Actualización modal `Clientes`

**Sección Empresa (al inicio del formulario):**
- Dropdown searchable "Empresa" (opcional)
- Al seleccionar empresa: muestra read-only bajo el dropdown:
  - RUT Empresa: `{empresa.rut}`
  - Razón Social: `{empresa.razon_social}`
- Al limpiar empresa: esos campos desaparecen

**Campos nuevos editables en modal:**
- Recibe Correo (toggle/checkbox)
- Forma Pago (texto libre)
- Despacho o Retiro (select: `Despacho` | `Retiro`)
- Comuna
- Dirección de Despacho (renombrado desde Dirección)
- Último Contacto (date picker)
- Forma Captación
- Compromiso (textarea)
- Es Nuevo (checkbox)

**Tabla Clientes:**
- Nueva columna "Empresa" (nombre, nullable)

### Actualización `CotizacionDetalle.tsx`

- Dropdown "Empresa" (opcional, searchable) junto al dropdown Cliente
- Al seleccionar un Cliente que tiene empresa: se pre-llena el dropdown Empresa automáticamente
- Empresa puede seleccionarse independientemente del cliente

### Sidebar

Agregar "Empresas" en sección Datos Maestros, antes de "Clientes".

---

## Testing

**Backend:**
- `test_empresas.py`:
  - CRUD completo
  - Búsqueda por nombre y RUT
  - DELETE bloqueado cuando tiene clientes asociados
  - Export Excel
- `test_clientes.py` (extender):
  - Crear cliente con `empresa_id`
  - Verificar `ClienteOut` incluye empresa anidada
  - Filtro `?empresa_id=` retorna solo clientes de esa empresa
- Migración: cotizaciones existentes tienen `empresa_id = NULL`

**Frontend:**
- `Empresas.test.tsx`: renderiza tabla, abre modal, búsqueda funciona
- `Clientes.test.tsx` (actualizar): seleccionar empresa pre-llena RUT/razón social como read-only; limpiar empresa los remueve

---

## Fuera de alcance (esta fase)

- Nota de Venta y Factura (Fase 4b)
- Historial de compras por empresa (derivable desde transacciones)
- "Última Compra" calculada (se puede agregar en Fase 9 — Reportes)
- Documentos adjuntos por empresa
