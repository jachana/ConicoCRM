# Export Preview Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live export preview panel (split layout, flat line-level table, column picker, Excel export) to Cotizaciones and Facturas list pages.

**Architecture:** Backend adds `columns[]` param to both export endpoints (flat single sheet), adds filters + `selectinload(lineas)` to Facturas list, adds `margen_total` property to Factura model. Frontend introduces a shared `ExportPreviewPanel` component fed by client-side flattening of the already-loaded documents. Both list pages switch to a split layout: list on left, preview on right (desktop); tab toggle on mobile.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React + TypeScript + TanStack Query + Tailwind (frontend), openpyxl for Excel generation.

---

## File Map

**Create:**
- `frontend/src/lib/columnDefs.ts` — `ColDef` arrays for Cotizaciones and Facturas
- `frontend/src/components/ExportPreviewPanel.tsx` — reusable preview panel component
- `frontend/src/pages/Facturas.tsx` — new Facturas list page
- `backend/tests/test_export_flat.py` — export endpoint tests

**Modify:**
- `backend/app/models/factura.py` — add `margen_total` property
- `backend/app/schemas/factura.py` — add `lineas` + `margen_total` to `FacturaListOut`
- `backend/app/api/facturas.py` — list filters + selectinload; export flat sheet + columns[]
- `backend/app/api/cotizaciones.py` — export flat sheet + columns[] (remove two-sheet)
- `frontend/src/types/index.ts` — add `FlatLine`, `ColDef`, `FacturaList` interfaces; add `margen_total` to `Factura`
- `frontend/src/pages/Cotizaciones.tsx` — split layout + ExportPreviewPanel
- `frontend/src/router.tsx` — add `/facturas` route
- `frontend/src/components/layout/Sidebar.tsx` — add Facturas to Cobranza group

---

## Task 1: Factura model `margen_total` + FacturaListOut with lineas

**Files:**
- Modify: `backend/app/models/factura.py`
- Modify: `backend/app/schemas/factura.py`
- Test: `backend/tests/test_facturas.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_facturas.py`:

```python
def test_lista_includes_lineas_and_margen_total(client, admin_token):
    prod = _create_producto(client, admin_token)
    cli_id = _create_cliente(client, admin_token)
    fac = _create_factura(client, admin_token, cli_id, lineas=[
        {"orden": 0, "producto_id": prod["id"], "descripcion": prod["nombre"],
         "cantidad": 1, "valor_neto": 500}
    ])
    r = client.get("/api/facturas/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    found = next(f for f in r.json() if f["id"] == fac["id"])
    assert "lineas" in found
    assert len(found["lineas"]) == 1
    assert found["lineas"][0]["descripcion"] == prod["nombre"]
    assert "margen_total" in found
    assert found["margen_total"] is not None
```

- [ ] **Step 2: Run to verify it fails**

```
cd backend && python -m pytest tests/test_facturas.py::test_lista_includes_lineas_and_margen_total -v
```
Expected: FAIL — `lineas` key missing from list response.

- [ ] **Step 3: Add `margen_total` property to `backend/app/models/factura.py`**

After the `pagos` relationship (around line 69), add:

```python
    @property
    def margen_total(self) -> "Decimal | None":
        lineas_con_margen = [l for l in self.lineas if l.margen is not None]
        if not lineas_con_margen:
            return None
        base = sum(l.total_neto for l in lineas_con_margen)
        if not base:
            return None
        return sum(l.total_neto * l.margen for l in lineas_con_margen) / base
```

- [ ] **Step 4: Update `FacturaListOut` in `backend/app/schemas/factura.py`**

Add `lineas` and `margen_total` fields to `FacturaListOut` (currently ends at line 140):

```python
class FacturaListOut(BaseModel):
    id: int
    numero: int
    cotizacion_id: int | None = None
    nv_id: int | None = None
    cliente_id: int | None = None
    vendedor_id: int | None = None
    empresa_id: int | None = None
    contacto: str | None = None
    fecha: date
    fecha_vencimiento: date | None = None
    estado: str
    correo: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    fecha_pago: date | None = None
    monto_pagado: Decimal | None = None
    metodo_pago: str | None = None
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    lineas: list[FacturaLineaOut] = []
    margen_total: Decimal | None = None
    model_config = {"from_attributes": True}
```

- [ ] **Step 5: Run test to verify it passes**

```
cd backend && python -m pytest tests/test_facturas.py::test_lista_includes_lineas_and_margen_total -v
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/factura.py backend/app/schemas/factura.py backend/tests/test_facturas.py
git commit -m "feat(facturas): add margen_total property and lineas to FacturaListOut"
```

---

## Task 2: Facturas list endpoint — new filters + selectinload

**Files:**
- Modify: `backend/app/api/facturas.py`
- Test: `backend/tests/test_facturas.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_facturas.py`:

```python
def _create_empresa(client, admin_token, nombre="Empresa Test"):
    r = client.post(
        "/api/empresas/",
        json={"nombre": nombre, "rut": f"99.{nombre.__hash__() % 999:03d}.000-0"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_filter_facturas_by_empresa(client, admin_token):
    emp = _create_empresa(client, admin_token, "EmpresaFiltroTest")
    cli_id = _create_cliente(client, admin_token)
    r = client.post(
        "/api/facturas/",
        json={"cliente_id": cli_id, "empresa_id": emp["id"],
              "lineas": [{"orden": 0, "descripcion": "X", "cantidad": 1, "valor_neto": 100}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    fac_id = r.json()["id"]

    r = client.get(f"/api/facturas/?empresa_id={emp['id']}",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    ids = [f["id"] for f in r.json()]
    assert fac_id in ids


def test_filter_facturas_by_monto(client, admin_token):
    cli_id = _create_cliente(client, admin_token)
    r = client.post(
        "/api/facturas/",
        json={"cliente_id": cli_id,
              "lineas": [{"orden": 0, "descripcion": "BigItem", "cantidad": 1, "valor_neto": 50000}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    fac_id = r.json()["id"]

    r = client.get("/api/facturas/?monto_min=40000",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    ids = [f["id"] for f in r.json()]
    assert fac_id in ids

    r = client.get("/api/facturas/?monto_max=100",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert fac_id not in [f["id"] for f in r.json()]


def test_filter_facturas_by_producto(client, admin_token):
    prod = _create_producto(client, admin_token)
    cli_id = _create_cliente(client, admin_token)
    r = client.post(
        "/api/facturas/",
        json={"cliente_id": cli_id,
              "lineas": [{"orden": 0, "producto_id": prod["id"], "descripcion": prod["nombre"],
                          "cantidad": 1, "valor_neto": 200}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    fac_id = r.json()["id"]

    r = client.get(f"/api/facturas/?producto_id={prod['id']}",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    ids = [f["id"] for f in r.json()]
    assert fac_id in ids
```

- [ ] **Step 2: Run to verify they fail**

```
cd backend && python -m pytest tests/test_facturas.py::test_filter_facturas_by_empresa tests/test_facturas.py::test_filter_facturas_by_monto tests/test_facturas.py::test_filter_facturas_by_producto -v
```
Expected: FAIL — 422 Unprocessable Entity (unknown query params).

