# Conico — Arquitectura de Alto Nivel

> Estado: documento vivo. Última revisión: 2026-04-24. Mantener sincronizado con `PROGRESS.md` y `docs/backlog.md`.
>
> Variables de entorno: ver [`docs/environment-variables.md`](environment-variables.md) para la referencia canónica (backend, frontend, Celery, backups, Sentry).
>
> Integraciones externas: ver [`docs/integrations/dte-lioren.md`](integrations/dte-lioren.md) para el deep-dive de la integración DTE/Lioren (auth, payloads, webhook HMAC, polling, CAF).

---

## 1. Resumen ejecutivo

Conico es un **CRM + ERP ligero** orientado a Pymes chilenas: gestiona el flujo comercial completo (Cotización → Nota de Venta → Factura → Pago) con módulos de inventario, OC a proveedores, RRHH, dashboard configurable, control de crédito/márgenes con flujo de aprobaciones, reportes (incluyendo por marca), tareas/recordatorios automáticos, búsqueda global, cobranza y emisión DTE vía proveedor SII (Lioren).

La aplicación está pensada como **single-tenant on-premise / VPS** (Docker Compose). Multi-tenant SaaS no es meta v1 pero el modelo de datos está cerca de soportarlo (faltan filtros por `tenant_id` en queries y particionamiento de uploads).

---

## 2. Stack técnico

### Backend
| Capa | Tecnología |
| --- | --- |
| Lenguaje | Python 3.11+ |
| Framework HTTP | FastAPI |
| ORM | SQLAlchemy 2.x (Mapped, typed) |
| Migraciones | Alembic |
| DB prod | PostgreSQL |
| DB dev/tests | SQLite (`test.db`) |
| Auth | JWT (access + refresh) |
| PDF | WeasyPrint + Jinja templates (`backend/app/templates/`) |
| Email | SMTP (degradación elegante si no configurado) |
| Async/jobs | Celery + Redis (auto-tareas horarias, polling DTE) |
| HTTP client | httpx (DTE provider, etc.) |
| Tests | pytest |

### Frontend
| Capa | Tecnología |
| --- | --- |
| Lenguaje | TypeScript |
| Framework | React 18 + Vite |
| Routing | react-router-dom v6 |
| Data fetching | TanStack Query v5 |
| State global | Zustand |
| Estilos | Tailwind v3 |
| Charts | Recharts |
| Cmd+K | cmdk |
| Drag & drop dashboard | react-grid-layout |
| Toasts | sonner |
| Iconos | lucide-react |
| Tests | Vitest + Testing Library |

### Infra
- Docker Compose (`docker-compose.yml` dev, `docker-compose.prod.yml` prod)
- Nginx reverse proxy (TLS termination + servir frontend build)
- Volumen `uploads_data` para PDFs de productos y documentos RRHH

---

## 3. Estructura de carpetas

```
backend/
  app/
    api/         # endpoints FastAPI (uno por entidad)
    models/      # SQLAlchemy ORM
    schemas/     # Pydantic v2 (requests/responses)
    services/    # lógica de dominio reutilizable (pdf, email, dte, asignación)
    tasks/       # Celery tasks (auto-tareas, polling DTE)
    templates/   # Jinja para PDFs y emails
    core/        # auth, security, deps de bajo nivel
    config.py    # settings via pydantic-settings
    database.py  # engine + sessionmaker + Base
    celery_app.py
    main.py      # FastAPI app + router includes
  migrations/    # Alembic
  tests/

frontend/src/
  api/           # axios clients por entidad
  components/    # UI compartido (modales, drawers, layout, dashboard, search)
  hooks/         # custom hooks
  pages/         # una por ruta
  stores/        # Zustand (auth principalmente)
  router.tsx
  lib/           # utilidades

docs/            # roadmap, dudas, este archivo, backlog
data_seed/       # seeds opcionales
nginx/           # configs prod
uploads/         # mount runtime para PDFs y documentos
```

---

## 4. Modelo de datos (núcleo)

```
                    ┌─────────────┐
                    │  Empresa    │── 1..N ── SedeDespacho
                    └──┬──────────┘
                       │ 1..N
                       ▼
                    ┌─────────────┐
        ┌── 1..N ──▶│  Cliente    │
        │           └──┬──────────┘
        │              │
        │              │ 1..N
        ▼              ▼
   Proveedor      Cotización ───▶ NotaVenta ───▶ Factura ──▶ Pago
        │           │ lineas       │ lineas      │ lineas    │
        │           │              │             │           │
        ▼           ▼              ▼             ▼           ▼
   OrdenCompra   Producto     MovimientoInv  DteEmision   (Banco recep.)
        │            │
        │            ├── ProductoDocumento (PDFs)
        │            ├── ListaPrecios + ListaPrecioItem
        │            └── Marca
        ▼
   MovimientoInventario (FIFO de entrada)

Factura ──▶ NotaCredito / NotaDebito ──▶ DteEmision
```

