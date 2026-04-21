# Cobranza Module Design

**Date:** 2026-04-21
**Status:** Approved

## Context

Conico does not emit facturas directly (no SII integration). Facturas are issued in Softland and exported as SII DTE XML files. The Cobranza module imports those XMLs into the existing `facturas` table and provides tools for collections management: aging dashboard, payment tracking, and email reminders.

Manual factura creation is not required for this module.

## Architecture

### Data Model Changes

**`facturas` table — new columns:**
- `origen`: `varchar` — `'xml' | 'manual' | 'nv'` (source of the record)
- `xml_raw`: `text` — raw XML string stored for reference/reprocessing
- `ultimo_recordatorio`: `date` — date of last reminder sent to client

**New table `cobranza_config`:**
- `id`: primary key
- `empresa_id`: FK to `empresas`, unique
- `dias_frecuencia`: `int`, default `7` — days between recommended reminders after vencimiento

### Upsert Logic

When importing an XML:
- Match on `numero` (factura number, unique)
- If exists: overwrite all fields with XML data, preserve `id` and `pagos`
- If not exists: insert new record with `origen = 'xml'`

### XML Parsing (SII DTE)

Handles TipoDTE 33 (Factura Electrónica) and 34 (Factura No Afecta o Exenta).

Mapping from DTE to `Factura`:
| DTE field | Factura field |
|-----------|--------------|
| `IdDoc/Folio` | `numero` |
| `IdDoc/FchEmis` | `fecha` |
| `IdDoc/FchVenc` | `fecha_vencimiento` |
| `Receptor/RUTRecep` | lookup `empresa.rut` → `empresa_id` |
| `Totales/MntNeto` | `total_neto` |
| `Totales/IVA` | `total_iva` |
| `Totales/MntTotal` | `total` |
| `Detalle` items | `FacturaLinea` records |

`RUTRecep` is the buyer's company RUT (not an individual contact), so it matches against `empresa.rut`. `cliente_id` is left null for XML-imported facturas. If no matching empresa is found, the import records an error for that file — no silent entity creation.

## API Endpoints

### Import
- `POST /api/facturas/import/xml` — single XML file upload, returns created/updated factura
- `POST /api/facturas/import/xml/bulk` — multipart upload of multiple XMLs, returns `{ creadas: int, actualizadas: int, errores: [{ filename, message }] }`

### Cobranza
- `GET /api/cobranza/dashboard` — returns:
  - `total_por_cobrar`: sum of unpaid facturas
  - `aging`: buckets `{ 0_30, 31_60, 61_90, 90_plus }` (days overdue, amounts)
  - `por_empresa`: list of `{ empresa_nombre, total, vencido }`
- `GET /api/cobranza/recordatorios` — facturas where: `estado != 'pagada'` AND `fecha_vencimiento < today` AND (`ultimo_recordatorio IS NULL` OR `ultimo_recordatorio <= today - empresa.cobranza_config.dias_frecuencia`)
- `POST /api/facturas/{id}/recordatorio` — updates `ultimo_recordatorio = today`, sends email

### Config
- `GET /api/empresas/{id}/cobranza-config` — returns config (creates default if missing)
- `PUT /api/empresas/{id}/cobranza-config` — updates `dias_frecuencia`

## Frontend — `/cobranza`

Three tabs:

### 1. Dashboard
- Summary cards: Total por cobrar, Total vencido, Próximas a vencer (≤7 días)
- Aging table: rows are buckets (0-30, 31-60, 61-90, 90+), columns are count + amount
- Breakdown table by empresa: nombre, total pendiente, total vencido

### 2. Facturas
- Table with columns: numero, fecha, vencimiento, cliente, empresa, total, estado, origen
- Filters: estado, empresa, date range, "solo recordatorio pendiente" toggle
- "Importar XML" button opens import modal (single or bulk, drag & drop)
- Import modal shows per-file result: created / updated / error with message

### 3. Recordatorios
- List of facturas recommended for contact (from `GET /api/cobranza/recordatorios`)
- Per-row: numero, cliente, empresa, monto, días vencida, último recordatorio
- "Enviar" button per row → opens reminder modal
- Reminder modal:
  - Pre-filled subject: `"Recordatorio de pago — Factura N°{numero}"`
  - Pre-filled body: includes numero, monto, fecha_vencimiento, días vencida
  - Editable before sending
  - Confirm → calls `POST /api/facturas/{id}/recordatorio`

## Migration

New Alembic migration:
1. Add `origen`, `xml_raw`, `ultimo_recordatorio` columns to `facturas`
2. Create `cobranza_config` table

Existing factura rows get `origen = 'manual'` as default.

## Out of Scope

- Automatic/scheduled reminder sending (manual trigger only)
- SII authentication or DTE emission
- TipoDTE other than 33 and 34 (Notas de Crédito, Boletas, etc.)
- Creating Clientes/Empresas from XML data (must already exist)