- [ ] **Step 3: Update `listar_facturas` in `backend/app/api/facturas.py`**

Replace the `listar_facturas` function (currently lines 210–232):

```python
@router.get("/", response_model=list[FacturaListOut])
def listar_facturas(
    estado: list[str] | None = Query(None),
    cliente_id: int | None = Query(None),
    empresa_id: int | None = Query(None),
    vendedor_id: int | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    monto_min: Decimal | None = Query(None),
    monto_max: Decimal | None = Query(None),
    producto_id: list[int] | None = Query(None),
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    q = db.query(Factura).options(
        joinedload(Factura.cliente),
        joinedload(Factura.vendedor),
        joinedload(Factura.empresa),
        selectinload(Factura.lineas),
    )
    if estado:
        q = q.filter(Factura.estado.in_(estado))
    if cliente_id:
        q = q.filter(Factura.cliente_id == cliente_id)
    if empresa_id:
        q = q.filter(Factura.empresa_id == empresa_id)
    if vendedor_id:
        q = q.filter(Factura.vendedor_id == vendedor_id)
    if fecha_desde:
        q = q.filter(Factura.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Factura.fecha <= fecha_hasta)
    if monto_min is not None:
        q = q.filter(Factura.total >= monto_min)
    if monto_max is not None:
        q = q.filter(Factura.total <= monto_max)
    if producto_id:
        q = q.join(FacturaLinea, FacturaLinea.factura_id == Factura.id).filter(
            FacturaLinea.producto_id.in_(producto_id)
        ).distinct()
    return q.order_by(Factura.numero.desc()).all()
```

Also add `selectinload` to the imports at the top of the file:

```python
from sqlalchemy.orm import Session, joinedload, selectinload
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && python -m pytest tests/test_facturas.py::test_filter_facturas_by_empresa tests/test_facturas.py::test_filter_facturas_by_monto tests/test_facturas.py::test_filter_facturas_by_producto -v
```
Expected: PASS

- [ ] **Step 5: Run full factura test suite**

```
cd backend && python -m pytest tests/test_facturas.py -v
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/facturas.py backend/tests/test_facturas.py
git commit -m "feat(facturas): add list filters and selectinload lineas"
```

---

## Task 3: Cotizaciones export — flat sheet + `columns[]` param

**Files:**
- Modify: `backend/app/api/cotizaciones.py`
- Create: `backend/tests/test_export_flat.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_export_flat.py`:

```python
"""Tests for flat-sheet export endpoints."""
from io import BytesIO
import openpyxl


def _setup_cotizacion(client, admin_token):
    r = client.post("/api/clientes/", json={"nombre": "CLI Export"},
                    headers={"Authorization": f"Bearer {admin_token}"})
    cli_id = r.json()["id"]
    r = client.post("/api/cotizaciones/", json={
        "cliente_id": cli_id,
        "lineas": [
            {"orden": 0, "descripcion": "Tornillo M5", "sku": "T-M5",
             "cantidad": 10, "valor_neto": 100},
            {"orden": 1, "descripcion": "Tuerca M5", "sku": "TU-M5",
             "cantidad": 20, "valor_neto": 50},
        ],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 201, r.text
    return r.json()


def test_cotizaciones_export_returns_xlsx(client, admin_token):
    _setup_cotizacion(client, admin_token)
    r = client.get("/api/cotizaciones/export/excel",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    ctype = r.headers.get("content-type", "")
    assert "spreadsheetml" in ctype or "openxmlformats" in ctype


def test_cotizaciones_export_single_flat_sheet(client, admin_token):
    cot = _setup_cotizacion(client, admin_token)
    r = client.get("/api/cotizaciones/export/excel",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    wb = openpyxl.load_workbook(BytesIO(r.content))
    assert len(wb.sheetnames) == 1
    assert wb.sheetnames[0] == "Cotizaciones"
    ws = wb.active
    # One header row + two line rows for our cotizacion
    assert ws.max_row >= 3


def test_cotizaciones_export_columns_param(client, admin_token):
    _setup_cotizacion(client, admin_token)
    r = client.get(
        "/api/cotizaciones/export/excel?columns=numero&columns=cliente_nombre&columns=descripcion",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    wb = openpyxl.load_workbook(BytesIO(r.content))
    ws = wb.active
    headers = [ws.cell(1, col).value for col in range(1, ws.max_column + 1)]
    assert headers == ["Nº COT", "Cliente", "Descripción"]


def test_cotizaciones_export_default_columns_when_none_specified(client, admin_token):
    _setup_cotizacion(client, admin_token)
    r = client.get("/api/cotizaciones/export/excel",
                   headers={"Authorization": f"Bearer {admin_token}"})
    wb = openpyxl.load_workbook(BytesIO(r.content))
    ws = wb.active
    headers = [ws.cell(1, col).value for col in range(1, ws.max_column + 1)]
    # Default columns must include these
    assert "Nº COT" in headers
    assert "Cliente" in headers
    assert "Total Neto" in headers
```

- [ ] **Step 2: Run to verify they fail**

```
cd backend && python -m pytest tests/test_export_flat.py::test_cotizaciones_export_single_flat_sheet tests/test_export_flat.py::test_cotizaciones_export_columns_param -v
```
Expected: FAIL — sheet name is "Resumen" (two-sheet approach still in place).

- [ ] **Step 3: Replace `exportar_excel` in `backend/app/api/cotizaciones.py`**

Replace the entire `exportar_excel` function (currently lines 185–283). The new implementation:

```python
_ESTADO_LABELS: dict[str, str] = {
    "no_definido": "Sin definir", "abierta": "Abierta", "aprobada": "Aprobada",
    "cerrada_fv": "Cerrada (FV)", "rechazada": "Rechazada",
}

_COT_EXPORT_COLUMNS: dict[str, tuple[str, object]] = {
    "numero":         ("Nº COT",      lambda c, l: c.numero),
    "fecha":          ("Fecha",        lambda c, l: c.fecha.strftime("%d/%m/%Y") if c.fecha else ""),
    "estado":         ("Estado",       lambda c, l: _ESTADO_LABELS.get(c.estado, c.estado)),
    "cliente_nombre": ("Cliente",      lambda c, l: c.cliente.nombre if c.cliente else ""),
    "empresa_nombre": ("Empresa",      lambda c, l: c.empresa.nombre if c.empresa else ""),
    "encargado":      ("Encargado",    lambda c, l: c.vendedor.name if c.vendedor else ""),
    "contacto":       ("Contacto",     lambda c, l: c.contacto or ""),
    "sku":            ("SKU",          lambda c, l: l.sku or ""),
    "descripcion":    ("Descripción",  lambda c, l: l.descripcion),
    "formato":        ("Formato",      lambda c, l: l.formato or ""),
    "cantidad":       ("Cantidad",     lambda c, l: l.cantidad),
    "precio_unit":    ("Precio Unit.", lambda c, l: float(l.valor_neto)),
    "total_neto":     ("Total Neto",   lambda c, l: float(l.total_neto)),
    "margen":         ("Margen %",     lambda c, l: round(float(l.margen) * 100, 2) if l.margen is not None else ""),
}
_COT_DEFAULT_COLUMNS = ["numero", "fecha", "cliente_nombre", "empresa_nombre",
                        "sku", "descripcion", "cantidad", "precio_unit", "total_neto", "margen"]


@router.get("/export/excel")
def exportar_excel(
    estado: list[str] | None = Query(None),
    vendedor_id: int | None = Query(None),
    empresa_id: int | None = Query(None),
    cliente_id: int | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    monto_min: Decimal | None = Query(None),
    monto_max: Decimal | None = Query(None),
    producto_id: list[int] | None = Query(None),
    columns: list[str] | None = Query(None),
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    _, db = perms
    q = (
        db.query(Cotizacion)
        .options(
            joinedload(Cotizacion.cliente),
            joinedload(Cotizacion.vendedor),
            joinedload(Cotizacion.empresa),
            selectinload(Cotizacion.lineas).joinedload(CotizacionLinea.producto),
        )
    )
    if estado:
        q = q.filter(Cotizacion.estado.in_(estado))
    if vendedor_id:
        q = q.filter(Cotizacion.vendedor_id == vendedor_id)
    if empresa_id:
        q = q.filter(Cotizacion.empresa_id == empresa_id)
    if cliente_id:
        q = q.filter(Cotizacion.cliente_id == cliente_id)
    if fecha_desde:
        q = q.filter(Cotizacion.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Cotizacion.fecha <= fecha_hasta)
    if monto_min is not None:
        q = q.filter(Cotizacion.total >= monto_min)
    if monto_max is not None:
        q = q.filter(Cotizacion.total <= monto_max)
    if producto_id:
        q = q.join(CotizacionLinea, CotizacionLinea.cotizacion_id == Cotizacion.id).filter(
            CotizacionLinea.producto_id.in_(producto_id)
        ).distinct()
    cotizaciones = q.order_by(Cotizacion.numero.desc()).all()

    col_keys = [k for k in (columns or _COT_DEFAULT_COLUMNS) if k in _COT_EXPORT_COLUMNS]
    if not col_keys:
        col_keys = _COT_DEFAULT_COLUMNS

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Cotizaciones"
    ws.append([_COT_EXPORT_COLUMNS[k][0] for k in col_keys])
    for c in cotizaciones:
        for l in c.lineas:
            ws.append([_COT_EXPORT_COLUMNS[k][1](c, l) for k in col_keys])

    today = date.today().strftime("%Y-%m-%d")
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=cotizaciones-{today}.xlsx"},
    )
```

