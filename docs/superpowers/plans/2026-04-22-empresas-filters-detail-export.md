# Empresas — Filtros, Detalle y Exportación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add advanced filters (sector, multi-product), sortable columns, "Última Compra" column, and a 4-tab detail modal (Resumen, Facturas, Productos, Crédito) with Excel/CSV/PDF export to the Empresas page.

**Architecture:** `Empresas.tsx` becomes a thin orchestrator (~200 lines) delegating filtering to `EmpresaFilters.tsx` and detail to `EmpresaDetailModal.tsx` with 4 sub-tabs. Export panels call backend endpoints that return Excel/CSV/PDF blobs. All sorting is client-side (consistent with existing behavior).

**Tech Stack:** FastAPI + SQLAlchemy (backend), React + TypeScript + Tailwind + React Query (frontend), openpyxl (Excel, already installed), weasyprint (PDF, already installed), Python `csv` module (CSV). `FacturaLinea` model lives in `app.models.factura` (tablename: `factura_lineas`).

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `backend/app/schemas/empresa.py` | Add EmpresaListItem, EmpresaFacturaDetailItem, EmpresaProductoLineOut |
| Modify | `backend/app/api/empresas.py` | Extend listar_empresas + 5 new endpoints |
| Modify | `frontend/src/types/index.ts` | Add EmpresaListItem, EmpresaFacturaItem, EmpresaProductoLine, GenericColDef |
| Modify | `frontend/src/lib/columnDefs.ts` | Add EMPRESA_FACTURA_COLS, EMPRESA_PRODUCTO_COLS |
| Create | `frontend/src/components/EmpresaFilters.tsx` | Filter bar: texto, sector, productos multi-select, con-deuda toggle |
| Create | `frontend/src/components/EmpresaExportPanel.tsx` | Column picker + preview table + Excel/CSV/PDF buttons |
| Create | `frontend/src/components/EmpresaTabResumen.tsx` | Detail tab: empresa info fields + edit button |
| Create | `frontend/src/components/EmpresaTabCredito.tsx` | Detail tab: credit info |
| Create | `frontend/src/components/EmpresaTabFacturas.tsx` | Detail tab: facturas list + export panel |
| Create | `frontend/src/components/EmpresaTabProductos.tsx` | Detail tab: product line-items + export panel |
| Create | `frontend/src/components/EmpresaDetailModal.tsx` | 4-tab modal orchestrator |
| Modify | `frontend/src/pages/Empresas.tsx` | Wire filters, all-column sort, ultima_compra col, "Ver" button, detail modal |

---

### Task 1: Backend schemas

**Files:**
- Modify: `backend/app/schemas/empresa.py`

- [ ] **Step 1: Append new schemas to `backend/app/schemas/empresa.py`**

The existing `from datetime import date, datetime` import already covers `date`. Add at the **end** of the file:

```python
class EmpresaListItem(EmpresaOut):
    ultima_compra: date | None = None


class EmpresaFacturaDetailItem(BaseModel):
    id: int
    numero: int
    fecha: date
    estado: str
    contacto: str | None = None
    total: Decimal
    monto_pagado: Decimal
    pendiente: Decimal
    model_config = {"from_attributes": True}


class EmpresaProductoLineOut(BaseModel):
    fecha: date
    factura_id: int
    factura_numero: int
    sku: str | None
    descripcion: str
    cantidad: Decimal
    precio_unit: Decimal
    total_neto: Decimal
```

- [ ] **Step 2: Verify schemas parse**

```bash
cd backend && python -c "from app.schemas.empresa import EmpresaListItem, EmpresaFacturaDetailItem, EmpresaProductoLineOut; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/empresa.py
git commit -m "feat(empresas): add EmpresaListItem, EmpresaFacturaDetailItem, EmpresaProductoLineOut schemas"
```

---

### Task 2: Extend `GET /api/empresas/` — filters + ultima_compra + sectores endpoint

**Files:**
- Modify: `backend/app/api/empresas.py`

- [ ] **Step 1: Update the schema import line at top of `backend/app/api/empresas.py`**

Replace:
```python
from app.schemas.empresa import EmpresaCreate, EmpresaDeudaOut, EmpresaCreditoOut, EmpresaOut, EmpresaUpdate, FacturaResumen, EmpresaDeudaBulkItem
```
With:
```python
from app.schemas.empresa import (
    EmpresaCreate, EmpresaDeudaOut, EmpresaCreditoOut, EmpresaOut, EmpresaUpdate,
    FacturaResumen, EmpresaDeudaBulkItem, EmpresaListItem,
    EmpresaFacturaDetailItem, EmpresaProductoLineOut,
)
```

- [ ] **Step 2: Add export helper functions after the existing imports block**

Add right after all the `import` statements and before `router = APIRouter()`:

```python
import csv
import io as _io
from decimal import Decimal as _D


def _export_xlsx(headers: list[str], rows: list[list]) -> "StreamingResponse":
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = _io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=export.xlsx"},
    )


def _export_csv(headers: list[str], rows: list[list]) -> "StreamingResponse":
    output = _io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=export.csv"},
    )


def _export_pdf(title: str, headers: list[str], rows: list[list]) -> "StreamingResponse":
    from weasyprint import HTML
    rows_html = "".join(
        "<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>"
        for row in rows
    )
    html_str = f"""<html><head><style>
      body{{font-family:Arial,sans-serif;font-size:9px;}}
      h1{{font-size:13px;color:#0369a1;margin-bottom:8px;}}
      table{{width:100%;border-collapse:collapse;}}
      th{{background:#0369a1;color:white;padding:4px 8px;text-align:left;}}
      td{{padding:3px 8px;border-bottom:1px solid #e2e8f0;}}
      tr:nth-child(even) td{{background:#f8fafc;}}
    </style></head><body>
      <h1>{title}</h1>
      <table><tr>{"".join(f"<th>{h}</th>" for h in headers)}</tr>{rows_html}</table>
    </body></html>"""
    buf = _io.BytesIO()
    HTML(string=html_str).write_pdf(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=export.pdf"},
    )
```

- [ ] **Step 3: Replace `listar_empresas` with the extended version**

Replace the entire existing `listar_empresas` function with:

```python
@router.get("/", response_model=list[EmpresaListItem])
def listar_empresas(
    q: str = Query(""),
    sector: str | None = Query(None),
    producto_ids: list[int] = Query(default=[]),
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    from sqlalchemy import func, select as sa_select
    from app.models.factura import FacturaLinea

    _, db = perms

    ultima_compra_subq = (
        sa_select(
            Factura.empresa_id,
            func.max(Factura.fecha).label("ultima_compra"),
        )
        .where(Factura.estado != "anulada", Factura.empresa_id.isnot(None))
        .group_by(Factura.empresa_id)
        .subquery()
    )

    query = db.query(Empresa, ultima_compra_subq.c.ultima_compra).outerjoin(
        ultima_compra_subq, ultima_compra_subq.c.empresa_id == Empresa.id
    )

    if q:
        like = f"%{q}%"
        query = query.filter(Empresa.nombre.ilike(like) | Empresa.rut.ilike(like))
    if sector:
        query = query.filter(Empresa.sector == sector)
    if producto_ids:
        producto_subq = (
            sa_select(Factura.empresa_id)
            .join(FacturaLinea, FacturaLinea.factura_id == Factura.id)
            .where(
                FacturaLinea.producto_id.in_(producto_ids),
                Factura.empresa_id.isnot(None),
                Factura.estado != "anulada",
            )
            .distinct()
            .subquery()
        )
        query = query.filter(Empresa.id.in_(sa_select(producto_subq.c.empresa_id)))

    rows = query.order_by(Empresa.nombre).all()
    result = []
    for empresa, ultima_compra in rows:
        item = EmpresaListItem.model_validate(empresa)
        item.ultima_compra = ultima_compra
        result.append(item)
    return result
```

- [ ] **Step 4: Add `GET /api/empresas/sectores` right after `listar_empresas`**