**Bloqueos en cadena (chain locking):** al crear el documento downstream, el upstream pasa a `is_locked=True`. PATCH responde 403; banner UI deshabilita campos.

**Numeración correlativa:** cada documento (Cotización, NV, Factura, OC, NC, ND) tiene su propio contador global (`{entidad}_last_id` en `system_config`) gestionado con `SELECT FOR UPDATE` para evitar gaps por concurrencia.

**Constraints clave:**
- `Tarea`: CHECK máx 1 entidad vinculada de las 6 FKs nullables; partial unique index en `dedup_key` para tareas pendientes.
- `DteEmision`: CHECK exactamente 1 de {factura_id, nota_credito_id, nota_debito_id}.

---

## 5. Permisos

- **3 roles base:** `admin`, `subadmin`, `vendedor`.
- **Permisos por usuario** (toggles módulo×acción) almacenados en tabla `permissions` — sobrescriben defaults del rol.
- **Vendedor scoping:** queries filtran por `vendedor_id == current_user.id` automáticamente en cotizaciones/NV/facturas/aprobaciones; reportes filtran datos a sus propias ventas; búsqueda global omite resultados ajenos.
- Bypass por permission flags concretos (`tareas:view_all`, `catalogo:delete`, etc.).

---

## 6. Flujo comercial principal

```
Cliente/Empresa ──▶ Cotización (no_definido → abierta → cerrada_fv | rechazada)
                          │ generar NV
                          ▼
                   NotaVenta (pendiente → despachada → entregada → pagada | cancelada)
                          │ generar Factura
                          ▼
                   Factura (emitida → parcial → pagada | anulada)
                          │ emitir DTE
                          ▼
                   DteEmision (pendiente → emitida → aceptada/rechazada SII)
```

**Eventos colaterales por etapa:**
- Crear NV → descuento de stock (FIFO), bloquea cotización.
- Modificar NV → ajusta diferencia de stock.
- Cancelar NV → devuelve stock.
- Crear Factura → bloquea NV.
- Emitir DTE → bloquea Factura completamente; vía Celery se hace polling al SII.
- Pagar Factura → registra `Pago` (1..N por Factura — soporta pagos parciales).

**Aprobaciones asíncronas:**
- **Crédito:** si la NV excede el cupo de la empresa, se crea `AprobacionCredito` con payload JSON de la NV; admin aprueba → NV se materializa.
- **Margen:** vendedor propone `valor_neto_propuesto` por línea; admin aprueba → recálculo total. "Latest wins": nueva propuesta auto-deniega la pendiente.
- **Costo (lista de precios):** flujo análogo para cambio de costo de producto.

---

## 7. DTE / SII

Conico no se conecta directamente al SII; usa **Lioren** como proveedor SaaS de emisión electrónica.

```
Factura/NC/ND  ──build_payload──▶  DteService  ──httpx──▶  Lioren API ──▶ SII
                                       │                       │
                                       ▼                       ▼
                                  DteEmision          Webhook (HMAC SHA256)
                                  (track_id)            ↑
                                                       Celery task de polling
```

- `DteService` construye payloads (DTE 33 factura, 61 NC, 56 ND).
- `DteEmision` guarda `track_id`, `estado`, `respuesta_sii`, intentos de poll.
- Webhook validado por HMAC con `webhook_secret`.
- Falta: boletas (39/41), guía de despacho electrónica (52), libro de compras/ventas, intercambio DTE.

---

## 8. Auto-tareas (Celery)

`backend/app/tasks/tareas.py` ejecuta cada hora 6 reglas (modelo `ReglaTarea` admin-toggleable):

| Regla | Trigger | Vence |
| --- | --- | --- |
| `cotizacion_vence` | Cotización abierta cerca de `fecha_expiracion` | El día de expiración |
| `factura_vencida` | Factura emitida con `fecha_vencimiento < hoy` | Inmediato |
| `aprobacion_pendiente` | Aprobación crédito/margen/costo > N horas | Configurable |
| `nv_despachada_sin_avanzar` | NV despachada hace > N días sin entregar | Configurable |
| `cliente_sin_actividad` | Cliente sin cotización ni NV en M meses | M*30d |
| `stock_bajo_minimo` | Producto con stock < `stock_minimo` | Hoy |

