# DTE (Documentos Tributarios Electrónicos) Design Spec

## Goal

Integrar emisión de documentos tributarios electrónicos (Factura tipo 33, Nota de Crédito tipo 61, Nota de Débito tipo 56) con el SII usando Lioren como proveedor API. Conico orquesta la emisión via Celery + Redis; el estado SII se actualiza por webhook de Lioren y polling de fallback.

---

## Architecture

```
Conico Backend
├── DteService          → wrapper Lioren API
├── Celery Tasks
│   ├── emit_dte        → envía documento a Lioren, guarda TrackID
│   └── poll_dte_status → consulta estado SII via Lioren (Celery Beat, cada 5 min)
├── Webhook endpoint    → POST /api/dte/webhook (Lioren notifica estado SII)
└── Redis               → broker + result backend para Celery

Nuevos modelos
├── NotaCredito + NotaCreditoLinea   (tipo 61)
├── NotaDebito  + NotaDebitoLinea    (tipo 56)
└── DteEmision  → registro centralizado por documento emitido
```

**Infraestructura:** Redis + Celery worker + Celery Beat. En dev: docker-compose. En prod: servicios separados.

---

## Data Models

### DteEmision
Registro central de cada intento de emisión DTE.

| Campo | Tipo | Notas |
|---|---|---|
| id | int PK | |
| tipo | str(3) | "033", "061", "056" |
| folio | int nullable | asignado por Lioren |
| track_id | str nullable | devuelto por SII via Lioren |
| estado | str(20) | `pendiente` → `procesando` → `aceptado` \| `rechazado` \| `anulado` \| `timeout` |
| factura_id | int FK nullable | referencia a Factura |
| nota_credito_id | int FK nullable | referencia a NotaCredito |
| nota_debito_id | int FK nullable | referencia a NotaDebito |
| monto_neto | int | sin IVA, en pesos |
| monto_iva | int | 19% |
| monto_total | int | |
| respuesta_sii | JSON nullable | respuesta completa de Lioren/SII |
| intentos_poll | int | default 0, max 20 |
| created_at | datetime | |
| emitido_at | datetime nullable | cuando Lioren aceptó el envío |
| aceptado_at | datetime nullable | cuando SII aceptó |

Constraint: exactamente uno de `factura_id`, `nota_credito_id`, `nota_debito_id` debe ser no-nulo.

### NotaCredito
| Campo | Tipo | Notas |
|---|---|---|
| id | int PK | |
| numero | int | secuencial, desde SystemConfig `nc_last_id` |
| fecha | date | |
| cliente_id | int FK | referencia a Cliente |
| razon | str(500) | motivo de la NC |
| monto_neto | int | calculado de líneas |
| monto_iva | int | |
| monto_total | int | |
| dte_estado | str(20) | `no_emitida` \| `pendiente` \| `procesando` \| `aceptada` \| `rechazada` |
| created_at | datetime | |

### NotaCreditoLinea
| Campo | Tipo |
|---|---|
| id | int PK |
| nota_credito_id | int FK |
| descripcion | str(500) |
| cantidad | decimal(10,2) |
| precio_unitario | int |
| subtotal | int |

### NotaDebito + NotaDebitoLinea
Misma estructura que NotaCredito / NotaCreditoLinea.

### Cambio a Factura
Agregar campo `dte_estado str(20)` con default `no_emitida`. Valores: `no_emitida | pendiente | procesando | aceptada | rechazada`.

---

## API Endpoints

```
POST   /api/dte/facturas/{id}/emitir        → confirma emisión, encola emit_dte
POST   /api/dte/notas-credito/              → crear NC con líneas
GET    /api/dte/notas-credito/              → listar NCs (con dte_estado)
GET    /api/dte/notas-credito/{id}          → detalle NC
POST   /api/dte/notas-credito/{id}/emitir   → encola emit_dte para NC
POST   /api/dte/notas-debito/               → crear ND con líneas
GET    /api/dte/notas-debito/               → listar NDs
GET    /api/dte/notas-debito/{id}           → detalle ND
POST   /api/dte/notas-debito/{id}/emitir    → encola emit_dte para ND
POST   /api/dte/webhook                     → Lioren notifica estado SII (no requiere auth JWT)
GET    /api/dte/emision/{id}                → detalle DteEmision
```

Todos los endpoints (excepto `/webhook`) requieren permiso `facturas.create`.

---

## Celery Tasks