```python
@router.get("/sectores", response_model=list[str])
def listar_sectores(
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms
    rows = (
        db.query(Empresa.sector)
        .filter(Empresa.sector.isnot(None))
        .distinct()
        .order_by(Empresa.sector)
        .all()
    )
    return [r[0] for r in rows]
```

- [ ] **Step 5: Test both endpoints**

```bash
cd backend && uvicorn app.main:app --reload --port 8000 &
sleep 3
curl -s "http://localhost:8000/api/empresas/?q=" | python -m json.tool | python -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} empresas, first ultima_compra={d[0].get(\"ultima_compra\") if d else \"N/A\"}')"
curl -s "http://localhost:8000/api/empresas/sectores" | python -m json.tool
```

Expected: list of empresas each with `ultima_compra` field; list of sector strings.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/empresas.py
git commit -m "feat(empresas): extend list endpoint with sector/producto filters and ultima_compra"
```

---

### Task 3: `GET /api/empresas/{id}/facturas`

**Files:**
- Modify: `backend/app/api/empresas.py`

- [ ] **Step 1: Add facturas endpoint**

Add **before** the `@router.get("/{empresa_id}", ...)` route (order matters — specific routes before generic `/{empresa_id}`):

```python
@router.get("/{empresa_id}/facturas", response_model=list[EmpresaFacturaDetailItem])
def facturas_empresa(
    empresa_id: int,
    estado: list[str] = Query(default=[]),
    fecha_desde: str | None = Query(None),
    fecha_hasta: str | None = Query(None),
    monto_min: float | None = Query(None),
    monto_max: float | None = Query(None),
    sort_by: str = Query("fecha"),
    sort_dir: str = Query("desc"),
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    from datetime import date as _date

    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    query = db.query(Factura).filter(Factura.empresa_id == empresa_id)
    if estado:
        query = query.filter(Factura.estado.in_(estado))
    if fecha_desde:
        query = query.filter(Factura.fecha >= _date.fromisoformat(fecha_desde))
    if fecha_hasta:
        query = query.filter(Factura.fecha <= _date.fromisoformat(fecha_hasta))
    if monto_min is not None:
        query = query.filter(Factura.total >= monto_min)
    if monto_max is not None:
        query = query.filter(Factura.total <= monto_max)

    sort_col = {
        "fecha": Factura.fecha,
        "numero": Factura.numero,
        "total": Factura.total,
        "estado": Factura.estado,
        "pendiente": Factura.total,
    }.get(sort_by, Factura.fecha)
    query = query.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())

    facturas = query.all()
    return [
        EmpresaFacturaDetailItem(
            id=f.id,
            numero=f.numero,
            fecha=f.fecha,
            estado=f.estado,
            contacto=f.contacto,
            total=f.total,
            monto_pagado=f.monto_pagado or _D("0"),
            pendiente=f.total - (f.monto_pagado or _D("0")),
        )
        for f in facturas
    ]
```

- [ ] **Step 2: Test**

```bash
curl -s "http://localhost:8000/api/empresas/1/facturas" | python -m json.tool | head -30
curl -s "http://localhost:8000/api/empresas/1/facturas?estado=emitida&sort_by=total&sort_dir=desc" | python -m json.tool | head -10
```

Expected: JSON array of facturas with `id, numero, fecha, estado, contacto, total, monto_pagado, pendiente`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/empresas.py
git commit -m "feat(empresas): add GET /empresas/{id}/facturas endpoint"
```

---

### Task 4: `GET /api/empresas/{id}/productos`

**Files:**
- Modify: `backend/app/api/empresas.py`

- [ ] **Step 1: Add productos endpoint**

Add **before** `@router.get("/{empresa_id}", ...)`:

```python
@router.get("/{empresa_id}/productos", response_model=list[EmpresaProductoLineOut])
def productos_empresa(
    empresa_id: int,
    q: str = Query(""),
    fecha_desde: str | None = Query(None),
    fecha_hasta: str | None = Query(None),
    sort_by: str = Query("fecha"),
    sort_dir: str = Query("desc"),
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    from datetime import date as _date
    from app.models.factura import FacturaLinea

    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    query = (
        db.query(FacturaLinea, Factura.fecha, Factura.id, Factura.numero)
        .join(Factura, Factura.id == FacturaLinea.factura_id)
        .filter(
            Factura.empresa_id == empresa_id,
            Factura.estado != "anulada",
        )
    )
    if q:
        like = f"%{q}%"
        query = query.filter(
            FacturaLinea.descripcion.ilike(like) | FacturaLinea.sku.ilike(like)
        )
    if fecha_desde:
        query = query.filter(Factura.fecha >= _date.fromisoformat(fecha_desde))
    if fecha_hasta:
        query = query.filter(Factura.fecha <= _date.fromisoformat(fecha_hasta))

    sort_map = {
        "fecha": Factura.fecha,
        "sku": FacturaLinea.sku,
        "descripcion": FacturaLinea.descripcion,
        "cantidad": FacturaLinea.cantidad,
        "precio_unit": FacturaLinea.valor_neto,
        "total_neto": FacturaLinea.total_neto,
    }
    sort_col = sort_map.get(sort_by, Factura.fecha)
    query = query.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())

    rows = query.all()
    return [
        EmpresaProductoLineOut(
            fecha=fecha,
            factura_id=factura_id,
            factura_numero=factura_numero,
            sku=linea.sku,
            descripcion=linea.descripcion,
            cantidad=linea.cantidad,
            precio_unit=linea.valor_neto,
            total_neto=linea.total_neto,
        )
        for linea, fecha, factura_id, factura_numero in rows
    ]
```

- [ ] **Step 2: Test**

```bash
curl -s "http://localhost:8000/api/empresas/1/productos" | python -m json.tool | head -30
curl -s "http://localhost:8000/api/empresas/1/productos?q=tornillo&sort_by=total_neto" | python -m json.tool | head -10
```