Idempotencia: `dedup_key` único parcial sobre tareas pendientes. Cuando el evento se resuelve, la tarea se auto-descarta.

---

## 9. Cobranza

- `CobranzaConfig` por empresa (frecuencia días).
- Reportes y vista `/cobranza` con facturas vencidas, próximas a vencer, antigüedad de saldos.
- Recordatorios manuales (campo `ultimo_recordatorio` en Factura). Falta: envío automático de email.

---

## 10. Productos v2

- **Marca** (FK con CRUD admin) — habilita reportes por marca.
- **IVA configurable** por producto (default 19%) con `precio_con_iva` y `costo_con_iva` computados.
- **Documentos** (hasta 5 PDFs por producto) con permiso `catalogo:delete`.
- **Costos por listas de precios** (reemplazó FIFO sólo de costo): `ListaPrecios` + `ListaPrecioItem` cargables por Excel/CSV; `precio_costo_actualizado_en` para detección de costos staleados.
- OC al recepcionar usa el costo de la lista vigente, no FIFO.
- **Sugerencias por historial:** endpoint `/api/productos/sugerencias?cliente_id=…` ranquea productos comprados por el cliente/empresa para autocomplete.

---

## 11. Inventario

- **Stock por producto** (`stock` campo en Producto, mantenido por trigger lógico desde `MovimientoInventario`).
- **Movimientos:** entrada (recepción OC), salida (NV creada), ajuste manual (motivo: `conteo_fisico` | `merma` | `correccion` | `otro`).
- **Historial** global y por producto con filtros tipo/fecha.
- **Alertas:** badge en sidebar, banner en `/inventario`, indicador en catálogo. Stale-cost threshold configurable.

---

## 12. Búsqueda global (Cmd+K)

- Endpoint `/api/search` fan-out paralelo a 8 entidades.
- Permission-aware (omite categorías sin permiso, vendedor scoping).
- Modal `cmdk` con grupos, recientes en localStorage, debounce 200ms, AbortController.
- Atajo configurable por usuario (Ctrl+K / Ctrl+P / Ctrl+Shift+F / Alt+S) detectando Mac.

---

## 13. Dashboard configurable

- 8 widgets (KPI, barras, línea, tablas).
- Layout persistido en `dashboard_layouts` por rol; admin edita con drag-and-drop.
- Templates predefinidos: Ventas / Operacional / Completo.
- Vendedor ve datos filtrados a sus ventas; sin acceso a widgets admin-only.

---

## 14. Despliegue

```
[Internet] ──▶ Nginx (443/80, TLS)
                  │
        ┌─────────┼─────────────┐
        ▼         ▼             ▼
    /api      /             /uploads
        │         │             │
   FastAPI   Frontend       Volumen
   (uvicorn) (build vite)   uploads_data
        │
        ├─▶ Postgres
        ├─▶ Redis (Celery broker + result backend)
        └─▶ Celery worker (jobs horarios)
        └─▶ Celery beat (scheduler)
```

Variables clave (`backend/app/config.py`):
- `DATABASE_URL`, `JWT_SECRET`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`
- `SMTP_*`
- `CORS_ORIGINS`
- `LIOREN_API_KEY`, `LIOREN_API_URL`, `LIOREN_WEBHOOK_SECRET`

---

## 15. Calidad y CI

- Backend: `pytest` (smoke + integration). DB de pruebas SQLite.
- Frontend: `vitest` por página.
- Sin pipeline CI configurado todavía (gap — ver backlog).

---

## 16. Brechas arquitectónicas conocidas

1. **Multi-tenant:** modelo no tiene `tenant_id`; uploads compartidos. Bloqueante si se quiere SaaS.
2. **Audit log:** no existe `AuditLog` global; sólo flags `is_locked` y campos `*_at`. Crítico cuando hay >3 usuarios concurrentes.
3. **Notificaciones:** no hay campana in-app ni email digest. Tareas suplen parcialmente.
4. **Boletas / guías electrónicas / libro IVA:** DTE solo cubre 33/61/56.
5. **Conciliación bancaria:** no existe.
6. **Multi-moneda / UF / USD:** todos los montos asumen CLP.
7. **2FA / SSO:** sólo password.
8. **Customer portal:** clientes no pueden ver sus facturas/cotizaciones.
9. **Backup automático:** sin script de respaldo programado.
10. **CI/CD:** sin pipeline (lint + test + deploy).
