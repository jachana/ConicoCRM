# Margin Approval Request — Design

**Date:** 2026-04-20  
**Status:** Approved

---

## Overview

Vendors can propose margin/price adjustments on a cotización and submit them as a single approval request. Admins review and approve or deny in the existing Aprobaciones page. On approval, the cotización lines update automatically. Polling is removed from both this flow and the existing credit approval flow.

---

## Data Model

New table: `aprobaciones_margen`

| field | type | notes |
|---|---|---|
| `id` | int PK | |
| `cotizacion_id` | FK → cotizaciones | cascade delete |
| `vendedor_id` | FK → users | who submitted the request |
| `nota` | Text nullable | vendor's justification |
| `estado` | String | `pendiente` / `aprobada` / `denegada` |
| `lineas_propuestas` | JSON | array of `{linea_id, descripcion, valor_neto_actual, margen_actual, valor_neto_propuesto, margen_propuesto}` — snapshotted at request time |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**"Latest wins" rule:** when a new request is submitted for a cotización that already has a `pendiente` request, the old one is auto-denied before the new one is created.

**One active request per cotización at a time.**

---

## API Endpoints

| method | path | who | action |
|---|---|---|---|
| `POST` | `/api/aprobaciones_margen/` | vendor | Create request. Snapshots current line values. Auto-denies any existing `pendiente` for same cotización. |
| `GET` | `/api/aprobaciones_margen/` | admin: all; vendor: own | List, filterable by `estado` and `cotizacion_id`. |
| `GET` | `/api/aprobaciones_margen/{id}` | admin or owner | Detail. |
| `PATCH` | `/api/aprobaciones_margen/{id}` | admin only | `{ accion: "aprobar" \| "denegar" }` |

**On approve:** backend applies `valor_neto_propuesto` to each `linea_id` in the snapshot, recomputes `margen` for each line, recalculates cotización totals (`total_neto`, `total_iva`, `total`).

**On deny:** no changes to the cotización.

---

## Frontend — Vendor (CotizacionDetalle)

**Price + margin inputs are admin-only.** Non-admins see both `valor_neto` and `margen` as read-only colored text. Vendors cannot edit prices directly — all price changes must go through the margin request flow.

**Proposal state:** a separate `propuestas: Record<lineaIdx, {margenPropuesto: number, valorNetoPropuesto: number}>` tracks the vendor's desired changes without touching the main `lineas` state. This means:
- "Guardar" is unaffected — it never sends proposed values, only the saved cotización data.
- The table shows proposed values inline (with a visual distinction, e.g. dashed border) so the vendor can see the price impact before submitting.

**Flow:**
- Vendor sees a `%` input per line in the margin column (not read-only text). Typing updates `propuestas` and shows the resulting price inline. The saved price is unchanged.
- A **"Solicitar ajuste de márgenes"** button appears in the page header (alongside Guardar) whenever `propuestas` is non-empty.
- Clicking opens a modal with:
  - Summary table: `descripción / precio actual / precio propuesto / margen propuesto`
  - Text field: nota (optional but encouraged)
  - "Enviar solicitud" button
- After submit:
  - Modal closes
  - `propuestas` state is cleared; line display reverts to saved cotización values
  - A dismissable banner shows: *"Solicitud de ajuste de márgenes enviada — pendiente de aprobación"*
- If a pending request already exists when the vendor opens the page: banner shows current estado with the option to submit a new request (which supersedes the old one).
- On approved: banner shows *"Solicitud aprobada — los precios han sido actualizados"*, cotización reloads with new values.
- On denied: banner shows *"Solicitud denegada"*.

---

## Frontend — Admin (Aprobaciones page)

- Existing list shows both credit and margin requests in one list.
- Each row has a **tipo** badge: `Crédito` or `Margen`.
- Margin request rows expand to show the comparison table from `lineas_propuestas` (actual vs proposed for each line).
- Same Aprobar / Denegar buttons as credit requests.
- After action, row updates in place (no full reload needed).

---

## Polling Removal (Credit + Margin flows)

**Current behavior (credit):** `CreditWarningModal` polls `/api/aprobaciones/{id}` every 3 seconds and keeps the vendor blocked on screen.

**New behavior:**

- Remove polling loop from `CreditWarningModal`.
- After submitting a credit request: close the modal, show a dismissable banner on the cotización page — *"Solicitud de crédito enviada — pendiente de aprobación"*.
- On page load, the cotización page queries for any active aprobacion (credit or margin) for this cotización and renders the appropriate banner.
- Banner states:
  - `pendiente` → *"Solicitud enviada — pendiente de aprobación"*
  - `aprobada` (credit) → *"Solicitud aprobada — [Ver nota de venta →]"* (links to `nv_id`)
  - `aprobada` (margin) → *"Márgenes aprobados — precios actualizados"*
  - `denegada` → *"Solicitud denegada"*
- Vendor navigates away freely and checks back later.

---

## Constraints & Edge Cases

- A vendor cannot submit a margin request if the cotización has no lines, or if no line margins differ from saved.
- If a cotización is deleted, all its `aprobaciones_margen` cascade-delete.
- Admins bypass the request flow entirely — they edit margins directly and save.
- The `lineas_propuestas` snapshot is immutable after creation; the admin always sees what was requested, even if the cotización was subsequently edited.
- If a cotización line is deleted after a pending request was submitted, the approve action skips that `linea_id` gracefully (line no longer exists).