Expected: JSON array of product lines with `fecha, factura_id, factura_numero, sku, descripcion, cantidad, precio_unit, total_neto`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/empresas.py
git commit -m "feat(empresas): add GET /empresas/{id}/productos endpoint"
```

---

### Task 5: Export endpoints

**Files:**
- Modify: `backend/app/api/empresas.py`

- [ ] **Step 1: Add `GET /api/empresas/{id}/export/facturas`**

Add **before** `@router.get("/{empresa_id}", ...)`:

```python
@router.get("/{empresa_id}/export/facturas")
def exportar_facturas_empresa(
    empresa_id: int,
    format: str = Query("xlsx"),
    estado: list[str] = Query(default=[]),
    fecha_desde: str | None = Query(None),
    fecha_hasta: str | None = Query(None),
    monto_min: float | None = Query(None),
    monto_max: float | None = Query(None),
    columns: list[str] = Query(default=[]),
    send_to: str | None = Query(None),
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    from datetime import date as _date

    if send_to:
        raise HTTPException(status_code=501, detail="Envío por email/WhatsApp pendiente de implementación")
    if format not in ("xlsx", "csv", "pdf"):
        raise HTTPException(status_code=400, detail="format debe ser xlsx, csv o pdf")

    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    query = db.query(Factura).filter(Factura.empresa_id == empresa_id)
    if estado:
        query = query.filter(Factura.estado.in_(estado))
    if fecha_desde:
        query = query.filter(Factura.fecha >= _date.fromisoformat(fecha_desde))
    if fecha_hasta:
        query = query.filter(Factura.fecha <= _date.fromisoformat(fecha_hasta))
    if monto_min is not None:
        query = query.filter(Factura.total >= monto_min)
    if monto_max is not None:
        query = query.filter(Factura.total <= monto_max)
    facturas = query.order_by(Factura.fecha.desc()).all()

    ALL_COLS: dict[str, tuple[str, callable]] = {
        "numero":       ("Nº",        lambda f: f.numero),
        "fecha":        ("Fecha",     lambda f: str(f.fecha)),
        "estado":       ("Estado",    lambda f: f.estado),
        "contacto":     ("Contacto",  lambda f: f.contacto or ""),
        "total":        ("Total",     lambda f: float(f.total)),
        "monto_pagado": ("Pagado",    lambda f: float(f.monto_pagado or _D("0"))),
        "pendiente":    ("Pendiente", lambda f: float(f.total - (f.monto_pagado or _D("0")))),
    }
    selected = [k for k in (columns or list(ALL_COLS.keys())) if k in ALL_COLS]
    if not selected:
        selected = list(ALL_COLS.keys())

    headers = [ALL_COLS[k][0] for k in selected]
    data_rows = [[ALL_COLS[k][1](f) for k in selected] for f in facturas]

    if format == "csv":
        return _export_csv(headers, data_rows)
    if format == "pdf":
        return _export_pdf(f"Facturas — {e.nombre}", headers, data_rows)
    return _export_xlsx(headers, data_rows)
```

- [ ] **Step 2: Add `GET /api/empresas/{id}/export/productos`**

Add **before** `@router.get("/{empresa_id}", ...)`:

```python
@router.get("/{empresa_id}/export/productos")
def exportar_productos_empresa(
    empresa_id: int,
    format: str = Query("xlsx"),
    q: str = Query(""),
    fecha_desde: str | None = Query(None),
    fecha_hasta: str | None = Query(None),
    columns: list[str] = Query(default=[]),
    send_to: str | None = Query(None),
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    from datetime import date as _date
    from app.models.factura import FacturaLinea

    if send_to:
        raise HTTPException(status_code=501, detail="Envío por email/WhatsApp pendiente de implementación")
    if format not in ("xlsx", "csv", "pdf"):
        raise HTTPException(status_code=400, detail="format debe ser xlsx, csv o pdf")

    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    query = (
        db.query(FacturaLinea, Factura.fecha, Factura.id, Factura.numero)
        .join(Factura, Factura.id == FacturaLinea.factura_id)
        .filter(Factura.empresa_id == empresa_id, Factura.estado != "anulada")
    )
    if q:
        like = f"%{q}%"
        query = query.filter(FacturaLinea.descripcion.ilike(like) | FacturaLinea.sku.ilike(like))
    if fecha_desde:
        query = query.filter(Factura.fecha >= _date.fromisoformat(fecha_desde))
    if fecha_hasta:
        query = query.filter(Factura.fecha <= _date.fromisoformat(fecha_hasta))
    rows = query.order_by(Factura.fecha.desc()).all()

    ALL_COLS: dict[str, tuple[str, callable]] = {
        "fecha":          ("Fecha",       lambda r: str(r[1])),
        "factura_numero": ("Nº Factura",  lambda r: r[3]),
        "sku":            ("SKU",         lambda r: r[0].sku or ""),
        "descripcion":    ("Descripción", lambda r: r[0].descripcion),
        "cantidad":       ("Cantidad",    lambda r: float(r[0].cantidad)),
        "precio_unit":    ("Precio Unit", lambda r: float(r[0].valor_neto)),
        "total_neto":     ("Total",       lambda r: float(r[0].total_neto)),
    }
    selected = [k for k in (columns or list(ALL_COLS.keys())) if k in ALL_COLS]
    if not selected:
        selected = list(ALL_COLS.keys())

    headers = [ALL_COLS[k][0] for k in selected]
    data_rows = [[ALL_COLS[k][1](r) for k in selected] for r in rows]

    if format == "csv":
        return _export_csv(headers, data_rows)
    if format == "pdf":
        return _export_pdf(f"Productos — {e.nombre}", headers, data_rows)
    return _export_xlsx(headers, data_rows)
```

- [ ] **Step 3: Test all export formats**

```bash
# Replace 1 with a real empresa_id
curl -s -o /tmp/test.xlsx "http://localhost:8000/api/empresas/1/export/facturas?format=xlsx" && ls -la /tmp/test.xlsx
curl -s "http://localhost:8000/api/empresas/1/export/facturas?format=csv" | head -5
curl -s -o /tmp/test.pdf "http://localhost:8000/api/empresas/1/export/facturas?format=pdf" && ls -la /tmp/test.pdf
curl -s "http://localhost:8000/api/empresas/1/export/productos?format=csv" | head -5
```

Expected: non-empty files; CSV shows headers on first line.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/empresas.py
git commit -m "feat(empresas): add Excel/CSV/PDF export endpoints for facturas and productos"
```

---

### Task 6: Frontend types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Append new types at end of `frontend/src/types/index.ts`**

```typescript
export interface EmpresaListItem extends Empresa {
  ultima_compra: string | null
}

export interface EmpresaFacturaItem {
  id: number
  numero: number
  fecha: string
  estado: string
  contacto: string | null
  total: number
  monto_pagado: number
  pendiente: number
}

export interface EmpresaProductoLine {
  fecha: string
  factura_id: number
  factura_numero: number
  sku: string | null
  descripcion: string
  cantidad: number
  precio_unit: number
  total_neto: number
}

export interface GenericColDef<T = Record<string, unknown>> {
  key: string
  label: string
  defaultVisible: boolean
  getValue: (row: T) => string | number
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(empresas): add EmpresaListItem, EmpresaFacturaItem, EmpresaProductoLine, GenericColDef types"
```

---

### Task 7: Column definitions

**Files:**
- Modify: `frontend/src/lib/columnDefs.ts`

- [ ] **Step 1: Update the import line in `frontend/src/lib/columnDefs.ts`**

Replace:
```typescript
import type { ColDef, FlatLine } from '../types'
```
With:
```typescript
import type { ColDef, FlatLine, GenericColDef, EmpresaFacturaItem, EmpresaProductoLine } from '../types'
```

- [ ] **Step 2: Append empresa column defs at end of `frontend/src/lib/columnDefs.ts`**

```typescript
export const EMPRESA_FACTURA_COLS: GenericColDef<EmpresaFacturaItem>[] = [
  { key: 'numero',       label: 'Nº',        defaultVisible: true,  getValue: r => r.numero },
  { key: 'fecha',        label: 'Fecha',      defaultVisible: true,  getValue: r => fmtDate(r.fecha) },
  { key: 'estado',       label: 'Estado',     defaultVisible: true,  getValue: r => r.estado },
  { key: 'contacto',     label: 'Contacto',   defaultVisible: false, getValue: r => r.contacto ?? '—' },
  { key: 'total',        label: 'Total',      defaultVisible: true,  getValue: r => fmtMoney(r.total) },
  { key: 'monto_pagado', label: 'Pagado',     defaultVisible: true,  getValue: r => fmtMoney(r.monto_pagado) },
  { key: 'pendiente',    label: 'Pendiente',  defaultVisible: true,  getValue: r => fmtMoney(r.pendiente) },
]

export const EMPRESA_PRODUCTO_COLS: GenericColDef<EmpresaProductoLine>[] = [
  { key: 'fecha',          label: 'Fecha',       defaultVisible: true,  getValue: r => fmtDate(r.fecha) },
  { key: 'factura_numero', label: 'Nº Factura',  defaultVisible: true,  getValue: r => r.factura_numero },
  { key: 'sku',            label: 'SKU',          defaultVisible: true,  getValue: r => r.sku ?? '—' },
  { key: 'descripcion',    label: 'Descripción',  defaultVisible: true,  getValue: r => r.descripcion },
  { key: 'cantidad',       label: 'Cantidad',     defaultVisible: true,  getValue: r => r.cantidad },
  { key: 'precio_unit',    label: 'Precio Unit.', defaultVisible: true,  getValue: r => fmtMoney(r.precio_unit) },
  { key: 'total_neto',     label: 'Total',        defaultVisible: true,  getValue: r => fmtMoney(r.total_neto) },
]
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/columnDefs.ts
git commit -m "feat(empresas): add EMPRESA_FACTURA_COLS and EMPRESA_PRODUCTO_COLS"
```

---

### Task 8: `EmpresaExportPanel.tsx`

**Files:**
- Create: `frontend/src/components/EmpresaExportPanel.tsx`

- [ ] **Step 1: Create `frontend/src/components/EmpresaExportPanel.tsx`**

```typescript
import { useState, useMemo } from 'react'
import { Download, Mail, MessageCircle } from 'lucide-react'
import { api } from '../lib/api'
import type { GenericColDef } from '../types'

interface Props<T> {
  rows: T[]
  colDefs: GenericColDef<T>[]
  isLoading: boolean
  exportBaseUrl: string
  storageKey: string
  filename: string
}

const PREVIEW_CAP = 200

export default function EmpresaExportPanel<T>({
  rows, colDefs, isLoading, exportBaseUrl, storageKey, filename,
}: Props<T>) {
  const [visibleKeys, setVisibleKeys] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        const valid = new Set(colDefs.map(c => c.key))
        const filtered = parsed.filter(k => valid.has(k))
        if (filtered.length > 0) return filtered
      }
    } catch {}
    return colDefs.filter(c => c.defaultVisible).map(c => c.key)
  })

  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  function toggleKey(key: string) {
    setVisibleKeys(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      localStorage.setItem(storageKey, JSON.stringify(next))
      return next
    })
  }

  const visibleCols = useMemo(() => colDefs.filter(c => visibleKeys.includes(c.key)), [colDefs, visibleKeys])
  const displayRows = useMemo(() => rows.slice(0, PREVIEW_CAP), [rows])

  async function handleExport(format: 'xlsx' | 'csv' | 'pdf') {
    setExportError(null)
    setIsExporting(true)
    try {
      const colParams = visibleKeys.map(k => `columns=${encodeURIComponent(k)}`).join('&')
      const sep = exportBaseUrl.includes('?') ? '&' : '?'
      const url = `${exportBaseUrl}${sep}format=${format}&${colParams}`
      const mimeTypes = {
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        csv: 'text/csv',
        pdf: 'application/pdf',
      }
      const resp = await api.get(url, { responseType: 'blob' })
      const ext = format
      const blob = new Blob([resp.data], { type: mimeTypes[format] })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename.replace(/\.[^.]+$/, '') + '.' + ext
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(a.href), 100)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Error al exportar')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Column picker */}
      <div className="flex flex-wrap gap-1.5">
        {colDefs.map(col => {
          const active = visibleKeys.includes(col.key)
          return (
            <button key={col.key} onClick={() => toggleKey(col.key)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors border ${
                active
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
              }`}>
              {active ? '✓ ' : ''}{col.label}
            </button>
          )
        })}
      </div>

      {/* Preview table */}
      {isLoading ? (
        <div className="text-gray-400 text-sm py-6 text-center">Cargando...</div>
      ) : rows.length === 0 ? (
        <div className="text-gray-400 text-sm py-6 text-center">Sin datos</div>
      ) : visibleCols.length === 0 ? (
        <div className="text-gray-400 text-sm py-6 text-center">Selecciona al menos una columna</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="text-xs w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <tr>
                {visibleCols.map(col => (
                  <th key={col.key} className="text-left px-3 py-2 font-medium whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
              {displayRows.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  {visibleCols.map(col => (
                    <td key={col.key} className="px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {col.getValue(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <span className="text-xs text-gray-400">
          {rows.length > PREVIEW_CAP
            ? `Mostrando ${PREVIEW_CAP} de ${rows.length} filas — exporta todas`
            : `${rows.length} fila${rows.length !== 1 ? 's' : ''}`}
        </span>
        <div className="flex flex-col items-end gap-1">
          {exportError && <span className="text-xs text-red-500">{exportError}</span>}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => handleExport('xlsx')}
              disabled={isExporting || visibleKeys.length === 0 || rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
              <Download size={13} />
              Excel
            </button>
            <button onClick={() => handleExport('csv')}
              disabled={isExporting || visibleKeys.length === 0 || rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
              <Download size={13} />
              CSV
            </button>
            <button onClick={() => handleExport('pdf')}
              disabled={isExporting || visibleKeys.length === 0 || rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
              <Download size={13} />
              PDF
            </button>
            <button disabled title="Pendiente de implementación"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-300 dark:bg-gray-700 opacity-50 text-gray-500 dark:text-gray-400 text-xs font-semibold rounded-lg cursor-not-allowed">
              <Mail size={13} />
              Email
            </button>
            <button disabled title="Pendiente de implementación"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-300 dark:bg-gray-700 opacity-50 text-gray-500 dark:text-gray-400 text-xs font-semibold rounded-lg cursor-not-allowed">
              <MessageCircle size={13} />
              WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/EmpresaExportPanel.tsx
git commit -m "feat(empresas): add EmpresaExportPanel component with Excel/CSV/PDF buttons"
```

---

### Task 9: `EmpresaFilters.tsx`

**Files:**
- Create: `frontend/src/components/EmpresaFilters.tsx`

- [ ] **Step 1: Create `frontend/src/components/EmpresaFilters.tsx`**

```typescript
import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, X } from 'lucide-react'
import { api } from '../lib/api'

interface ProductoMin { id: number; nombre: string; sku: string | null }

interface Props {
  busqueda: string
  onBusquedaChange: (v: string) => void
  sector: string | null
  onSectorChange: (v: string | null) => void
  productoIds: number[]
  productoNombres: string[]
  onProductosChange: (ids: number[], nombres: string[]) => void
  filterConDeuda: boolean
  onFilterConDeudaChange: (v: boolean) => void
  totalCount: number
}

type OpenPill = 'sector' | 'productos' | null

export default function EmpresaFilters({
  busqueda, onBusquedaChange,
  sector, onSectorChange,
  productoIds, productoNombres, onProductosChange,
  filterConDeuda, onFilterConDeudaChange,
  totalCount,
}: Props) {
  const [openPill, setOpenPill] = useState<OpenPill>(null)
  const [productoSearch, setProductoSearch] = useState('')
  const pillRef = useRef<HTMLDivElement>(null)

  const { data: sectores = [] } = useQuery<string[]>({
    queryKey: ['empresas-sectores'],
    queryFn: () => api.get('/api/empresas/sectores').then(r => r.data),
  })

  const { data: productos = [] } = useQuery<ProductoMin[]>({
    queryKey: ['productos-min', productoSearch],
    queryFn: () =>
      api.get(`/api/productos/?q=${encodeURIComponent(productoSearch)}&limit=50`).then(r =>
        Array.isArray(r.data) ? r.data : r.data.items ?? []
      ),
  })

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) {
        setOpenPill(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function togglePill(pill: OpenPill) {
    setOpenPill(prev => prev === pill ? null : pill)
  }

  function toggleProducto(p: ProductoMin) {
    if (productoIds.includes(p.id)) {
      onProductosChange(
        productoIds.filter(id => id !== p.id),
        productoNombres.filter((_, i) => productoIds[i] !== p.id),
      )
    } else {
      onProductosChange([...productoIds, p.id], [...productoNombres, p.nombre])
    }
  }

  const pillBase = 'flex items-center rounded-full border text-sm transition-colors'
  const pillInactive = 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
  const pillActive = 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300'

  return (
    <div className="flex gap-2 flex-wrap items-center px-4 py-2 border-b border-gray-200 dark:border-gray-800" ref={pillRef}>
      {/* Text search */}
      <input
        value={busqueda}
        onChange={e => onBusquedaChange(e.target.value)}
        placeholder="Buscar nombre / RUT..."
        className="bg-gray-100 dark:bg-gray-800 text-sm rounded-full px-3 py-1.5 text-gray-700 dark:text-gray-300 placeholder-gray-400 border border-gray-200 dark:border-gray-700 focus:outline-none focus:border-brand-400 min-w-[180px]"
      />

      {/* Sector pill */}
      <div className="relative flex-shrink-0">
        <div className={`${pillBase} ${sector ? pillActive : pillInactive}`}>
          <button onClick={() => togglePill('sector')} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5">
            <span className="whitespace-nowrap">{sector ? `Sector: ${sector}` : 'Sector'}</span>
            <ChevronDown size={13} className={`transition-transform ${openPill === 'sector' ? 'rotate-180' : ''} text-gray-400`} />
          </button>
          {sector && (
            <button onClick={e => { e.stopPropagation(); onSectorChange(null) }}
              className="pr-2 pl-0.5 py-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              <X size={13} />
            </button>
          )}
        </div>
        {openPill === 'sector' && (
          <div className="absolute top-full left-0 mt-1.5 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-2 min-w-[180px]">
            {sectores.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400">Sin sectores</div>
            )}
            {sectores.map(s => (
              <button key={s} onClick={() => { onSectorChange(s === sector ? null : s); setOpenPill(null) }}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 ${sector === s ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-gray-800 dark:text-gray-200'}`}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Productos multi-select pill */}
      <div className="relative flex-shrink-0">
        <div className={`${pillBase} ${productoIds.length > 0 ? pillActive : pillInactive}`}>
          <button onClick={() => togglePill('productos')} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5">
            <span className="whitespace-nowrap">
              {productoIds.length > 0
                ? `Productos (${productoIds.length})`
                : 'Productos'}
            </span>
            <ChevronDown size={13} className={`transition-transform ${openPill === 'productos' ? 'rotate-180' : ''} text-gray-400`} />
          </button>
          {productoIds.length > 0 && (
            <button onClick={e => { e.stopPropagation(); onProductosChange([], []) }}
              className="pr-2 pl-0.5 py-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              <X size={13} />
            </button>
          )}
        </div>
        {openPill === 'productos' && (
          <div className="absolute top-full left-0 mt-1.5 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-2 w-72">
            <div className="px-3 pb-2">
              <input
                value={productoSearch}
                onChange={e => setProductoSearch(e.target.value)}
                placeholder="Buscar producto..."
                className="w-full bg-gray-100 dark:bg-gray-700 text-sm rounded px-2 py-1 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none"
                autoFocus
              />
            </div>
            {productoIds.length > 0 && (
              <>
                <div className="px-3 py-1 text-xs font-medium text-gray-400 uppercase tracking-wide">Seleccionados</div>
                {productoIds.map((id, idx) => (
                  <button key={id}
                    onClick={() => toggleProducto({ id, nombre: productoNombres[idx], sku: null })}
                    className="flex items-center justify-between w-full px-3 py-1.5 text-sm text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/30">
                    <span>{productoNombres[idx]}</span>
                    <X size={11} />
                  </button>
                ))}
                <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
              </>
            )}
            <div className="px-3 py-1 text-xs font-medium text-gray-400 uppercase tracking-wide">Productos</div>
            {productos
              .filter(p => !productoIds.includes(p.id))
              .slice(0, 20)
              .map(p => (
                <button key={p.id} onClick={() => toggleProducto(p)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-left">
                  {p.sku && <span className="text-gray-400 text-xs font-mono">{p.sku}</span>}
                  <span>{p.nombre}</span>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Con Deuda toggle */}
      <button onClick={() => onFilterConDeudaChange(!filterConDeuda)}
        className={`${pillBase} px-3 py-1.5 ${filterConDeuda ? pillActive : pillInactive}`}>
        Con Deuda
      </button>

      <span className="ml-auto text-xs text-gray-400">{totalCount} empresa{totalCount !== 1 ? 's' : ''}</span>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/EmpresaFilters.tsx
git commit -m "feat(empresas): add EmpresaFilters component with sector, product multi-select, con-deuda"
```

---

### Task 10: `EmpresaTabResumen.tsx`

**Files:**
- Create: `frontend/src/components/EmpresaTabResumen.tsx`

- [ ] **Step 1: Create `frontend/src/components/EmpresaTabResumen.tsx`**

```typescript
import type { EmpresaListItem, Empresa } from '../types'

interface Props {
  empresa: EmpresaListItem
  onEdit: (e: Empresa) => void
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtMoney(n: number | null) {
  if (n == null) return '—'
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-sky-500' : 'text-gray-900 dark:text-white'}`}>
        {value || '—'}
      </div>
    </div>
  )
}

export default function EmpresaTabResumen({ empresa, onEdit }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Field label="RUT" value={empresa.rut ?? '—'} />
        <Field label="Razón Social" value={empresa.razon_social ?? '—'} />
        <Field label="Sector" value={empresa.sector ?? '—'} />
        <Field label="Forma de Pago" value={empresa.forma_pago ?? '—'} />
        <Field label="Plazo de Crédito" value={empresa.plazo_credito ?? '—'} />
        <Field label="Prioridad" value={empresa.prioridad ?? '—'} />
        <Field label="Línea de Crédito" value={fmtMoney(empresa.linea_credito)} />
        <Field label="Límite de Crédito" value={fmtMoney(empresa.limite_credito)} />
        <Field label="Última Compra" value={fmtDate(empresa.ultima_compra)} highlight />
        <Field label="Email" value={empresa.email ?? '—'} />
        <Field label="Ubicación" value={empresa.ubicacion ?? '—'} />
      </div>
      {empresa.nota_cobranza && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Nota de Cobranza</div>
          <div className="text-sm text-gray-700 dark:text-gray-300">{empresa.nota_cobranza}</div>
        </div>
      )}
      <div>
        <button onClick={() => onEdit(empresa)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          ✏ Editar empresa
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/EmpresaTabResumen.tsx
git commit -m "feat(empresas): add EmpresaTabResumen component"
```

---

### Task 11: `EmpresaTabCredito.tsx`

**Files:**
- Create: `frontend/src/components/EmpresaTabCredito.tsx`

- [ ] **Step 1: Create `frontend/src/components/EmpresaTabCredito.tsx`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

interface CreditoOut {
  limite_credito: number | null
  credito_usado: number | null
  credito_disponible: number | null
}

interface Props {
  empresaId: number
}

function fmtMoney(n: number | null) {
  if (n == null) return '—'
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 flex flex-col gap-1">
      <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold font-num ${color ?? 'text-gray-900 dark:text-white'}`}>{value}</div>
    </div>
  )
}

export default function EmpresaTabCredito({ empresaId }: Props) {
  const { data, isLoading } = useQuery<CreditoOut>({
    queryKey: ['empresa-credito', empresaId],
    queryFn: () => api.get(`/api/empresas/${empresaId}/credito`).then(r => r.data),
  })

  if (isLoading) return <div className="text-gray-400 text-sm py-8 text-center">Cargando...</div>

  if (!data || data.limite_credito == null) {
    return (
      <div className="text-gray-400 text-sm py-8 text-center">
        Esta empresa no tiene límite de crédito configurado.
      </div>
    )
  }

  const pct = data.limite_credito > 0
    ? Math.round((Number(data.credito_usado ?? 0) / Number(data.limite_credito)) * 100)
    : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Límite de Crédito" value={fmtMoney(data.limite_credito)} />
        <Stat
          label="Crédito Usado"
          value={fmtMoney(data.credito_usado)}
          color={pct > 80 ? 'text-red-500' : pct > 50 ? 'text-orange-500' : 'text-gray-900 dark:text-white'}
        />
        <Stat
          label="Disponible"
          value={fmtMoney(data.credito_disponible)}
          color={(data.credito_disponible ?? 0) < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}
        />
      </div>
      {data.limite_credito > 0 && (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Uso del crédito</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-orange-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/EmpresaTabCredito.tsx
git commit -m "feat(empresas): add EmpresaTabCredito component with usage bar"
```

---

### Task 12: `EmpresaTabFacturas.tsx`

**Files:**
- Create: `frontend/src/components/EmpresaTabFacturas.tsx`

- [ ] **Step 1: Create `frontend/src/components/EmpresaTabFacturas.tsx`**

```typescript
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { api } from '../lib/api'
import type { EmpresaFacturaItem } from '../types'
import { EMPRESA_FACTURA_COLS } from '../lib/columnDefs'
import EmpresaExportPanel from './EmpresaExportPanel'

const ESTADO_BADGE: Record<string, string> = {
  emitida: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  pagada:  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  parcial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  anulada: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

type SortField = 'fecha' | 'numero' | 'total' | 'pendiente' | 'estado'

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

interface Props {
  empresaId: number
  empresaNombre: string
}

export default function EmpresaTabFacturas({ empresaId, empresaNombre }: Props) {
  const [estados, setEstados] = useState<string[]>([])
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [sortField, setSortField] = useState<SortField>('fecha')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showExport, setShowExport] = useState(false)
  const [estadoPillOpen, setEstadoPillOpen] = useState(false)

  const params = new URLSearchParams()
  estados.forEach(e => params.append('estado', e))
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)
  params.set('sort_by', sortField)
  params.set('sort_dir', sortDir)

  const { data: facturas = [], isLoading } = useQuery<EmpresaFacturaItem[]>({
    queryKey: ['empresa-facturas', empresaId, estados, fechaDesde, fechaHasta, sortField, sortDir],
    queryFn: () =>
      api.get(`/api/empresas/${empresaId}/facturas?${params.toString()}`).then(r => r.data),
  })

  const exportBaseUrl = `/api/empresas/${empresaId}/export/facturas?${(() => {
    const p = new URLSearchParams()
    estados.forEach(e => p.append('estado', e))
    if (fechaDesde) p.set('fecha_desde', fechaDesde)
    if (fechaHasta) p.set('fecha_hasta', fechaHasta)
    return p.toString()
  })()}`

  const totalPendiente = useMemo(() => facturas.reduce((s, f) => s + f.pendiente, 0), [facturas])

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-gray-500 ml-1">↕</span>
    return <span className="text-sky-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {/* Estado pill */}
        <div className="relative">
          <button onClick={() => setEstadoPillOpen(o => !o)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full border text-sm transition-colors ${estados.length > 0 ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
            {estados.length > 0 ? `Estado (${estados.length})` : 'Estado'}
            <ChevronDown size={12} className={`transition-transform ${estadoPillOpen ? 'rotate-180' : ''}`} />
          </button>
          {estadoPillOpen && (
            <div className="absolute top-full left-0 mt-1.5 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-2 min-w-[150px]">
              {['emitida', 'pagada', 'parcial', 'anulada'].map(e => (
                <label key={e} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                  <input type="checkbox" checked={estados.includes(e)}
                    onChange={() => setEstados(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])}
                    className="rounded" />
                  {e}
                </label>
              ))}
            </div>
          )}
        </div>
        {/* Date range */}
        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-sm text-gray-700 dark:text-gray-300" />
        <span className="text-gray-400 text-sm">→</span>
        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-sm text-gray-700 dark:text-gray-300" />
        <button onClick={() => setShowExport(o => !o)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold rounded-lg transition-colors">
          ↓ Exportar
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Cargando...</div>
      ) : facturas.length === 0 ? (
        <div className="text-gray-400 text-sm py-8 text-center">Sin facturas</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="text-sm w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              <tr>
                {(['numero', 'fecha', 'estado', 'total', 'monto_pagado', 'pendiente'] as SortField[]).map(field => (
                  <th key={field} onClick={() => toggleSort(field as SortField)}
                    className="text-left px-3 py-2 font-medium whitespace-nowrap cursor-pointer hover:text-gray-900 dark:hover:text-white select-none">
                    {{ numero: 'Nº', fecha: 'Fecha', estado: 'Estado', total: 'Total', monto_pagado: 'Pagado', pendiente: 'Pendiente' }[field]}
                    <SortIcon field={field as SortField} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
              {facturas.map(f => (
                <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">FAC-{String(f.numero).padStart(4, '0')}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(f.fecha)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO_BADGE[f.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                      {f.estado}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-num text-gray-700 dark:text-gray-300">{fmtMoney(f.total)}</td>
                  <td className="px-3 py-2 text-right font-num text-green-600 dark:text-green-400">{fmtMoney(f.monto_pagado)}</td>
                  <td className={`px-3 py-2 text-right font-num font-semibold ${f.pendiente > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {f.pendiente > 0 ? fmtMoney(f.pendiente) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {facturas.length > 0 && (
        <div className="flex justify-between text-xs text-gray-400 px-1">
          <span>{facturas.length} factura{facturas.length !== 1 ? 's' : ''}</span>
          {totalPendiente > 0 && (
            <span className="text-red-500 font-semibold">Total pendiente: {fmtMoney(totalPendiente)}</span>
          )}
        </div>
      )}

      {/* Export panel */}
      {showExport && (
        <EmpresaExportPanel
          rows={facturas}
          colDefs={EMPRESA_FACTURA_COLS}
          isLoading={isLoading}
          exportBaseUrl={exportBaseUrl}
          storageKey={`empresa-facturas-cols-${empresaId}`}
          filename={`facturas-${empresaNombre.replace(/\s+/g, '-')}.xlsx`}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/EmpresaTabFacturas.tsx
git commit -m "feat(empresas): add EmpresaTabFacturas with filters, sort, and export panel"
```

---

### Task 13: `EmpresaTabProductos.tsx`

**Files:**
- Create: `frontend/src/components/EmpresaTabProductos.tsx`

- [ ] **Step 1: Create `frontend/src/components/EmpresaTabProductos.tsx`**

```typescript
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { EmpresaProductoLine } from '../types'
import { EMPRESA_PRODUCTO_COLS } from '../lib/columnDefs'
import EmpresaExportPanel from './EmpresaExportPanel'

type SortField = 'fecha' | 'sku' | 'descripcion' | 'cantidad' | 'precio_unit' | 'total_neto'

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

interface Props {
  empresaId: number
  empresaNombre: string
}

export default function EmpresaTabProductos({ empresaId, empresaNombre }: Props) {
  const [q, setQ] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [sortField, setSortField] = useState<SortField>('fecha')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showExport, setShowExport] = useState(false)

  const params = new URLSearchParams({ q, sort_by: sortField, sort_dir: sortDir })
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)

  const { data: lineas = [], isLoading } = useQuery<EmpresaProductoLine[]>({
    queryKey: ['empresa-productos', empresaId, q, fechaDesde, fechaHasta, sortField, sortDir],
    queryFn: () =>
      api.get(`/api/empresas/${empresaId}/productos?${params.toString()}`).then(r => r.data),
  })

  const exportBaseUrl = `/api/empresas/${empresaId}/export/productos?${(() => {
    const p = new URLSearchParams({ q })
    if (fechaDesde) p.set('fecha_desde', fechaDesde)
    if (fechaHasta) p.set('fecha_hasta', fechaHasta)
    return p.toString()
  })()}`

  const totalNeto = useMemo(() => lineas.reduce((s, l) => s + l.total_neto, 0), [lineas])
  const facturaCount = useMemo(() => new Set(lineas.map(l => l.factura_id)).size, [lineas])

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-gray-500 ml-1">↕</span>
    return <span className="text-sky-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const HEADERS: { field: SortField; label: string }[] = [
    { field: 'fecha',       label: 'Fecha' },
    { field: 'sku',         label: 'SKU' },
    { field: 'descripcion', label: 'Descripción' },
    { field: 'cantidad',    label: 'Cantidad' },
    { field: 'precio_unit', label: 'Precio Unit.' },
    { field: 'total_neto',  label: 'Total' },
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar SKU o descripción..."
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 min-w-[200px]" />
        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300" />
        <span className="text-gray-400 text-sm">→</span>
        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300" />
        <button onClick={() => setShowExport(o => !o)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold rounded-lg transition-colors">
          ↓ Exportar
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Cargando...</div>
      ) : lineas.length === 0 ? (
        <div className="text-gray-400 text-sm py-8 text-center">Sin líneas de productos</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="text-sm w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              <tr>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap cursor-pointer hover:text-gray-900 dark:hover:text-white select-none"
                  onClick={() => toggleSort('fecha')}>
                  Fecha <SortIcon field="fecha" />
                </th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap text-sky-500">Nº Fac.</th>
                {HEADERS.filter(h => h.field !== 'fecha').map(({ field, label }) => (
                  <th key={field} onClick={() => toggleSort(field)}
                    className="text-left px-3 py-2 font-medium whitespace-nowrap cursor-pointer hover:text-gray-900 dark:hover:text-white select-none">
                    {label} <SortIcon field={field} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
              {lineas.map((l, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(l.fecha)}</td>
                  <td className="px-3 py-2 text-sky-500 font-mono text-xs whitespace-nowrap">
                    FAC-{String(l.factura_numero).padStart(4, '0')}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">{l.sku ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{l.descripcion}</td>
                  <td className="px-3 py-2 text-right font-num text-gray-700 dark:text-gray-300">{l.cantidad}</td>
                  <td className="px-3 py-2 text-right font-num text-gray-500 dark:text-gray-400">{fmtMoney(l.precio_unit)}</td>
                  <td className="px-3 py-2 text-right font-num font-semibold text-gray-900 dark:text-white">{fmtMoney(l.total_neto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {lineas.length > 0 && (
        <div className="flex justify-between text-xs text-gray-400 px-1">
          <span>{lineas.length} línea{lineas.length !== 1 ? 's' : ''} en {facturaCount} factura{facturaCount !== 1 ? 's' : ''}</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">Total: {fmtMoney(totalNeto)}</span>
        </div>
      )}

      {/* Export panel */}
      {showExport && (
        <EmpresaExportPanel
          rows={lineas}
          colDefs={EMPRESA_PRODUCTO_COLS}
          isLoading={isLoading}
          exportBaseUrl={exportBaseUrl}
          storageKey={`empresa-productos-cols-${empresaId}`}
          filename={`productos-${empresaNombre.replace(/\s+/g, '-')}.xlsx`}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/EmpresaTabProductos.tsx
git commit -m "feat(empresas): add EmpresaTabProductos with search, sort, date filter, and export"
```

---

### Task 14: `EmpresaDetailModal.tsx`

**Files:**
- Create: `frontend/src/components/EmpresaDetailModal.tsx`

- [ ] **Step 1: Create `frontend/src/components/EmpresaDetailModal.tsx`**

```typescript
import { useState } from 'react'
import { X } from 'lucide-react'
import type { EmpresaListItem, Empresa } from '../types'
import EmpresaTabResumen from './EmpresaTabResumen'
import EmpresaTabFacturas from './EmpresaTabFacturas'
import EmpresaTabProductos from './EmpresaTabProductos'
import EmpresaTabCredito from './EmpresaTabCredito'

type Tab = 'resumen' | 'facturas' | 'productos' | 'credito'

const TABS: { key: Tab; label: string }[] = [
  { key: 'resumen',   label: 'Resumen' },
  { key: 'facturas',  label: 'Facturas' },
  { key: 'productos', label: 'Productos' },
  { key: 'credito',   label: 'Crédito' },
]

interface Props {
  empresa: EmpresaListItem | null
  onClose: () => void
  onEdit: (e: Empresa) => void
}

export default function EmpresaDetailModal({ empresa, onClose, onEdit }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('resumen')

  if (!empresa) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{empresa.nombre}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {[empresa.rut, empresa.sector, empresa.prioridad ? `Prioridad ${empresa.prioridad}` : null]
                .filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mt-0.5">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === key
                  ? 'border-sky-500 text-sky-600 dark:text-sky-400 bg-white dark:bg-gray-900'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'resumen' && (
            <EmpresaTabResumen empresa={empresa} onEdit={onEdit} />
          )}
          {activeTab === 'facturas' && (
            <EmpresaTabFacturas empresaId={empresa.id} empresaNombre={empresa.nombre} />
          )}
          {activeTab === 'productos' && (
            <EmpresaTabProductos empresaId={empresa.id} empresaNombre={empresa.nombre} />
          )}
          {activeTab === 'credito' && (
            <EmpresaTabCredito empresaId={empresa.id} />
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/EmpresaDetailModal.tsx
git commit -m "feat(empresas): add EmpresaDetailModal with 4 tabs"
```

---

### Task 15: Update `Empresas.tsx` — wire everything together

**Files:**
- Modify: `frontend/src/pages/Empresas.tsx`

This is the most invasive change. Read the current file before editing.

- [ ] **Step 1: Update imports at top of `frontend/src/pages/Empresas.tsx`**

Replace:
```typescript
import type { Empresa, EmpresaDeuda, DeudaBulkItem } from '../types'
```
With:
```typescript
import type { Empresa, EmpresaListItem, EmpresaDeuda, DeudaBulkItem } from '../types'
import EmpresaFilters from '../components/EmpresaFilters'
import EmpresaDetailModal from '../components/EmpresaDetailModal'
```

- [ ] **Step 2: Update the query type and add new filter state**

Replace:
```typescript
  const { data: empresas = [], isLoading } = useQuery<Empresa[]>({
    queryKey: ['empresas', debouncedBusqueda],
    queryFn: () => api.get(`/api/empresas/?q=${encodeURIComponent(debouncedBusqueda)}`).then(r => r.data),
    placeholderData: keepPreviousData,
  })
```
With:
```typescript
  const [sector, setSector] = useState<string | null>(null)
  const [productoIds, setProductoIds] = useState<number[]>([])
  const [productoNombres, setProductoNombres] = useState<string[]>([])
  const [detalleEmpresa, setDetalleEmpresa] = useState<EmpresaListItem | null>(null)

  const { data: empresas = [], isLoading } = useQuery<EmpresaListItem[]>({
    queryKey: ['empresas', debouncedBusqueda, sector, productoIds],
    queryFn: () => {
      const params = new URLSearchParams({ q: debouncedBusqueda })
      if (sector) params.set('sector', sector)
      productoIds.forEach(id => params.append('producto_ids', String(id)))
      return api.get(`/api/empresas/?${params.toString()}`).then(r => r.data)
    },
    placeholderData: keepPreviousData,
  })
```

- [ ] **Step 3: Extend `sortField` type and `toggleSort` to cover all columns**

Replace:
```typescript
  const [sortField, setSortField] = useState<'deuda_total' | 'deuda_vencida' | 'nombre'>('deuda_total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
```
With:
```typescript
  type SortField = 'nombre' | 'rut' | 'sector' | 'forma_pago' | 'prioridad' | 'ultima_compra' | 'deuda_total' | 'deuda_vencida'
  const [sortField, setSortField] = useState<SortField>('deuda_total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
```

Replace the existing `toggleSort` function:
```typescript
  function toggleSort(field: 'deuda_total' | 'deuda_vencida' | 'nombre') {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }
```
With:
```typescript
  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }
```

- [ ] **Step 4: Update `displayEmpresas` sort logic to handle all columns**

Replace the existing `displayEmpresas` block:
```typescript
  const displayEmpresas = [...empresas]
    .filter(e => !filterConDeuda || (deudaMap.get(e.id)?.deuda_total ?? 0) > 0)
    .sort((a, b) => {
      const da = deudaMap.get(a.id)
      const db2 = deudaMap.get(b.id)
      if (sortField === 'nombre') {
        const cmp = a.nombre.localeCompare(b.nombre)
        return sortDir === 'asc' ? cmp : -cmp
      }
      const va = Number(da?.[sortField] ?? 0)
      const vb = Number(db2?.[sortField] ?? 0)
      return sortDir === 'asc' ? va - vb : vb - va
    })
```
With:
```typescript
  const displayEmpresas = [...empresas]
    .filter(e => !filterConDeuda || (deudaMap.get(e.id)?.deuda_total ?? 0) > 0)
    .sort((a, b) => {
      const da = deudaMap.get(a.id)
      const db2 = deudaMap.get(b.id)
      let cmp = 0
      if (sortField === 'deuda_total') {
        cmp = Number(da?.deuda_total ?? 0) - Number(db2?.deuda_total ?? 0)
      } else if (sortField === 'deuda_vencida') {
        cmp = Number(da?.deuda_vencida ?? 0) - Number(db2?.deuda_vencida ?? 0)
      } else if (sortField === 'ultima_compra') {
        const ta = a.ultima_compra ? new Date(a.ultima_compra).getTime() : 0
        const tb = b.ultima_compra ? new Date(b.ultima_compra).getTime() : 0
        cmp = ta - tb
      } else {
        const va = String((a as Record<string, unknown>)[sortField] ?? '')
        const vb = String((b as Record<string, unknown>)[sortField] ?? '')
        cmp = va.localeCompare(vb, 'es-CL')
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
```

- [ ] **Step 5: Replace the stats bar + filter section with `EmpresaFilters`**

Find the stats bar + the search/filter row in the JSX (lines ~192–229 in original) and replace that section with:

```tsx
        {/* Stats bar */}
        <div className="flex gap-3 flex-wrap px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">Total Deuda</span>
            <span className="text-red-500 font-bold ml-2">{fmt(totalDeuda)}</span>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">Deuda Vencida</span>
            <span className={`font-bold ml-2 ${totalVencida > 0 ? 'text-orange-500' : 'text-gray-400'}`}>{fmt(totalVencida)}</span>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">Con Deuda</span>
            <span className="font-bold ml-2 text-gray-900 dark:text-white">{empresasConDeuda}</span>
          </div>
        </div>

        <EmpresaFilters
          busqueda={busqueda}
          onBusquedaChange={setBusqueda}
          sector={sector}
          onSectorChange={setSector}
          productoIds={productoIds}
          productoNombres={productoNombres}
          onProductosChange={(ids, nombres) => { setProductoIds(ids); setProductoNombres(nombres) }}
          filterConDeuda={filterConDeuda}
          onFilterConDeudaChange={setFilterConDeuda}
          totalCount={displayEmpresas.length}
        />
```

- [ ] **Step 6: Update the table header to add sortable columns**

Replace the existing `<thead>` block with one that adds all sortable columns including `Última Compra`. The existing thead has columns: Nombre, Razón Social, RUT, Forma Pago, Prioridad, Sector, Deuda, Vencida, Límite de Crédito, Actions.

Replace the `<thead>` with:

```tsx
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                {([
                  { field: 'nombre' as SortField,       label: 'Nombre' },
                  { field: 'rut' as SortField,          label: 'RUT' },
                  { field: 'sector' as SortField,       label: 'Sector' },
                  { field: 'forma_pago' as SortField,   label: 'Forma Pago' },
                  { field: 'prioridad' as SortField,    label: 'Prioridad' },
                  { field: 'ultima_compra' as SortField, label: 'Última Compra' },
                  { field: 'deuda_total' as SortField,  label: 'Deuda' },
                  { field: 'deuda_vencida' as SortField, label: 'Vencida' },
                ] as { field: SortField; label: string }[]).map(({ field, label }) => (
                  <th key={field} onClick={() => toggleSort(field)}
                    className="text-left px-3 py-3 font-medium whitespace-nowrap cursor-pointer hover:text-gray-900 dark:hover:text-white select-none">
                    {label}
                    {sortField === field
                      ? <span className="text-sky-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      : <span className="text-gray-400 ml-1">↕</span>}
                  </th>
                ))}
                <th className="text-left px-3 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
```

- [ ] **Step 7: Update the table row to show `ultima_compra` and replace "Deuda" button with "Ver"**

In the `<tbody>` rows, replace the existing `<tr>` JSX for each empresa. The key changes are:
1. Remove Razón Social and Límite de Crédito columns (too many columns now — keep the important ones)
2. Add `ultima_compra` column
3. Replace `deudaEmpresa` button with `detalleEmpresa` button

Replace the row JSX inside the map (find `displayEmpresas.map(e => (` and replace the `<tr>` content):

```tsx
              {displayEmpresas.map(e => {
                const d = deudaMap.get(e.id)
                const deudaTotal = Number(d?.deuda_total ?? 0)
                const deudaVencida = Number(d?.deuda_vencida ?? 0)
                return (
                  <tr key={e.id}
                    className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${deudaTotal === 0 ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white">{e.nombre}</td>
                    <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 text-sm">{e.rut ?? '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 text-sm">{e.sector ?? '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 text-sm">
                      {d?.plazo_credito && /^\d+/.test(d.plazo_credito)
                        ? <span className="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 px-1.5 py-0.5 rounded text-xs">{d.plazo_credito}</span>
                        : <span className="text-gray-500 dark:text-gray-400 text-sm">{e.forma_pago ?? '—'}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-sm">
                      {e.prioridad
                        ? <span className={`px-2 py-0.5 rounded text-xs font-medium ${e.prioridad === 'Alta' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'}`}>{e.prioridad}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-sky-500 dark:text-sky-400 text-sm whitespace-nowrap">
                      {e.ultima_compra
                        ? new Date(e.ultima_compra + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className={`px-3 py-2.5 font-num font-semibold text-sm ${deudaTotal > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {deudaTotal > 0 ? fmt(deudaTotal) : '—'}
                    </td>
                    <td className={`px-3 py-2.5 font-num text-sm ${deudaVencida > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                      {deudaVencida > 0 ? fmt(deudaVencida) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1.5">
                        <button onClick={() => setDetalleEmpresa(e)}
                          className="px-2.5 py-1 bg-sky-700 hover:bg-sky-600 text-white text-xs font-medium rounded-lg transition-colors">
                          Ver
                        </button>
                        <button onClick={() => abrirEditar(e)}
                          className="px-2.5 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-lg transition-colors">
                          Editar
                        </button>
                        <button onClick={() => setEliminandoId(e.id)}
                          className="px-2.5 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 text-xs font-medium rounded-lg transition-colors">
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
```

- [ ] **Step 8: Add `EmpresaDetailModal` to the JSX return**

At the end of the main return JSX (before the closing `</div>` of the page), add:

```tsx
      <EmpresaDetailModal
        empresa={detalleEmpresa}
        onClose={() => setDetalleEmpresa(null)}
        onEdit={(e) => {
          setDetalleEmpresa(null)
          abrirEditar(e)
        }}
      />
```

- [ ] **Step 9: Remove old deuda modal code from `Empresas.tsx`**

The old deuda flow (`deudaEmpresa` state, `deudaData` query, `deudaLoading`) is now replaced by `EmpresaDetailModal`. Remove these three items:

1. The `deudaEmpresa` state declaration:
   ```typescript
   const [deudaEmpresa, setDeudaEmpresa] = useState<Empresa | null>(null)
   ```
2. The two queries that depend on it:
   ```typescript
   const { data: deudaData, isLoading: deudaLoading } = useQuery<EmpresaDeuda>({
     queryKey: ['empresa-deuda', deudaEmpresa?.id],
     ...
   })
   ```
3. The entire old deuda modal JSX block in the return statement (the `{deudaEmpresa && (<div className="fixed inset-0 ...">...</div>)}` block — roughly 80 lines).

Also remove the unused import `EmpresaDeuda` from the types import if it's no longer used elsewhere in the file.

- [ ] **Step 10: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 11: Manual smoke test**

Start both servers:
```bash
cd backend && uvicorn app.main:app --reload &
cd frontend && npm run dev &
```

Open http://localhost:5173/empresas (or whatever the dev port is).

Verify:
- [ ] Filter by sector dropdown shows sectors
- [ ] Product multi-select shows products and filters on text input
- [ ] "Última Compra" column appears and shows dates
- [ ] Clicking any column header sorts (arrow indicator updates)
- [ ] "Ver" button opens the detail modal
- [ ] Modal shows 4 tabs (Resumen, Facturas, Productos, Crédito)
- [ ] Facturas tab loads and shows factory rows for the empresa
- [ ] Productos tab shows line-by-line detail with dates and factura number
- [ ] "Exportar" in each tab expands the export panel
- [ ] Excel/CSV/PDF buttons download files
- [ ] Email/WhatsApp buttons are disabled (greyed out)
- [ ] Crédito tab shows credit bar

- [ ] **Step 12: Commit**

```bash
git add frontend/src/pages/Empresas.tsx
git commit -m "feat(empresas): integrate filters, ultima_compra, all-column sort, and detail modal"
```
