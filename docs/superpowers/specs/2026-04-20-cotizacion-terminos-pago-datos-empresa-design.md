# Cotización: Términos de Pago y Datos de Empresa

**Date:** 2026-04-20
**Status:** Approved

## Overview

Add payment terms (términos de pago) to the cotización form and PDF, with an approval workflow mirroring the existing margin approval flow. Also add company banking data to SystemConfig and display it in the PDF. Ensure both RUTs (emisor and cliente) are clearly visible in the PDF.

---

## 1. Backend

### Cotizacion Model — New Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `terminos_pago` | `str \| None` | `None` | Payment term text (e.g., "30 Días", "Al contado") |
| `terminos_pago_estado` | `str` | `"aprobado"` | `"aprobado"` / `"pendiente"` / `"rechazado"` |

### Business Logic

- When a cotización is created or its empresa changes, auto-populate `terminos_pago` from `empresa.plazo_credito`.
- On save, compare `terminos_pago` against the empresa's `plazo_credito`:
  - If plazo is **reduced or equal** (stricter terms for client) → `terminos_pago_estado = "aprobado"` automatically.
  - If plazo is **extended** (more lenient for client) → `terminos_pago_estado = "pendiente"`, blocks PDF generation.
- Admin PATCH endpoint accepts `terminos_pago_estado` to approve/reject (same pattern as margin approval).

### Migration

New Alembic migration adding both columns to `cotizacion` table.

### SystemConfig — New Keys

| Key | Description |
|---|---|
| `empresa_banco` | Bank name (e.g., "Banco Estado") |
| `empresa_tipo_cuenta` | Account type (e.g., "Cuenta Corriente", "Cuenta Vista") |
| `empresa_numero_cuenta` | Account number |
| `empresa_nombre_titular` | Account holder name |

RUT already exists as `empresa_rut`.

---

## 2. Frontend — CotizacionDetalle

### New field: Términos de Pago

- Added after the `nota/observaciones` field.
- Text input, auto-fills when an empresa is selected (from `empresa.plazo_credito`).
- Vendedor can edit freely; frontend compares against empresa's original `plazo_credito` to determine if admin approval is needed.
- If extended term detected: shows badge `"Requiere aprobación"` (same visual pattern as pending margins).
- If `terminos_pago_estado === "pendiente"`: admin sees inline Aprobar / Rechazar buttons (same pattern as margin approval).
- PDF button is disabled when `terminos_pago_estado === "pendiente"`, with tooltip: `"Términos de pago requieren aprobación"`.

### Role behavior

- **Vendedor**: can edit `terminos_pago` freely; cannot approve.
- **Admin**: can edit and approve/reject.

---

## 3. PDF Template (`cotizacion.html`)

### Header (existing, improved)

- Emisor section already shows `empresa_nombre` and `empresa_rut` from SystemConfig — ensure RUT is clearly labeled.

### Client section (existing, improved)

- Show `cotizacion.empresa.rut` (if empresa exists) or `cotizacion.cliente.rut` — clearly labeled as "RUT Cliente".

### Totals section (existing, extended)

- Add row below totals: `Términos de pago: [terminos_pago]`

### New final section: "Datos para Transferencia / Cheque"

Displayed only if at least one banking field is configured in SystemConfig:

```
Banco:            [empresa_banco]
Tipo de cuenta:   [empresa_tipo_cuenta]
N° de cuenta:     [empresa_numero_cuenta]
Titular:          [empresa_nombre_titular]
RUT:              [empresa_rut]
```

---

## 4. Admin Config Page

Add new group **"Datos bancarios"** with four fields:
- Banco
- Tipo de cuenta
- Número de cuenta
- Nombre titular

RUT field already exists in the existing company data group — no duplication.

---

## Out of Scope

- Approval notifications/emails for payment term requests.
- History/audit trail of payment term changes.
- Payment terms on Nota de Venta (separate feature if needed).