### `emit_dte(emision_id: int)`
1. Carga `DteEmision` → construye payload Lioren según tipo (33/61/56)
2. POST a Lioren API → recibe `track_id` y `folio`
3. Actualiza `DteEmision`: `estado=procesando`, guarda `track_id`, `folio`, `emitido_at`
4. Actualiza `dte_estado` en el documento origen (Factura/NC/ND)
5. Reintento automático: max 3, backoff exponencial (60s, 300s, 900s). Si agota reintentos → `estado=rechazado` con error en `respuesta_sii`.

### `poll_dte_status` (Celery Beat, cada 5 minutos)
1. Consulta todas las `DteEmision` con `estado=procesando` y `intentos_poll < 20`
2. Para cada una: GET Lioren status API con `track_id`
3. Si SII respondió: actualiza `estado`, `aceptado_at`, `respuesta_sii`; sincroniza `dte_estado` en documento origen
4. Si no respondió: incrementa `intentos_poll`
5. Si `intentos_poll >= 20`: marca `estado=timeout`

### Webhook `POST /api/dte/webhook`
1. Valida firma HMAC del payload (usando `LIOREN_WEBHOOK_SECRET`)
2. Busca `DteEmision` por `track_id`
3. Actualiza estado y sincroniza documento origen
4. Responde `200 OK` en < 2s (procesamiento asíncrono si necesario)

---

## DteService

Clase `DteService` en `backend/app/services/dte.py`:

```python
class DteService:
    def build_factura_payload(self, factura: Factura) -> dict
    def build_nc_payload(self, nc: NotaCredito) -> dict
    def build_nd_payload(self, nd: NotaDebito) -> dict
    def emit(self, payload: dict) -> dict  # → {"track_id": ..., "folio": ...}
    def check_status(self, track_id: str) -> dict  # → {"estado": ..., "detalle": ...}
    def validate_webhook_signature(self, payload: bytes, signature: str) -> bool
```

Llama a `LIOREN_API_URL` con header `Authorization: Bearer {LIOREN_API_KEY}`.

---

## Environment Variables (nuevas)

```
REDIS_URL=redis://localhost:6379/0
LIOREN_API_URL=https://api.lioren.cl/v1
LIOREN_API_KEY=...
LIOREN_WEBHOOK_SECRET=...
```

---

## Frontend Changes

### Badges de estado DTE
Componente `DteBadge` usado en listas y detalles:
- `no_emitida` → gris "Sin emitir"
- `pendiente / procesando` → amarillo "Enviando..."
- `aceptada` → verde "DTE OK"
- `rechazada` → rojo "Rechazada"
- `timeout` → naranja "Timeout"

### FacturaDetalle
- Mostrar `DteBadge`
- Botón "Emitir DTE" visible solo si `dte_estado = no_emitida`
- Al hacer click: popup de confirmación con cliente, RUT, monto total
- Al confirmar: POST `/api/dte/facturas/{id}/emitir` → badge cambia a "Enviando..."

### Páginas nuevas
- `/notas-credito` — lista con `DteBadge`, botón "Nueva NC"
- `/notas-credito/:id` — detalle con líneas y botón "Emitir"
- `/notas-credito/nueva` — formulario con líneas + campo razón (mismo patrón que cotización)
- `/notas-debito`, `/notas-debito/:id`, `/notas-debito/nueva` — misma estructura

### Sidebar
Agregar "Notas de Crédito" y "Notas de Débito" bajo la sección de Facturas.

---

## Infrastructure (docker-compose dev)

```yaml
redis:
  image: redis:7-alpine
  ports: ["6379:6379"]

celery_worker:
  build: ./backend
  command: celery -A app.celery_app worker --loglevel=info
  depends_on: [redis, db]
  env_file: .env

celery_beat:
  build: ./backend
  command: celery -A app.celery_app beat --loglevel=info
  depends_on: [redis]
  env_file: .env
```

---

## Error Handling

- Lioren API down: Celery reintenta 3 veces con backoff. `DteEmision` queda en `pendiente` hasta éxito.
- SII rechaza documento: `estado=rechazado`, `respuesta_sii` guarda detalle. Badge rojo en frontend con tooltip del error.
- Webhook con firma inválida: responde `403`, no procesa.
- Documento ya emitido: `POST /emitir` devuelve `409 Conflict`.

---

## Out of Scope

- Boleta electrónica (tipo 39)
- Envío de DTE por email al cliente (parte del módulo de Notificaciones)
- Generación de PDF con timbre (Lioren provee PDF)
- Cesión electrónica de facturas
