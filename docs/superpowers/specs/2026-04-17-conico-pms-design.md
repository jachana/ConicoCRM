# Conico PMS — Diseño del sistema

**Fecha:** 2026-04-17  
**Estado:** Aprobado

## Contexto

Pyme chilena que actualmente usa Monday.com para gestión operativa completa. El objetivo es reemplazarlo con una aplicación web hecha a medida que incluya solo los módulos que usan, sin funcionalidades innecesarias.

**Usuarios:** 6 (2 managers, 3 vendedores, 1 sysadmin)  
**Acceso:** Internet (VPS público)  
**País:** Chile (SII fuera del scope inicial)

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | FastAPI (Python) + SQLAlchemy + Alembic |
| Frontend | React + Vite + TailwindCSS + React Query + React Router |
| Base de datos | PostgreSQL |
| PDF | WeasyPrint (templates HTML → PDF) |
| Email | SMTP configurable (SendGrid o servidor propio) |
| Hosting | VPS (Hetzner / DigitalOcean) · Docker Compose · Nginx · HTTPS (Let's Encrypt) |
| Auth | JWT (access + refresh tokens) |

---

## Módulos

### 1. Autenticación y usuarios
- Login con email + contraseña
- JWT con refresh token
- Gestión de usuarios: crear, desactivar, editar rol
- Panel de permisos por usuario: toggles por módulo y acción (ver / crear / editar / eliminar)

### 2. Catálogo de productos
- CRUD de productos: nombre, descripción, precio de costo, precio de venta, stock mínimo, proveedor asociado
- Búsqueda por nombre (usada en autocompletar de cotizaciones)
- Exportar a Excel

### 3. Clientes
- CRUD de clientes: nombre, RUT, email, teléfono, dirección, notas
- Historial de cotizaciones, notas de venta y facturas por cliente

### 4. Proveedores
- CRUD de proveedores: nombre, RUT, contacto, productos que suministran

### 5. Cotizaciones
- Crear cotización asociada a un cliente
- Agregar líneas de producto: al escribir nombre del producto se autocompleta precio, descripción y unidad desde el catálogo (todos los campos editables)
- Campos por línea: producto, descripción, cantidad, precio unitario, descuento, subtotal
- Totales automáticos: subtotal, descuento global, IVA (19%), total
- Estados: Borrador → Enviada → Aprobada → Rechazada
- Exportar PDF con logo y datos de la empresa
- Botón "Enviar por email" (adjunta PDF, destinatario pre-llenado desde cliente)
- Botón "Convertir a Nota de Venta"

### 6. Nota de Venta
- Generada desde cotización aprobada (datos heredados, todos editables)
- Misma estructura de líneas que cotización
- Estados: Pendiente → Entregada → Cancelada
- Exportar PDF + enviar por email
- Botón "Generar Factura"

### 7. Facturas
- Generada desde nota de venta (datos heredados, todos editables)
- Número de factura correlativo
- Estados: Emitida → Pagada → Anulada
- Fecha de vencimiento
- Exportar PDF + enviar por email
- Registro de pago (fecha, monto, método)
- **SII:** fuera del scope inicial, arquitectura preparada para integración futura

### 8. Órdenes de Compra
- Crear OC asociada a proveedor
- Líneas de productos con cantidad y precio
- Estados: Borrador → Enviada → Recibida parcial → Recibida completa → Cancelada
- Al marcar recepción: actualiza stock en inventario automáticamente
- Exportar PDF + enviar por email al proveedor

### 9. Inventario
- Vista de stock actual por producto
- Movimientos: entrada (desde OC), salida (desde factura), ajuste manual
- Historial de movimientos con fecha, tipo y usuario responsable
- Alertas de stock bajo (cuando llega al stock mínimo del catálogo)

### 10. RRHH *(solo Admin)*
- CRUD de empleados: nombre, cargo, sueldo base, fecha de ingreso
- Documentos adjuntos por empleado (contratos, liquidaciones)
- Vacaciones: registro de días tomados / disponibles
- Módulo completamente invisible para SubAdmin y Vendedor

### 11. Dashboard / Reportes
- **Admin / SubAdmin:** ventas totales del período, cotizaciones pendientes, stock crítico, facturas por cobrar, top clientes, top productos
- **Vendedor:** sus propias cotizaciones, notas de venta y facturas del período
- Filtros por rango de fechas
- Exportar reportes a Excel

---

## Flujo principal de documentos

```
Cotización (Borrador)
    ↓ [Enviar]
Cotización (Enviada)
    ↓ [Marcar aprobada]
Cotización (Aprobada)
    ↓ [Convertir a Nota de Venta]
Nota de Venta (Pendiente) ← datos heredados, editables
    ↓ [Generar Factura]
Factura (Emitida) ← datos heredados, editables
    ↓ [Registrar pago]
Factura (Pagada)
```

En cada paso: botón PDF y botón enviar por email.

---

## Roles y permisos

### Roles base

| Módulo | Admin | SubAdmin | Vendedor |
|---|---|---|---|
| Catálogo | CRUD | CRUD | Ver |
| Clientes | CRUD | CRUD | CRUD |
| Proveedores | CRUD | CRUD | — |
| Cotizaciones | CRUD (todas) | CRUD (todas) | CRUD (propias) |
| Nota de Venta | CRUD | CRUD | Ver |
| Facturas | CRUD | CRUD | Ver |
| Órdenes de Compra | CRUD | CRUD | — |
| Inventario | CRUD | CRUD | — |
| RRHH | CRUD | — | — |
| Dashboard | Completo | Completo | Solo propias |
| Usuarios | CRUD | — | — |

### Permisos configurables
El Admin puede sobreescribir los permisos de cualquier SubAdmin o Vendedor de forma individual. La interfaz de gestión de usuarios muestra una tabla de toggles: módulo × acción (ver / crear / editar / eliminar). Los cambios se aplican inmediatamente sin reinicio.

---

## UI / UX

- **Navegación:** sidebar colapsable (iconos ↔ iconos + texto)
- **Tema:** automático según preferencia del OS (dark / light), con toggle manual disponible
- **Tablas:** filtros inline, búsqueda global, paginación, columnas ordenables
- **Formularios:** validación en tiempo real, autocompletar producto en cotizaciones
- **Responsive:** funcional en desktop y tablet (no optimizado para mobile en v1)

---

## Infraestructura

```
Internet
    ↓
Nginx (HTTPS / Let's Encrypt)
    ├── / → React (build estático)
    └── /api → FastAPI (uvicorn)
                ↓
           PostgreSQL
```

Desplegado con Docker Compose. Un solo servidor VPS (2 vCPU / 4 GB RAM es suficiente para 6 usuarios). Backups automáticos de PostgreSQL diarios.

---

## Fuera del scope (v1)

- Integración SII / factura electrónica DTE
- App móvil nativa
- Multi-empresa / multi-sucursal
- API pública para terceros
- Chat / notificaciones en tiempo real (websockets)
