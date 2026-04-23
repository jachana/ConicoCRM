# Sedes de Despacho — Design

**Date:** 2026-04-23  
**Status:** Approved

## Overview

Replace the single `ubicacion` text field on `Empresa` with a 1-N `SedeDespacho` relation. Replace the free-text `direccion_despacho` field on `NotaVenta` with a FK to a sede. `retiro_en_conico` remains as a separate, mutually exclusive option.

Existing data in `direccion_despacho` is demo data and will be dropped without migration.

## Data Model

### New table: `sedes_despacho`

| Column | Type | Notes |
|--------|------|-------|
| `id` | int PK | |
| `empresa_id` | int FK → empresas | CASCADE DELETE |
| `nombre` | str NOT NULL | e.g. "Matriz", "Sucursal Norte" |
| `direccion` | str NOT NULL | |
| `created_at` | datetime | UTC, timezone-aware |

### `nota_venta` changes

- **Remove:** `direccion_despacho` (Text, nullable)
- **Add:** `sede_despacho_id` (int FK → sedes_despacho, nullable, SET NULL on delete)

### Constraints

- `sede_despacho_id` and `retiro_en_conico=True` are mutually exclusive — enforced at API level (validation error if both set).
- `sede_despacho_id` is nullable (a NV can have neither sede nor retiro_en_conico).

## API

### Router: `/api/sedes-despacho`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sedes-despacho?empresa_id=X` | List sedes for an empresa |
| POST | `/api/sedes-despacho` | Create sede |
| PUT | `/api/sedes-despacho/{id}` | Update sede |
| DELETE | `/api/sedes-despacho/{id}` | Delete sede (blocked if referenced by any NV) |

All endpoints require `require_permission("empresas", ...)` guards (same module as Empresa).

### `NotaVenta` schemas

- `sede_despacho_id` (int, nullable) added to create and update schemas.
- Validation: if `retiro_en_conico=True` and `sede_despacho_id` is not None → raise 422.

## Frontend

### Empresas — formulario de edición

Add a "Sedes de despacho" subtable below existing fields:

- Columns: `nombre`, `dirección`, actions (edit inline, delete)
- "+ Agregar sede" button opens an inline row or small form
- Edit/delete work inline within the subtable

### NotaVenta — formulario

Replace `direccion_despacho` text input with:

1. **Dropdown "Sede de despacho"** — populated from `GET /api/sedes-despacho?empresa_id=X` when empresa is selected. Empty state: "Sin sedes registradas".
2. **Checkbox "Retiro en Conico"** — when checked, disables and clears the sede dropdown.

These two controls are mutually exclusive. Both can be empty (no dispatch address required).

## Migration

Single Alembic migration:
1. Create `sedes_despacho` table
2. Add `sede_despacho_id` FK column to `nota_venta`
3. Drop `direccion_despacho` column from `nota_venta`

Downgrade reverses all three steps (no data recovery needed).

## Out of Scope

- Empresa `ubicacion` field: remains as-is (it's the empresa's general address, not a sede).
- Sede contact fields (email, phone): not included per YAGNI.
- Default/principal sede flag: not needed — user always selects manually.