Also remove the `ESTADO_LABELS` dict that was previously inside the function (it's been replaced by `_ESTADO_LABELS` at module level).

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && python -m pytest tests/test_export_flat.py -v
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/cotizaciones.py backend/tests/test_export_flat.py
git commit -m "feat(cotizaciones): replace two-sheet export with flat sheet + columns[] param"
```

---

## Task 4: Facturas export — filters + `columns[]` + flat line sheet

**Files:**
- Modify: `backend/app/api/facturas.py`
- Modify: `backend/tests/test_export_flat.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_export_flat.py`:

```python
def _setup_factura(client, admin_token):
    r = client.post("/api/clientes/", json={"nombre": "CLI Fac Export"},
                    headers={"Authorization": f"Bearer {admin_token}"})
    cli_id = r.json()["id"]
    r = client.post("/api/facturas/", json={
        "cliente_id": cli_id,
        "lineas": [
            {"orden": 0, "descripcion": "Cable 2.5mm", "sku": "CAB-25",
             "cantidad": 5, "valor_neto": 2400},
        ],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 201, r.text
    return r.json()


def test_facturas_export_returns_xlsx(client, admin_token):
    _setup_factura(client, admin_token)
    r = client.get("/api/facturas/export/excel",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    ctype = r.headers.get("content-type", "")
    assert "spreadsheetml" in ctype or "openxmlformats" in ctype


def test_facturas_export_single_flat_sheet(client, admin_token):
    _setup_factura(client, admin_token)
    r = client.get("/api/facturas/export/excel",
                   headers={"Authorization": f"Bearer {admin_token}"})
    wb = openpyxl.load_workbook(BytesIO(r.content))
    assert len(wb.sheetnames) == 1
    assert wb.sheetnames[0] == "Facturas"
    ws = wb.active
    assert ws.max_row >= 2  # header + at least one line


def test_facturas_export_columns_param(client, admin_token):
    _setup_factura(client, admin_token)
    r = client.get(
        "/api/facturas/export/excel?columns=numero&columns=estado&columns=descripcion",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    wb = openpyxl.load_workbook(BytesIO(r.content))
    ws = wb.active
    headers = [ws.cell(1, col).value for col in range(1, ws.max_column + 1)]
    assert headers == ["Nº FAC", "Estado", "Descripción"]


def test_facturas_export_filter_by_estado(client, admin_token):
    _setup_factura(client, admin_token)
    r = client.get("/api/facturas/export/excel?estado=emitida",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    wb = openpyxl.load_workbook(BytesIO(r.content))
    ws = wb.active
    assert ws.max_row >= 2
```

- [ ] **Step 2: Run to verify they fail**

```
cd backend && python -m pytest tests/test_export_flat.py::test_facturas_export_single_flat_sheet tests/test_export_flat.py::test_facturas_export_columns_param -v
```
Expected: FAIL — current export has no `columns` param and sheet is named "Facturas" but has old document-level rows.

- [ ] **Step 3: Replace `exportar_excel` in `backend/app/api/facturas.py`**

Replace the current `exportar_excel` function (lines 172–207). Place these module-level constants before the router definition (after `_METODOS_PAGO`):

```python
_FAC_EXPORT_COLUMNS: dict[str, tuple[str, object]] = {
    "numero":            ("Nº FAC",        lambda f, l: f.numero),
    "fecha":             ("Fecha",          lambda f, l: f.fecha.strftime("%d/%m/%Y") if f.fecha else ""),
    "estado":            ("Estado",         lambda f, l: f.estado),
    "cliente_nombre":    ("Cliente",        lambda f, l: f.cliente.nombre if f.cliente else ""),
    "empresa_nombre":    ("Empresa",        lambda f, l: f.empresa.nombre if f.empresa else ""),
    "encargado":         ("Encargado",      lambda f, l: f.vendedor.name if f.vendedor else ""),
    "contacto":          ("Contacto",       lambda f, l: f.contacto or ""),
    "sku":               ("SKU",            lambda f, l: l.sku or ""),
    "descripcion":       ("Descripción",    lambda f, l: l.descripcion),
    "formato":           ("Formato",        lambda f, l: l.formato or ""),
    "cantidad":          ("Cantidad",       lambda f, l: l.cantidad),
    "precio_unit":       ("Precio Unit.",   lambda f, l: float(l.valor_neto)),
    "total_neto":        ("Total Neto",     lambda f, l: float(l.total_neto)),
    "margen":            ("Margen %",       lambda f, l: round(float(l.margen) * 100, 2) if l.margen is not None else ""),
    "fecha_vencimiento": ("Vencimiento",    lambda f, l: f.fecha_vencimiento.strftime("%d/%m/%Y") if f.fecha_vencimiento else ""),
    "monto_pagado":      ("Monto Pagado",   lambda f, l: float(f.monto_pagado) if f.monto_pagado is not None else ""),
    "metodo_pago":       ("Método Pago",    lambda f, l: f.metodo_pago or ""),
    "fecha_pago":        ("Fecha Pago",     lambda f, l: f.fecha_pago.strftime("%d/%m/%Y") if f.fecha_pago else ""),
}
_FAC_DEFAULT_COLUMNS = ["numero", "fecha", "cliente_nombre", "empresa_nombre",
                        "sku", "descripcion", "cantidad", "precio_unit", "total_neto", "margen"]
```

New `exportar_excel`:

```python
@router.get("/export/excel")
def exportar_excel(
    estado: list[str] | None = Query(None),
    cliente_id: int | None = Query(None),
    empresa_id: int | None = Query(None),
    vendedor_id: int | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    monto_min: Decimal | None = Query(None),
    monto_max: Decimal | None = Query(None),
    producto_id: list[int] | None = Query(None),
    columns: list[str] | None = Query(None),
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    q = (
        db.query(Factura)
        .options(
            joinedload(Factura.cliente),
            joinedload(Factura.vendedor),
            joinedload(Factura.empresa),
            selectinload(Factura.lineas),
        )
    )
    if estado:
        q = q.filter(Factura.estado.in_(estado))
    if cliente_id:
        q = q.filter(Factura.cliente_id == cliente_id)
    if empresa_id:
        q = q.filter(Factura.empresa_id == empresa_id)
    if vendedor_id:
        q = q.filter(Factura.vendedor_id == vendedor_id)
    if fecha_desde:
        q = q.filter(Factura.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Factura.fecha <= fecha_hasta)
    if monto_min is not None:
        q = q.filter(Factura.total >= monto_min)
    if monto_max is not None:
        q = q.filter(Factura.total <= monto_max)
    if producto_id:
        q = q.join(FacturaLinea, FacturaLinea.factura_id == Factura.id).filter(
            FacturaLinea.producto_id.in_(producto_id)
        ).distinct()
    facturas = q.order_by(Factura.numero.desc()).all()

    col_keys = [k for k in (columns or _FAC_DEFAULT_COLUMNS) if k in _FAC_EXPORT_COLUMNS]
    if not col_keys:
        col_keys = _FAC_DEFAULT_COLUMNS

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Facturas"
    ws.append([_FAC_EXPORT_COLUMNS[k][0] for k in col_keys])
    for f in facturas:
        for l in f.lineas:
            ws.append([_FAC_EXPORT_COLUMNS[k][1](f, l) for k in col_keys])

    today = date.today().strftime("%Y-%m-%d")
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=facturas-{today}.xlsx"},
    )
```

- [ ] **Step 4: Run tests**

```
cd backend && python -m pytest tests/test_export_flat.py -v
```
Expected: all pass.

- [ ] **Step 5: Run full test suite**

```
cd backend && python -m pytest -v --tb=short 2>&1 | tail -30
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/facturas.py backend/tests/test_export_flat.py
git commit -m "feat(facturas): add flat export endpoint with filters and columns[] param"
```

---

## Task 5: Frontend types + column definitions

**Files:**
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/lib/columnDefs.ts`

- [ ] **Step 1: Add types to `frontend/src/types/index.ts`**

After the `Factura` interface, add:

```typescript
export interface FacturaList {
  id: number
  numero: number
  cotizacion_id: number | null
  nv_id: number | null
  cliente_id: number | null
  vendedor_id: number | null
  empresa_id: number | null
  contacto: string | null
  fecha: string
  fecha_vencimiento: string | null
  estado: string
  correo: string | null
  total_neto: number
  total_iva: number
  total: number
  fecha_pago: string | null
  monto_pagado: number | null
  metodo_pago: string | null
  created_at: string
  updated_at: string
  cliente: { id: number; nombre: string; rut: string | null } | null
  vendedor: { id: number; name: string; email: string } | null
  empresa: EmpresaRef | null
  lineas: FacturaLinea[]
  margen_total: number | null
}

export interface FlatLine {
  numero: number
  fecha: string
  estado: string
  cliente_nombre: string
  empresa_nombre: string
  encargado: string
  contacto: string
  sku: string
  descripcion: string
  formato: string
  cantidad: number
  precio_unit: number
  total_neto: number
  margen: number | null
  // Facturas-only
  fecha_vencimiento: string
  monto_pagado: number | null
  metodo_pago: string
  fecha_pago: string
}

export interface ColDef {
  key: string
  label: string
  defaultVisible: boolean
  getValue: (row: FlatLine) => string | number
}
```

Also add `margen_total?: number | null` to the existing `Factura` interface.

- [ ] **Step 2: Create `frontend/src/lib/columnDefs.ts`**

```typescript
import type { ColDef, FlatLine } from '../types'

function fmtDate(s: string | null | undefined): string {
  if (!s) return ''
  return new Date(s + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return ''
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

function fmtPct(n: number | null): string {
  if (n == null) return ''
  return `${(n * 100).toFixed(1)}%`
}

const BASE_COLUMNS: ColDef[] = [
  { key: 'numero',         label: 'Nº',           defaultVisible: true,  getValue: (r: FlatLine) => r.numero },
  { key: 'fecha',          label: 'Fecha',         defaultVisible: true,  getValue: (r: FlatLine) => fmtDate(r.fecha) },
  { key: 'estado',         label: 'Estado',        defaultVisible: false, getValue: (r: FlatLine) => r.estado },
  { key: 'cliente_nombre', label: 'Cliente',       defaultVisible: true,  getValue: (r: FlatLine) => r.cliente_nombre },
  { key: 'empresa_nombre', label: 'Empresa',       defaultVisible: true,  getValue: (r: FlatLine) => r.empresa_nombre },
  { key: 'encargado',      label: 'Encargado',     defaultVisible: false, getValue: (r: FlatLine) => r.encargado },
  { key: 'contacto',       label: 'Contacto',      defaultVisible: false, getValue: (r: FlatLine) => r.contacto },
  { key: 'sku',            label: 'SKU',           defaultVisible: true,  getValue: (r: FlatLine) => r.sku },
  { key: 'descripcion',    label: 'Descripción',   defaultVisible: true,  getValue: (r: FlatLine) => r.descripcion },
  { key: 'formato',        label: 'Formato',       defaultVisible: false, getValue: (r: FlatLine) => r.formato },
  { key: 'cantidad',       label: 'Cantidad',      defaultVisible: true,  getValue: (r: FlatLine) => r.cantidad },
  { key: 'precio_unit',    label: 'Precio Unit.',  defaultVisible: true,  getValue: (r: FlatLine) => fmtMoney(r.precio_unit) },
  { key: 'total_neto',     label: 'Total Neto',    defaultVisible: true,  getValue: (r: FlatLine) => fmtMoney(r.total_neto) },
  { key: 'margen',         label: 'Margen %',      defaultVisible: true,  getValue: (r: FlatLine) => fmtPct(r.margen) },
]

export const COTIZACION_COLUMN_DEFS: ColDef[] = BASE_COLUMNS

export const FACTURA_COLUMN_DEFS: ColDef[] = [
  ...BASE_COLUMNS,
  { key: 'fecha_vencimiento', label: 'Vencimiento',  defaultVisible: false, getValue: (r: FlatLine) => fmtDate(r.fecha_vencimiento) },
  { key: 'monto_pagado',      label: 'Monto Pagado', defaultVisible: false, getValue: (r: FlatLine) => fmtMoney(r.monto_pagado) },
  { key: 'metodo_pago',       label: 'Método Pago',  defaultVisible: false, getValue: (r: FlatLine) => r.metodo_pago },
  { key: 'fecha_pago',        label: 'Fecha Pago',   defaultVisible: false, getValue: (r: FlatLine) => fmtDate(r.fecha_pago) },
]
```

- [ ] **Step 3: Type-check**

```
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/columnDefs.ts
git commit -m "feat: add FlatLine, ColDef types and column definitions for export preview"
```

---

## Task 6: `ExportPreviewPanel` shared component

**Files:**
- Create: `frontend/src/components/ExportPreviewPanel.tsx`

- [ ] **Step 1: Create `frontend/src/components/ExportPreviewPanel.tsx`**

```tsx
import { useState, useMemo } from 'react'
import { Download } from 'lucide-react'
import { api } from '../lib/api'
import type { FlatLine, ColDef } from '../types'

interface Props {
  lines: FlatLine[]
  availableColumns: ColDef[]
  isLoading: boolean
  exportBaseUrl: string
  storageKey: string
  filename: string
}

const PREVIEW_CAP = 200

export default function ExportPreviewPanel({
  lines, availableColumns, isLoading, exportBaseUrl, storageKey, filename,
}: Props) {
  const defaultKeys = useMemo(
    () => availableColumns.filter(c => c.defaultVisible).map(c => c.key),
    [availableColumns],
  )

  const [visibleKeys, setVisibleKeys] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        const valid = new Set(availableColumns.map(c => c.key))
        const filtered = parsed.filter(k => valid.has(k))
        if (filtered.length > 0) return filtered
      }
    } catch {}
    return defaultKeys
  })

  function toggleKey(key: string) {
    setVisibleKeys(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      localStorage.setItem(storageKey, JSON.stringify(next))
      return next
    })
  }

  const visibleCols = availableColumns.filter(c => visibleKeys.includes(c.key))
  const displayRows = lines.slice(0, PREVIEW_CAP)

  const docCount = useMemo(() => new Set(lines.map(l => l.numero)).size, [lines])
  const totalNeto = useMemo(() => lines.reduce((s, l) => s + l.total_neto, 0), [lines])
  const margenProm = useMemo(() => {
    const withMargen = lines.filter(l => l.margen != null)
    const base = withMargen.reduce((s, l) => s + l.total_neto, 0)
    if (!base) return null
    return withMargen.reduce((s, l) => s + l.total_neto * l.margen!, 0) / base
  }, [lines])

  async function handleExport() {
    const colParams = visibleKeys.map(k => `columns=${encodeURIComponent(k)}`).join('&')
    const sep = exportBaseUrl.includes('?') ? '&' : '?'
    const url = `${exportBaseUrl}${sep}${colParams}`
    const resp = await api.get(url, { responseType: 'blob' })
    const blob = new Blob([resp.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Documentos', value: String(docCount) },
          { label: 'Líneas',     value: String(lines.length) },
          { label: 'Total neto', value: `$ ${Math.round(totalNeto).toLocaleString('es-CL')}` },
          { label: 'Margen prom.', value: margenProm != null ? `${(margenProm * 100).toFixed(1)}%` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white font-num">{value}</div>
          </div>
        ))}
      </div>

      {/* Column picker */}
      <div className="flex flex-wrap gap-1.5">
        {availableColumns.map(col => {
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

      {/* Table */}
      {isLoading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Cargando...</div>
      ) : lines.length === 0 ? (
        <div className="text-gray-400 text-sm py-8 text-center">Sin líneas</div>
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

      {/* Footer + export */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-gray-400">
          {lines.length > PREVIEW_CAP
            ? `Mostrando ${PREVIEW_CAP} de ${lines.length} líneas — exporta todas`
            : `${lines.length} línea${lines.length !== 1 ? 's' : ''}`}
        </span>
        <button onClick={handleExport}
          disabled={visibleKeys.length === 0 || lines.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
          <Download size={15} />
          Exportar Excel
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ExportPreviewPanel.tsx
git commit -m "feat: add ExportPreviewPanel shared component"
```

---

## Task 7: Cotizaciones page — split layout + ExportPreviewPanel

**Files:**
- Modify: `frontend/src/pages/Cotizaciones.tsx`

- [ ] **Step 1: Add imports and new state to Cotizaciones.tsx**

At the top of the file, update the import line from `'react'`:

```typescript
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
```

Remove the `Download` icon from lucide-react imports (it moves to ExportPreviewPanel). Change the lucide import line to:

```typescript
import { Plus, FileText, Mail, Trash2, Eye, ChevronDown, X } from 'lucide-react'
```

Add new imports after the existing imports:

```typescript
import ExportPreviewPanel from '../components/ExportPreviewPanel'
import { COTIZACION_COLUMN_DEFS } from '../lib/columnDefs'
import type { FlatLine } from '../types'
```

Inside the component function, add after existing state declarations:

```typescript
const [activeTab, setActiveTab] = useState<'list' | 'preview'>('list')
```

- [ ] **Step 2: Add `flatLines` and `exportBaseUrl` memos**

Add after the existing `useQuery` hook (near where `cotizaciones` is defined):

```typescript
const flatLines = useMemo<FlatLine[]>(() =>
  cotizaciones.flatMap(c =>
    (c.lineas ?? []).map(l => ({
      numero: c.numero,
      fecha: c.fecha,
      estado: c.estado,
      cliente_nombre: c.cliente?.nombre ?? '',
      empresa_nombre: c.empresa?.nombre ?? '',
      encargado: c.vendedor?.name ?? '',
      contacto: c.contacto ?? '',
      sku: l.sku ?? '',
      descripcion: l.descripcion,
      formato: l.formato ?? '',
      cantidad: l.cantidad,
      precio_unit: Number(l.valor_neto),
      total_neto: Number(l.total_neto),
      margen: l.margen ?? null,
      fecha_vencimiento: '',
      monto_pagado: null,
      metodo_pago: '',
      fecha_pago: '',
    }))
  ), [cotizaciones])

const exportBaseUrl = useMemo(() => {
  const params = new URLSearchParams()
  estados.forEach(e => params.append('estado', e))
  if (emisorId) params.append('vendedor_id', String(emisorId))
  if (empresaId) params.append('empresa_id', String(empresaId))
  if (fechaDesde) params.append('fecha_desde', fechaDesde)
  if (fechaHasta) params.append('fecha_hasta', fechaHasta)
  if (montoMin) params.append('monto_min', montoMin)
  if (montoMax) params.append('monto_max', montoMax)
  productos.forEach(p => params.append('producto_id', String(p.id)))
  const qs = params.toString()
  return `/api/cotizaciones/export/excel${qs ? '?' + qs : ''}`
}, [estados, emisorId, empresaId, fechaDesde, fechaHasta, montoMin, montoMax, productos])
```

- [ ] **Step 3: Remove the old `handleExport` function and the Export button from the header**

Delete the `handleExport` async function (it was the function using `api.get` with blob download).

In the JSX header section, remove the export button:
```tsx
// DELETE this entire button:
<button onClick={handleExport}
  className="flex items-center gap-1.5 px-3 py-2 text-sm border ...">
  <Download size={15} />
  <span className="hidden sm:inline">Exportar</span>
</button>
```

- [ ] **Step 4: Add the split layout and mobile tab toggle to the JSX**

Change the outer container from `max-w-7xl` to just `max-w-none` (or remove the max-w class entirely):

```tsx
<div className="p-4 md:p-6">
```

After the filter bar `</div>` (end of the `ref={filterBarRef}` div), add the mobile tab toggle:

```tsx
{/* Mobile tab toggle */}
<div className="lg:hidden flex gap-0 mb-4 border-b border-gray-200 dark:border-gray-800">
  {(['list', 'preview'] as const).map(tab => (
    <button key={tab} onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        activeTab === tab
          ? 'border-brand-500 text-brand-600 dark:text-brand-400'
          : 'border-transparent text-gray-500 dark:text-gray-400'
      }`}>
      {tab === 'list' ? 'Lista' : 'Vista previa'}
    </button>
  ))}
</div>
```

Wrap the existing `{/* Results */}` section and add the preview panel in a grid:

```tsx
{/* Split layout */}
<div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">

  {/* Left: list */}
  <div className={activeTab === 'list' ? '' : 'hidden lg:block'}>
    {/* --- paste existing Results JSX here (isLoading, empty state, mobile cards, desktop table) --- */}
  </div>

  {/* Right: preview panel */}
  <div className={activeTab === 'preview' ? '' : 'hidden lg:block'}>
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Vista previa exportación
      </h2>
      <ExportPreviewPanel
        lines={flatLines}
        availableColumns={COTIZACION_COLUMN_DEFS}
        isLoading={isLoading}
        exportBaseUrl={exportBaseUrl}
        storageKey="cotizaciones-preview-cols"
        filename={`cotizaciones-${new Date().toISOString().split('T')[0]}.xlsx`}
      />
    </div>
  </div>

</div>
```

- [ ] **Step 5: Type-check**

```
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Cotizaciones.tsx
git commit -m "feat(cotizaciones): add split layout with ExportPreviewPanel"
```

---

## Task 8: Facturas list page + router + sidebar

**Files:**
- Create: `frontend/src/pages/Facturas.tsx`
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create `frontend/src/pages/Facturas.tsx`**

This follows the same structure as Cotizaciones but uses `FacturaList`, `FACTURA_COLUMN_DEFS`, and includes payment-field filters.

```tsx
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Eye, ChevronDown, X } from 'lucide-react'
import { api } from '../lib/api'
import type { FacturaList, FlatLine } from '../types'
import ExportPreviewPanel from '../components/ExportPreviewPanel'
import { FACTURA_COLUMN_DEFS } from '../lib/columnDefs'

// ── Constants ──────────────────────────────────────────────────────────────────

const ESTADO_COLORS: Record<string, string> = {
  emitida: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  pagada:  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  parcial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  anulada: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })
}

function MargenBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-gray-400 text-xs">—</span>
  const pct = Math.round(value * 1000) / 10
  const color = pct < 15 ? 'text-red-600 dark:text-red-400'
    : pct < 25 ? 'text-orange-500 dark:text-orange-400'
    : 'text-green-600 dark:text-green-400'
  return <span className={`font-medium text-sm font-num ${color}`}>{pct.toFixed(1)}%</span>
}

// ── Filter Pill ────────────────────────────────────────────────────────────────

interface PillProps {
  label: string
  active: boolean
  summary?: string
  isOpen: boolean
  onToggle: () => void
  onClear: () => void
  children: React.ReactNode
  wide?: boolean
}

function FilterPill({ label, active, summary, isOpen, onToggle, onClear, children, wide }: PillProps) {
  return (
    <div className="relative">
      <div className={`flex items-center gap-1 rounded-full border text-sm transition-colors cursor-pointer
        ${active
          ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-400 dark:border-brand-600 text-brand-700 dark:text-brand-300'
          : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400'
        }`}>
        <button onClick={onToggle} className="flex items-center gap-1 pl-3 pr-1 py-1.5">
          <span className="font-medium">{label}</span>
          {summary && <span className="text-xs opacity-75">: {summary}</span>}
          <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {active && (
          <button onClick={e => { e.stopPropagation(); onClear() }}
            className="pr-2 pl-0.5 py-1.5 text-brand-500 hover:text-brand-700">
            <X size={13} />
          </button>
        )}
      </div>
      {isOpen && (
        <div className={`absolute top-full mt-1.5 z-30 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-2 ${wide ? 'w-72' : 'min-w-[180px]'}`}>
          {children}
        </div>
      )}
    </div>
  )
}

