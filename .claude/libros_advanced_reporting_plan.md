# [DTE] Advanced Reporting – Libros Filters and Exports

## Goal
Add advanced filtering, sorting, and export capabilities to Libros (sales and purchase books) list view.

## Requirements
- Multi-period filtering (date range: from YYYY-MM to YYYY-MM)
- Status-based filtering (borrador, enviado) 
- Sorting by: monto, período, empresa
- CSV export of Libros
- Excel export with formatting
- Print-friendly view

## Implementation Plan

### Task 1: Backend - Enhanced Filters + Sorting
**Scope**: Update `/libros/ventas` and `/libros/compras` endpoints
- Add `estado` filter query param (backend was ignoring frontend's estado)
- Add `periodo_from` and `periodo_to` params for date range
- Add `sort_by` param (monto, periodo) and `sort_order` (asc, desc)
- Validate date range format (YYYY-MM)
- Update response to support sorting
- Add proper tests

**Files**: 
- `backend/app/api/libros.py`
- `backend/app/schemas/libro.py` (if types change)

### Task 2: Backend - CSV Export Endpoint
**Scope**: Add `/libros/{tipo}/export/csv` endpoint
- Accept same filters as list endpoint
- Return CSV with headers: Período, Total Registros, Monto Total, Estado, [tipo-specific fields]
- Include pagination (all records or limited to N?)
- Proper charset encoding (UTF-8)

**Files**:
- `backend/app/api/libros.py`

### Task 3: Backend - Excel Export Endpoint  
**Scope**: Add `/libros/{tipo}/export/excel` endpoint
- Accept same filters as list endpoint
- Return Excel file with formatting:
  - Bold headers
  - Monto_total formatted as currency
  - Column widths auto-adjusted
  - Use openpyxl
- Include summary row with totals

**Files**:
- `backend/app/api/libros.py`

### Task 4: Frontend - Date Range Picker + Filters
**Scope**: Enhance LibrosList.tsx filter UI
- Replace single "Período (YYYY-MM)" with two inputs: "Desde" and "Hasta"
- Add sorting controls (currently hardcoded to created_at desc)
- Update filter state management
- Update API calls to pass new filter params

**Files**:
- `frontend/src/pages/LibrosList.tsx`
- `frontend/src/api/libros.ts` (add sort_by, sort_order, periodo_from, periodo_to)

### Task 5: Frontend - Export Buttons
**Scope**: Add export buttons to LibrosList.tsx
- "Exportar CSV" button - calls CSV endpoint with current filters, downloads file
- "Exportar Excel" button - calls Excel endpoint with current filters, downloads file
- Loading states while exporting
- Error handling

**Files**:
- `frontend/src/pages/LibrosList.tsx`

### Task 6: Frontend - Print-Friendly View
**Scope**: Add print functionality to LibrosList.tsx  
- Add "Imprimir" button
- Create print stylesheet (hide buttons, optimize for paper)
- Option: Add print modal with preview or just use window.print()
- Include filters applied and date range in print header

**Files**:
- `frontend/src/pages/LibrosList.tsx`
- CSS for print view

## Execution Order
1. Task 1 (backend filters) - enables testing of frontend changes
2. Task 2 (CSV export backend)
3. Task 3 (Excel export backend)  
4. Task 4 (frontend filters UI)
5. Task 5 (export buttons)
6. Task 6 (print view)

All backend tasks can run in parallel. Frontend tasks depend on backend being complete.