const checkboxCls = 'flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200'

// ── Page ───────────────────────────────────────────────────────────────────────

interface ProductoMin { id: number; nombre: string; sku: string | null }

export default function Facturas() {
  const navigate = useNavigate()

  // Filter state
  const [estados, setEstados] = useState<string[]>([])
  const [clienteId, setClienteId] = useState<number | null>(null)
  const [clienteNombre, setClienteNombre] = useState('')
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [empresaNombre, setEmpresaNombre] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [montoMin, setMontoMin] = useState('')
  const [montoMax, setMontoMax] = useState('')
  const [productos, setProductos] = useState<ProductoMin[]>([])
  const [productoSearch, setProductoSearch] = useState('')
  const [openPill, setOpenPill] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'list' | 'preview'>('list')
  const filterBarRef = useRef<HTMLDivElement>(null)

  // Outside-click closes pills
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterBarRef.current && !filterBarRef.current.contains(e.target as Node)) {
        setOpenPill(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const togglePill = useCallback((name: string) => {
    setOpenPill(prev => (prev === name ? null : name))
  }, [])

  // Queries
  const { data: empresas = [] } = useQuery<{ id: number; nombre: string }[]>({
    queryKey: ['empresas-min'],
    queryFn: () => api.get('/api/empresas/').then(r => r.data),
  })

  const { data: clientes = [] } = useQuery<{ id: number; nombre: string }[]>({
    queryKey: ['clientes-min'],
    queryFn: () => api.get('/api/clientes/').then(r => r.data),
  })

  const { data: productoResults = [] } = useQuery<ProductoMin[]>({
    queryKey: ['productos-search', productoSearch],
    queryFn: () => api.get('/api/productos/', { params: { search: productoSearch } }).then(r => r.data),
    enabled: productoSearch.length >= 1,
  })

  // Build list query params
  const listParams = useMemo(() => {
    const params = new URLSearchParams()
    estados.forEach(e => params.append('estado', e))
    if (clienteId) params.append('cliente_id', String(clienteId))
    if (empresaId) params.append('empresa_id', String(empresaId))
    if (fechaDesde) params.append('fecha_desde', fechaDesde)
    if (fechaHasta) params.append('fecha_hasta', fechaHasta)
    if (montoMin) params.append('monto_min', montoMin)
    if (montoMax) params.append('monto_max', montoMax)
    productos.forEach(p => params.append('producto_id', String(p.id)))
    return params.toString()
  }, [estados, clienteId, empresaId, fechaDesde, fechaHasta, montoMin, montoMax, productos])

  const { data: facturas = [], isLoading } = useQuery<FacturaList[]>({
    queryKey: ['facturas-list', listParams],
    queryFn: () => api.get(`/api/facturas/${listParams ? '?' + listParams : ''}`).then(r => r.data),
  })

  const exportBaseUrl = useMemo(() => {
    const qs = listParams
    return `/api/facturas/export/excel${qs ? '?' + qs : ''}`
  }, [listParams])

  const flatLines = useMemo<FlatLine[]>(() =>
    facturas.flatMap(f =>
      f.lineas.map(l => ({
        numero: f.numero,
        fecha: f.fecha,
        estado: f.estado,
        cliente_nombre: f.cliente?.nombre ?? '',
        empresa_nombre: f.empresa?.nombre ?? '',
        encargado: f.vendedor?.name ?? '',
        contacto: f.contacto ?? '',
        sku: l.sku ?? '',
        descripcion: l.descripcion,
        formato: l.formato ?? '',
        cantidad: l.cantidad,
        precio_unit: Number(l.valor_neto),
        total_neto: Number(l.total_neto),
        margen: l.margen ?? null,
        fecha_vencimiento: f.fecha_vencimiento ?? '',
        monto_pagado: f.monto_pagado ?? null,
        metodo_pago: f.metodo_pago ?? '',
        fecha_pago: f.fecha_pago ?? '',
      }))
    ), [facturas])

  const hasFilters = estados.length > 0 || !!clienteId || !!empresaId ||
    !!fechaDesde || !!fechaHasta || !!montoMin || !!montoMax || productos.length > 0

  function clearAll() {
    setEstados([]); setClienteId(null); setClienteNombre('')
    setEmpresaId(null); setEmpresaNombre(''); setFechaDesde(''); setFechaHasta('')
    setMontoMin(''); setMontoMax(''); setProductos([])
  }

  const fechaSummary = fechaDesde && fechaHasta
    ? `${fechaDesde} – ${fechaHasta}` : fechaDesde ? `desde ${fechaDesde}` : fechaHasta ? `hasta ${fechaHasta}` : ''

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-2">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Facturas</h1>
      </div>

      {/* Filter bar */}
      <div ref={filterBarRef} className="mb-4">
        <div className="flex flex-wrap gap-2 items-center">

          {/* Estado */}
          <FilterPill label="Estado" active={estados.length > 0}
            summary={estados.length === 1 ? estados[0] : estados.length > 1 ? `${estados.length} estados` : undefined}
            isOpen={openPill === 'estado'} onToggle={() => togglePill('estado')}
            onClear={() => setEstados([])}>
            {['emitida', 'pagada', 'parcial', 'anulada'].map(e => (
              <label key={e} className={checkboxCls}>
                <input type="checkbox" className="rounded border-gray-300"
                  checked={estados.includes(e)}
                  onChange={ev => setEstados(prev => ev.target.checked ? [...prev, e] : prev.filter(v => v !== e))} />
                {e.charAt(0).toUpperCase() + e.slice(1)}
              </label>
            ))}
          </FilterPill>

          {/* Empresa */}
          <FilterPill label="Empresa" active={!!empresaId} summary={empresaNombre}
            isOpen={openPill === 'empresa'} onToggle={() => togglePill('empresa')}
            onClear={() => { setEmpresaId(null); setEmpresaNombre('') }}>
            <div className="max-h-56 overflow-y-auto">
              {empresas.map(e => (
                <button key={e.id} onClick={() => { setEmpresaId(e.id); setEmpresaNombre(e.nombre); setOpenPill(null) }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors
                    ${empresaId === e.id ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-gray-800 dark:text-gray-200'}`}>
                  {e.nombre}
                </button>
              ))}
            </div>
          </FilterPill>

          {/* Cliente */}
          <FilterPill label="Cliente" active={!!clienteId} summary={clienteNombre}
            isOpen={openPill === 'cliente'} onToggle={() => togglePill('cliente')}
            onClear={() => { setClienteId(null); setClienteNombre('') }}>
            <div className="max-h-56 overflow-y-auto">
              {clientes.map(c => (
                <button key={c.id} onClick={() => { setClienteId(c.id); setClienteNombre(c.nombre); setOpenPill(null) }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors
                    ${clienteId === c.id ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-gray-800 dark:text-gray-200'}`}>
                  {c.nombre}
                </button>
              ))}
            </div>
          </FilterPill>

          {/* Fechas */}
          <FilterPill label="Fechas" active={!!(fechaDesde || fechaHasta)} summary={fechaSummary}
            isOpen={openPill === 'fechas'} onToggle={() => togglePill('fechas')}
            onClear={() => { setFechaDesde(''); setFechaHasta('') }} wide>
            <div className="flex flex-col gap-2 p-1">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Desde</label>
                <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                  className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Hasta</label>
                <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                  className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200" />
              </div>
            </div>
          </FilterPill>

          {/* Monto */}
          <FilterPill label="Monto" active={!!(montoMin || montoMax)}
            summary={montoMin && montoMax ? `${montoMin}–${montoMax}` : montoMin ? `≥ ${montoMin}` : montoMax ? `≤ ${montoMax}` : ''}
            isOpen={openPill === 'monto'} onToggle={() => togglePill('monto')}
            onClear={() => { setMontoMin(''); setMontoMax('') }} wide>
            <div className="flex flex-col gap-2 p-1">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Mínimo</label>
                <input type="number" value={montoMin} onChange={e => setMontoMin(e.target.value)} placeholder="0"
                  className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Máximo</label>
                <input type="number" value={montoMax} onChange={e => setMontoMax(e.target.value)} placeholder="∞"
                  className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200" />
              </div>
            </div>
          </FilterPill>

          {/* Productos */}
          <FilterPill label="Productos" active={productos.length > 0}
            summary={productos.length === 1 ? (productos[0].sku ?? productos[0].nombre) : productos.length > 1 ? `${productos.length} productos` : ''}
            isOpen={openPill === 'productos'} onToggle={() => togglePill('productos')}
            onClear={() => setProductos([])} wide>
            <div className="p-1 flex flex-col gap-1">
              <input type="text" placeholder="Buscar producto..." value={productoSearch}
                onChange={e => setProductoSearch(e.target.value)}
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 mb-1 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200" />
              {productos.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {productos.map(p => (
                    <span key={p.id} className="flex items-center gap-1 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded-full px-2 py-0.5 text-xs">
                      {p.sku ?? p.nombre}
                      <button onClick={() => setProductos(prev => prev.filter(x => x.id !== p.id))}><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
              {productoSearch.length >= 1 && (
                <div className="max-h-40 overflow-y-auto">
                  {productoResults.filter(r => !productos.some(p => p.id === r.id)).map(r => (
                    <button key={r.id} onClick={() => setProductos(prev => [...prev, r])}
                      className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 rounded text-gray-800 dark:text-gray-200">
                      {r.sku && <span className="font-mono text-xs text-gray-400 mr-2">{r.sku}</span>}
                      {r.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </FilterPill>

          {hasFilters && (
            <button onClick={clearAll}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-1 underline underline-offset-2 flex-shrink-0">
              Limpiar todo
            </button>
          )}
        </div>
      </div>

      {/* Mobile tab toggle */}
      <div className="lg:hidden flex gap-0 mb-4 border-b border-gray-200 dark:border-gray-800">
        {(['list', 'preview'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-gray-500 dark:text-gray-400'
            }`}>
            {tab === 'list' ? 'Lista' : 'Vista previa'}
          </button>
        ))}
      </div>

      {/* Split layout */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">

        {/* Left: list */}
        <div className={activeTab === 'list' ? '' : 'hidden lg:block'}>
          {isLoading ? (
            <div className="text-gray-400 py-12 text-center text-sm">Cargando...</div>
          ) : facturas.length === 0 ? (
            <div className="text-gray-400 py-12 text-center text-sm">Sin facturas</div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {facturas.map(f => (
                  <div key={f.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-num">FAC-{String(f.numero).padStart(5, '0')}</span>
                        <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight mt-0.5">{f.cliente?.nombre ?? '—'}</p>
                        {f.empresa?.nombre && <p className="text-xs text-gray-400 leading-tight">{f.empresa.nombre}</p>}
                      </div>
                      <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[f.estado] ?? ''}`}>
                        {f.estado}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{fmtDate(f.fecha)}</span>
                      <div className="flex items-center gap-3">
                        <MargenBadge value={f.margen_total} />
                        <span className="font-semibold text-gray-900 dark:text-white text-sm font-num">{fmtMoney(f.total)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                      <button onClick={() => navigate(`/facturas/${f.id}`)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                        <Eye size={14} /> Ver
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                    <tr>
                      {['Nº', 'Fecha', 'Cliente / Empresa', 'Total', 'Margen', 'Estado', 'Acciones'].map(h => (
                        <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {facturas.map(f => (
                      <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white font-num">
                          FAC-{String(f.numero).padStart(5, '0')}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(f.fecha)}</td>
                        <td className="px-4 py-3">
                          <div className="text-gray-900 dark:text-white leading-tight">{f.cliente?.nombre ?? '—'}</div>
                          {f.empresa?.nombre && <div className="text-xs text-gray-400 leading-tight">{f.empresa.nombre}</div>}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap font-num">{fmtMoney(f.total)}</td>
                        <td className="px-4 py-3"><MargenBadge value={f.margen_total} /></td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[f.estado] ?? ''}`}>
                            {f.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => navigate(`/facturas/${f.id}`)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Ver">
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Right: preview */}
        <div className={activeTab === 'preview' ? '' : 'hidden lg:block'}>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Vista previa exportación
            </h2>
            <ExportPreviewPanel
              lines={flatLines}
              availableColumns={FACTURA_COLUMN_DEFS}
              isLoading={isLoading}
              exportBaseUrl={exportBaseUrl}
              storageKey="facturas-preview-cols"
              filename={`facturas-${new Date().toISOString().split('T')[0]}.xlsx`}
            />
          </div>
        </div>

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add `/facturas` route to `frontend/src/router.tsx`**

Add the import at the top:

```typescript
import Facturas from './pages/Facturas'
```

Add the route before `facturas/nueva`:

```typescript
{ path: 'facturas', element: <Facturas /> },
{ path: 'facturas/nueva', element: <FacturaDetalle /> },
{ path: 'facturas/:id', element: <FacturaDetalle /> },
```

- [ ] **Step 3: Add Facturas to Sidebar Cobranza group**

In `frontend/src/components/layout/Sidebar.tsx`, update the Cobranza children array. Find the existing Cobranza group and add the Facturas entry:

```typescript
{
  icon: Banknote, label: 'Cobranza',
  children: [
    { to: '/cobranza',       icon: Banknote,    label: 'Cobranza' },
    { to: '/facturas',       icon: FileText,    label: 'Facturas',         module: 'facturas' },
    { to: '/notas-credito',  icon: FileText,    label: 'Notas de Crédito' },
    { to: '/notas-debito',   icon: FileText,    label: 'Notas de Débito' },
    { to: '/pagos',          icon: CreditCard,  label: 'Pagos' },
  ],
},
```

Also update the `openGroups` initial state to include `/facturas` in the Cobranza detection:

```typescript
Cobranza: ['/cobranza', '/facturas', '/notas-credito', '/notas-debito', '/pagos'].some(p => location.pathname.startsWith(p)),
```

- [ ] **Step 4: Type-check**

```
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Facturas.tsx frontend/src/router.tsx frontend/src/components/layout/Sidebar.tsx
git commit -m "feat(facturas): add Facturas list page with split layout and filter pills"
```

---

## Self-Review

**Spec coverage:**
- ✅ Split layout (side-by-side desktop, tab toggle mobile) — Tasks 7 & 8
- ✅ Summary bar (Documentos, Líneas, Total neto, Margen prom.) — Task 6
- ✅ Column picker with localStorage persistence — Task 6
- ✅ Flat table (1 row per line, 200 row cap) — Task 6
- ✅ Export button downloads flat Excel matching visible columns — Tasks 3, 4, 6
- ✅ Cotizaciones: existing filters + split layout — Task 7
- ✅ Facturas: new filters + selectinload + split layout — Tasks 1, 2, 8
- ✅ `margen_total` on Factura model + schema — Task 1
- ✅ `columns[]` param on both export endpoints — Tasks 3 & 4
- ✅ Column keys consistent between frontend ColDef.key and backend handler keys — Tasks 3–5
- ✅ Sidebar entry for /facturas — Task 8
- ✅ Mobile fallback tab toggle — Tasks 7 & 8

**Type consistency check:**
- `FlatLine` defined in Task 5, used in Tasks 6, 7, 8 — all use same interface
- `ColDef.getValue(row: FlatLine)` — consistent in Task 5 and consumed in Task 6
- `COTIZACION_COLUMN_DEFS` / `FACTURA_COLUMN_DEFS` exported from `columnDefs.ts` — imported by Tasks 7 & 8
- `ExportPreviewPanel` props `lines`, `availableColumns`, `isLoading`, `exportBaseUrl`, `storageKey`, `filename` — defined in Task 6, all wired in Tasks 7 & 8
- `FacturaList` (not `Factura`) used in Task 8 — `lineas: FacturaLinea[]` required, matching what backend now returns
- Backend column dict keys (`numero`, `fecha`, `cliente_nombre`, etc.) match frontend `ColDef.key` values exactly
