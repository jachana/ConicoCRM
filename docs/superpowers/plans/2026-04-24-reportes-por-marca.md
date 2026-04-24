# Reportes por Marca Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Por Marca" tab to Reportes with multi-client filter, metrics grouped by marca and marca+cliente, plus Excel and CSV export.

**Architecture:** New FastAPI endpoint `/api/reportes/por-marca` aggregates `FacturaLinea` rows joined to `Producto.marca`. Two grouping views (por_marca, por_marca_cliente) + a `sin_marca` bucket for lines whose producto has no marca. Export endpoints (`/export/excel`, `/export/csv`) reuse the same aggregation helper. Frontend adds a new tab in `Reportes.tsx` that calls the endpoint, renders KPIs + sub-tabs + export buttons, and includes a cliente multi-select picker.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Pydantic, openpyxl, Python stdlib `csv`, React 18, TypeScript, Tailwind, Recharts, Axios (via `lib/api`).

---

## File Structure

**Backend**
- Modify: `backend/app/api/reportes.py` — add endpoint + data helper + excel export + csv export
- Modify: `backend/tests/test_reportes.py` — add tests for new endpoint
- Create: `backend/tests/test_reportes_por_marca.py` — focused tests for marca aggregation, sin_marca bucket, multi-cliente filter, exports

**Frontend**
- Modify: `frontend/src/types/index.ts` — add `ReportesPorMarca` interface
- Modify: `frontend/src/pages/Reportes.tsx` — add `MarcaTab` component, extend `Tab` type, add CSV to `exportFile`, extend `ExportButtons` (optional csv prop)
- Create: `frontend/src/components/ClienteMultiSelect.tsx` — shared multi-select chips for cliente filter

---

## Conventions

- Dates: ISO `YYYY-MM-DD`. Validate with existing `_validate_dates`.
- Money: Python `Decimal` internal, `float` in JSON. Round `margen_pct` to 2 decimals.
- Facturas filter: `Factura.estado != "anulada"` (matches existing reportes).
- Vendedor role scoping: if `current_user.role == "vendedor"` filter `Factura.vendedor_id == current_user.id` (matches existing reportes).
- Multi-valued query param: `cliente_id: list[int] | None = Query(None)` — FastAPI accepts repeated params `?cliente_id=1&cliente_id=2`.
- Commit message format follows recent history (`feat: ...`, `fix: ...`, `test: ...`).
- Tests use `client` and `admin_token` fixtures already defined in `backend/tests/conftest.py`.

---

### Task 1: Scaffold por-marca endpoint with empty data shape

**Files:**
- Modify: `backend/app/api/reportes.py` (append after `reporte_margenes` ~line 601, before `# GET /dte` section)
- Test: `backend/tests/test_reportes_por_marca.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_reportes_por_marca.py`:

```python
"""Tests for /api/reportes/por-marca endpoint."""


def test_por_marca_returns_valid_structure(client, admin_token):
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2026-01-01", "date_to": "2026-04-30"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "kpis" in data
    assert "por_marca" in data
    assert "por_marca_cliente" in data
    assert "sin_marca" in data
    kpis = data["kpis"]
    for k in (
        "total_neto",
        "total_bruto",
        "ganancia_total",
        "margen_promedio_pct",
        "num_facturas",
        "num_marcas",
        "ticket_promedio",
        "cantidad_total",
    ):
        assert k in kpis, f"kpi {k} missing"


def test_por_marca_date_validation(client, admin_token):
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2026-04-30", "date_to": "2026-01-01"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


def test_por_marca_requires_auth(client):
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2026-01-01", "date_to": "2026-04-30"},
    )
    assert r.status_code == 401


def test_por_marca_empty_period_returns_zeros(client, admin_token):
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2000-01-01", "date_to": "2000-12-31"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["kpis"]["total_neto"] == 0
    assert data["kpis"]["num_facturas"] == 0
    assert data["por_marca"] == []
    assert data["por_marca_cliente"] == []
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd C:/Otros/Conico/backend && pytest tests/test_reportes_por_marca.py -v`
Expected: FAIL with 404 (endpoint does not exist yet).

- [ ] **Step 3: Add the endpoint scaffold**

In `backend/app/api/reportes.py`, directly after the `reporte_margenes` function (around line 601, before the `# GET /dte` comment block), insert:

```python
# ---------------------------------------------------------------------------
# GET /por-marca
# ---------------------------------------------------------------------------

def _get_por_marca(
    date_from: date,
    date_to: date,
    db: Session,
    vendedor_id: int | None,
    cliente_ids: list[int] | None,
    marca_ids: list[int] | None,
) -> dict:
    """Return por-marca aggregation dict. Used by both JSON endpoint and exports."""
    return {
        "kpis": {
            "total_neto": 0.0,
            "total_bruto": 0.0,
            "ganancia_total": 0.0,
            "margen_promedio_pct": 0.0,
            "num_facturas": 0,
            "num_marcas": 0,
            "ticket_promedio": 0.0,
            "cantidad_total": 0.0,
        },
        "por_marca": [],
        "por_marca_cliente": [],
        "sin_marca": {"cantidad": 0.0, "neto": 0.0, "ganancia": 0.0},
    }


@router.get("/por-marca")
def reporte_por_marca(
    date_from: date = Query(...),
    date_to: date = Query(...),
    cliente_id: list[int] | None = Query(None),
    marca_id: list[int] | None = Query(None),
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _validate_dates(date_from, date_to)
    current_user, db = perms
    vendedor_id = current_user.id if current_user.role == "vendedor" else None
    return _get_por_marca(date_from, date_to, db, vendedor_id, cliente_id, marca_id)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd C:/Otros/Conico/backend && pytest tests/test_reportes_por_marca.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/reportes.py backend/tests/test_reportes_por_marca.py
git commit -m "feat(reportes): scaffold /por-marca endpoint"
```

---

### Task 2: Implement por-marca aggregation from facturas

**Files:**
- Modify: `backend/app/api/reportes.py` — replace `_get_por_marca` body with real aggregation
- Modify: `backend/tests/test_reportes_por_marca.py` — add aggregation tests

**Background (for the engineer):**
- Each `Factura` has `.lineas` (list of `FacturaLinea`).
- `FacturaLinea.producto_id` may be `None` (free-text line) — skip those entirely.
- `FacturaLinea.margen` is a `Decimal` fraction (e.g. `0.25` = 25%) and may be `None` — skip from ganancia/margen but still counts for cantidad and neto.
- `Producto.marca_id` may be `None` — route those lines to `sin_marca` bucket.
- Relationships to load with `joinedload`: `Factura.lineas`, `Factura.cliente`, `FacturaLinea.producto`, and `Producto.marca` via nested joinedload.

- [ ] **Step 1: Write failing tests for aggregation and filters**

Append to `backend/tests/test_reportes_por_marca.py`:

```python
from datetime import date
from decimal import Decimal

from app.models.cliente import Cliente
from app.models.empresa import Empresa
from app.models.factura import Factura, FacturaLinea
from app.models.marca import Marca
from app.models.producto import Producto


def _mk_fixture(db):
    """Create two marcas, two productos, two clientes, two facturas with mixed lines."""
    marca_a = Marca(nombre="MarcaA-TST")
    marca_b = Marca(nombre="MarcaB-TST")
    db.add_all([marca_a, marca_b])
    db.flush()

    emp = db.query(Empresa).first()
    if emp is None:
        emp = Empresa(nombre="Emp-TST", rut="76000000-K")
        db.add(emp)
        db.flush()

    cli_1 = Cliente(nombre="Cli1-TST", empresa_id=emp.id)
    cli_2 = Cliente(nombre="Cli2-TST", empresa_id=emp.id)
    db.add_all([cli_1, cli_2])
    db.flush()

    # producto con marca A
    prod_a = Producto(
        nombre="Prod-A-TST",
        sku="SKU-A-TST",
        precio_venta=Decimal("1000"),
        precio_costo=Decimal("600"),
        marca_id=marca_a.id,
    )
    # producto con marca B
    prod_b = Producto(
        nombre="Prod-B-TST",
        sku="SKU-B-TST",
        precio_venta=Decimal("2000"),
        precio_costo=Decimal("1200"),
        marca_id=marca_b.id,
    )
    # producto sin marca
    prod_nm = Producto(
        nombre="Prod-NM-TST",
        sku="SKU-NM-TST",
        precio_venta=Decimal("500"),
        precio_costo=Decimal("300"),
        marca_id=None,
    )
    db.add_all([prod_a, prod_b, prod_nm])
    db.flush()

    f1 = Factura(
        numero=900001,
        fecha=date(2026, 3, 15),
        cliente_id=cli_1.id,
        empresa_id=emp.id,
        estado="emitida",
        subtotal=Decimal("3500"),
        iva=Decimal("665"),
        total=Decimal("4165"),
    )
    db.add(f1)
    db.flush()
    db.add_all([
        FacturaLinea(
            factura_id=f1.id,
            producto_id=prod_a.id,
            descripcion="Prod-A-TST",
            cantidad=2,
            precio_unitario=Decimal("1000"),
            valor_neto=Decimal("2000"),
            margen=Decimal("0.40"),
        ),
        FacturaLinea(
            factura_id=f1.id,
            producto_id=prod_nm.id,
            descripcion="Prod-NM-TST",
            cantidad=3,
            precio_unitario=Decimal("500"),
            valor_neto=Decimal("1500"),
            margen=Decimal("0.20"),
        ),
    ])

    f2 = Factura(
        numero=900002,
        fecha=date(2026, 3, 16),
        cliente_id=cli_2.id,
        empresa_id=emp.id,
        estado="emitida",
        subtotal=Decimal("2000"),
        iva=Decimal("380"),
        total=Decimal("2380"),
    )
    db.add(f2)
    db.flush()
    db.add_all([
        FacturaLinea(
            factura_id=f2.id,
            producto_id=prod_b.id,
            descripcion="Prod-B-TST",
            cantidad=1,
            precio_unitario=Decimal("2000"),
            valor_neto=Decimal("2000"),
            margen=Decimal("0.30"),
        ),
    ])
    db.commit()
    return {
        "marca_a": marca_a,
        "marca_b": marca_b,
        "cli_1": cli_1,
        "cli_2": cli_2,
        "f1": f1,
        "f2": f2,
    }


def test_por_marca_aggregates_by_marca(client, admin_token, db_session):
    fx = _mk_fixture(db_session)
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2026-03-01", "date_to": "2026-03-31"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    por_marca = {m["nombre"]: m for m in data["por_marca"]}
    assert "MarcaA-TST" in por_marca
    assert "MarcaB-TST" in por_marca
    a = por_marca["MarcaA-TST"]
    assert a["cantidad"] == 2
    assert a["neto"] == 2000
    # ganancia = margen * neto = 0.40 * 2000
    assert a["ganancia"] == 800
    assert a["margen_pct"] == 40.0
    assert a["num_facturas"] == 1
    assert a["num_clientes"] == 1


def test_por_marca_sin_marca_bucket(client, admin_token, db_session):
    _mk_fixture(db_session)
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2026-03-01", "date_to": "2026-03-31"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    data = r.json()
    sm = data["sin_marca"]
    assert sm["cantidad"] == 3
    assert sm["neto"] == 1500
    assert sm["ganancia"] == 300  # 0.20 * 1500


def test_por_marca_cliente_combo(client, admin_token, db_session):
    fx = _mk_fixture(db_session)
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2026-03-01", "date_to": "2026-03-31"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    data = r.json()
    pairs = {(row["marca_nombre"], row["cliente_id"]) for row in data["por_marca_cliente"]}
    assert ("MarcaA-TST", fx["cli_1"].id) in pairs
    assert ("MarcaB-TST", fx["cli_2"].id) in pairs


def test_por_marca_filters_by_cliente(client, admin_token, db_session):
    fx = _mk_fixture(db_session)
    r = client.get(
        "/api/reportes/por-marca",
        params={
            "date_from": "2026-03-01",
            "date_to": "2026-03-31",
            "cliente_id": fx["cli_1"].id,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    data = r.json()
    marcas = {m["nombre"] for m in data["por_marca"]}
    assert "MarcaA-TST" in marcas
    assert "MarcaB-TST" not in marcas  # cliente 2 excluded


def test_por_marca_filters_by_marca(client, admin_token, db_session):
    fx = _mk_fixture(db_session)
    r = client.get(
        "/api/reportes/por-marca",
        params={
            "date_from": "2026-03-01",
            "date_to": "2026-03-31",
            "marca_id": fx["marca_a"].id,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    data = r.json()
    marcas = {m["nombre"] for m in data["por_marca"]}
    assert marcas == {"MarcaA-TST"}
```

Also confirm `db_session` fixture exists in `backend/tests/conftest.py`. If it's named differently (e.g. `db`), use that name everywhere in this file.

- [ ] **Step 2: Verify which db fixture name is correct**

Run: `cd C:/Otros/Conico/backend && grep -n "def db" tests/conftest.py | head`
Expected: a fixture that yields a SQLAlchemy session. Adjust the `db_session` parameter name in the tests above to match (e.g. `db`). If the fixture does not exist, add one or use the `client.app.dependency_overrides` mechanism; check how existing tests handle DB setup and adopt the same approach.

- [ ] **Step 3: Run tests to confirm failures**

Run: `cd C:/Otros/Conico/backend && pytest tests/test_reportes_por_marca.py -v`
Expected: new aggregation tests FAIL (empty arrays returned). Structure tests still PASS.

- [ ] **Step 4: Implement aggregation in `_get_por_marca`**

Replace the body of `_get_por_marca` in `backend/app/api/reportes.py`:

```python
def _get_por_marca(
    date_from: date,
    date_to: date,
    db: Session,
    vendedor_id: int | None,
    cliente_ids: list[int] | None,
    marca_ids: list[int] | None,
) -> dict:
    """Return por-marca aggregation dict. Used by both JSON endpoint and exports."""
    base_q = (
        db.query(Factura)
        .options(
            joinedload(Factura.cliente),
            joinedload(Factura.lineas)
            .joinedload(FacturaLinea.producto)
            .joinedload(Producto.marca),
        )
        .filter(
            Factura.fecha >= date_from,
            Factura.fecha <= date_to,
            Factura.estado != "anulada",
        )
    )
    if vendedor_id is not None:
        base_q = base_q.filter(Factura.vendedor_id == vendedor_id)
    if cliente_ids:
        base_q = base_q.filter(Factura.cliente_id.in_(cliente_ids))
    facturas: list[Factura] = base_q.all()

    marca_map: dict[int, dict] = {}
    marca_cliente_map: dict[tuple[int, int], dict] = {}
    sin_marca = {"cantidad": _ZERO, "neto": _ZERO, "ganancia": _ZERO}
    facturas_con_data: set[int] = set()
    total_neto = _ZERO
    total_bruto = _ZERO
    ganancia_total = _ZERO
    cantidad_total = _ZERO

    for f in facturas:
        cliente_nombre = f.cliente.nombre if f.cliente else ""
        for ln in f.lineas:
            if ln.producto_id is None or ln.producto is None:
                continue
            qty = Decimal(str(ln.cantidad))
            neto = ln.valor_neto or _ZERO
            ganancia = (ln.margen * neto) if ln.margen is not None else _ZERO
            marca_id_val = ln.producto.marca_id

            if marca_id_val is None:
                sin_marca["cantidad"] += qty
                sin_marca["neto"] += neto
                sin_marca["ganancia"] += ganancia
                continue

            # Apply marca filter after sin_marca logic
            if marca_ids and marca_id_val not in marca_ids:
                continue

            facturas_con_data.add(f.id)
            total_neto += neto
            total_bruto += neto  # placeholder — bruto = neto * 1.19 computed at end
            ganancia_total += ganancia
            cantidad_total += qty

            marca_nombre = ln.producto.marca.nombre if ln.producto.marca else ""
            entry = marca_map.setdefault(
                marca_id_val,
                {
                    "marca_id": marca_id_val,
                    "nombre": marca_nombre,
                    "cantidad": _ZERO,
                    "neto": _ZERO,
                    "ganancia": _ZERO,
                    "facturas": set(),
                    "clientes": set(),
                },
            )
            entry["cantidad"] += qty
            entry["neto"] += neto
            entry["ganancia"] += ganancia
            entry["facturas"].add(f.id)
            if f.cliente_id is not None:
                entry["clientes"].add(f.cliente_id)

            if f.cliente_id is not None:
                mc_key = (marca_id_val, f.cliente_id)
                mc_entry = marca_cliente_map.setdefault(
                    mc_key,
                    {
                        "marca_id": marca_id_val,
                        "marca_nombre": marca_nombre,
                        "cliente_id": f.cliente_id,
                        "cliente_nombre": cliente_nombre,
                        "cantidad": _ZERO,
                        "neto": _ZERO,
                        "ganancia": _ZERO,
                        "facturas": set(),
                    },
                )
                mc_entry["cantidad"] += qty
                mc_entry["neto"] += neto
                mc_entry["ganancia"] += ganancia
                mc_entry["facturas"].add(f.id)

    total_bruto = total_neto * Decimal("1.19")

    por_marca: list[dict] = []
    for e in marca_map.values():
        neto_m = e["neto"]
        margen_pct = float(e["ganancia"] / neto_m * 100) if neto_m > _ZERO else 0.0
        num_fact = len(e["facturas"])
        ticket = float(neto_m / num_fact) if num_fact else 0.0
        por_marca.append(
            {
                "marca_id": e["marca_id"],
                "nombre": e["nombre"],
                "cantidad": float(e["cantidad"]),
                "neto": float(neto_m),
                "ganancia": float(e["ganancia"]),
                "margen_pct": round(margen_pct, 2),
                "num_facturas": num_fact,
                "num_clientes": len(e["clientes"]),
                "ticket_promedio": round(ticket, 2),
            }
        )
    por_marca.sort(key=lambda r: r["neto"], reverse=True)

    por_marca_cliente: list[dict] = []
    for e in marca_cliente_map.values():
        neto_m = e["neto"]
        margen_pct = float(e["ganancia"] / neto_m * 100) if neto_m > _ZERO else 0.0
        por_marca_cliente.append(
            {
                "marca_id": e["marca_id"],
                "marca_nombre": e["marca_nombre"],
                "cliente_id": e["cliente_id"],
                "cliente_nombre": e["cliente_nombre"],
                "cantidad": float(e["cantidad"]),
                "neto": float(neto_m),
                "ganancia": float(e["ganancia"]),
                "margen_pct": round(margen_pct, 2),
                "num_facturas": len(e["facturas"]),
            }
        )
    por_marca_cliente.sort(key=lambda r: r["neto"], reverse=True)

    num_facturas = len(facturas_con_data)
    ticket_promedio = float(total_neto / num_facturas) if num_facturas else 0.0
    margen_promedio_pct = (
        float(ganancia_total / total_neto * 100) if total_neto > _ZERO else 0.0
    )

    return {
        "kpis": {
            "total_neto": float(total_neto),
            "total_bruto": float(total_bruto),
            "ganancia_total": float(ganancia_total),
            "margen_promedio_pct": round(margen_promedio_pct, 2),
            "num_facturas": num_facturas,
            "num_marcas": len(marca_map),
            "ticket_promedio": round(ticket_promedio, 2),
            "cantidad_total": float(cantidad_total),
        },
        "por_marca": por_marca,
        "por_marca_cliente": por_marca_cliente,
        "sin_marca": {
            "cantidad": float(sin_marca["cantidad"]),
            "neto": float(sin_marca["neto"]),
            "ganancia": float(sin_marca["ganancia"]),
        },
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd C:/Otros/Conico/backend && pytest tests/test_reportes_por_marca.py -v`
Expected: all tests PASS.

- [ ] **Step 6: Run full test suite to catch regressions**

Run: `cd C:/Otros/Conico/backend && pytest tests/test_reportes.py tests/test_reportes_por_marca.py -v`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/reportes.py backend/tests/test_reportes_por_marca.py
git commit -m "feat(reportes): aggregate facturas por marca and marca+cliente"
```

---

### Task 3: Excel export for por-marca

**Files:**
- Modify: `backend/app/api/reportes.py` — add `/por-marca/export/excel`
- Modify: `backend/tests/test_reportes_por_marca.py`

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_reportes_por_marca.py`:

```python
def test_por_marca_excel_export(client, admin_token):
    r = client.get(
        "/api/reportes/por-marca/export/excel",
        params={"date_from": "2026-01-01", "date_to": "2026-04-30"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert "por-marca" in r.headers["content-disposition"]
    assert len(r.content) > 0
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `cd C:/Otros/Conico/backend && pytest tests/test_reportes_por_marca.py::test_por_marca_excel_export -v`
Expected: FAIL with 404.

- [ ] **Step 3: Add export endpoint**

In `backend/app/api/reportes.py`, append right after the `@router.get("/por-marca")` function:

```python
@router.get("/por-marca/export/excel")
def exportar_por_marca_excel(
    date_from: date = Query(...),
    date_to: date = Query(...),
    cliente_id: list[int] | None = Query(None),
    marca_id: list[int] | None = Query(None),
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _validate_dates(date_from, date_to)
    current_user, db = perms
    vendedor_id = current_user.id if current_user.role == "vendedor" else None
    data = _get_por_marca(date_from, date_to, db, vendedor_id, cliente_id, marca_id)

    wb = openpyxl.Workbook()

    ws_k = wb.active
    ws_k.title = "KPIs"
    ws_k.append(["Métrica", "Valor"])
    for k, v in data["kpis"].items():
        ws_k.append([k, v])

    ws1 = wb.create_sheet("Por Marca")
    ws1.append([
        "Marca",
        "Cantidad",
        "Neto",
        "Ganancia",
        "Margen %",
        "Facturas",
        "Clientes",
        "Ticket Promedio",
    ])
    for row in data["por_marca"]:
        ws1.append([
            row["nombre"],
            row["cantidad"],
            row["neto"],
            row["ganancia"],
            row["margen_pct"],
            row["num_facturas"],
            row["num_clientes"],
            row["ticket_promedio"],
        ])

    ws2 = wb.create_sheet("Marca + Cliente")
    ws2.append([
        "Marca",
        "Cliente",
        "Cantidad",
        "Neto",
        "Ganancia",
        "Margen %",
        "Facturas",
    ])
    for row in data["por_marca_cliente"]:
        ws2.append([
            row["marca_nombre"],
            row["cliente_nombre"],
            row["cantidad"],
            row["neto"],
            row["ganancia"],
            row["margen_pct"],
            row["num_facturas"],
        ])

    ws3 = wb.create_sheet("Sin Marca")
    ws3.append(["Métrica", "Valor"])
    for k, v in data["sin_marca"].items():
        ws3.append([k, v])

    return _excel_response(wb, "por-marca", date_from, date_to)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd C:/Otros/Conico/backend && pytest tests/test_reportes_por_marca.py::test_por_marca_excel_export -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/reportes.py backend/tests/test_reportes_por_marca.py
git commit -m "feat(reportes): excel export for /por-marca"
```

---

### Task 4: CSV export for por-marca

**Files:**
- Modify: `backend/app/api/reportes.py`
- Modify: `backend/tests/test_reportes_por_marca.py`

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_reportes_por_marca.py`:

```python
def test_por_marca_csv_export(client, admin_token):
    r = client.get(
        "/api/reportes/por-marca/export/csv",
        params={"date_from": "2026-01-01", "date_to": "2026-04-30"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "por-marca" in r.headers["content-disposition"].lower()
    body = r.content.decode("utf-8-sig")
    # Should contain headers for all sections
    assert "## KPIs" in body
    assert "## Por Marca" in body
    assert "## Marca + Cliente" in body
    assert "## Sin Marca" in body
```

- [ ] **Step 2: Add csv import at top of file**

At the top of `backend/app/api/reportes.py`, add to the existing imports:

```python
import csv
```

(Place it alphabetically with the other stdlib imports near `from io import BytesIO`.)

- [ ] **Step 3: Add CSV export endpoint**

Directly after `exportar_por_marca_excel` in `backend/app/api/reportes.py`:

```python
@router.get("/por-marca/export/csv")
def exportar_por_marca_csv(
    date_from: date = Query(...),
    date_to: date = Query(...),
    cliente_id: list[int] | None = Query(None),
    marca_id: list[int] | None = Query(None),
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _validate_dates(date_from, date_to)
    current_user, db = perms
    vendedor_id = current_user.id if current_user.role == "vendedor" else None
    data = _get_por_marca(date_from, date_to, db, vendedor_id, cliente_id, marca_id)

    buf = io.StringIO()
    writer = csv.writer(buf)

    writer.writerow(["## KPIs"])
    writer.writerow(["metrica", "valor"])
    for k, v in data["kpis"].items():
        writer.writerow([k, v])
    writer.writerow([])

    writer.writerow(["## Por Marca"])
    writer.writerow([
        "marca", "cantidad", "neto", "ganancia",
        "margen_pct", "num_facturas", "num_clientes", "ticket_promedio",
    ])
    for row in data["por_marca"]:
        writer.writerow([
            row["nombre"], row["cantidad"], row["neto"], row["ganancia"],
            row["margen_pct"], row["num_facturas"], row["num_clientes"], row["ticket_promedio"],
        ])
    writer.writerow([])

    writer.writerow(["## Marca + Cliente"])
    writer.writerow([
        "marca", "cliente", "cantidad", "neto", "ganancia", "margen_pct", "num_facturas",
    ])
    for row in data["por_marca_cliente"]:
        writer.writerow([
            row["marca_nombre"], row["cliente_nombre"], row["cantidad"],
            row["neto"], row["ganancia"], row["margen_pct"], row["num_facturas"],
        ])
    writer.writerow([])

    writer.writerow(["## Sin Marca"])
    writer.writerow(["metrica", "valor"])
    for k, v in data["sin_marca"].items():
        writer.writerow([k, v])

    body = "﻿" + buf.getvalue()  # BOM so Excel opens UTF-8 cleanly
    filename = f"por-marca-{date_from}-{date_to}.csv"
    return StreamingResponse(
        iter([body]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
```

Also add `import io` at the top of the file if not already present (the file already imports `from io import BytesIO` — use `io.StringIO` instead of adding a new binding, or add `import io` alongside).

If `io` is not imported as a module, replace `io.StringIO()` with a direct import:

```python
from io import BytesIO, StringIO
```

and then use `StringIO()`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd C:/Otros/Conico/backend && pytest tests/test_reportes_por_marca.py::test_por_marca_csv_export -v`
Expected: PASS.

- [ ] **Step 5: Run the full reportes suite**

Run: `cd C:/Otros/Conico/backend && pytest tests/test_reportes.py tests/test_reportes_por_marca.py -v`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/reportes.py backend/tests/test_reportes_por_marca.py
git commit -m "feat(reportes): csv export for /por-marca"
```

---

### Task 5: Frontend types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add interface**

At the end of the `ReportesDte` block in `frontend/src/types/index.ts` (right after line ~666 where `ReportesDte` closes), add:

```typescript
export interface ReportesPorMarca {
  kpis: {
    total_neto: number
    total_bruto: number
    ganancia_total: number
    margen_promedio_pct: number
    num_facturas: number
    num_marcas: number
    ticket_promedio: number
    cantidad_total: number
  }
  por_marca: {
    marca_id: number
    nombre: string
    cantidad: number
    neto: number
    ganancia: number
    margen_pct: number
    num_facturas: number
    num_clientes: number
    ticket_promedio: number
  }[]
  por_marca_cliente: {
    marca_id: number
    marca_nombre: string
    cliente_id: number
    cliente_nombre: string
    cantidad: number
    neto: number
    ganancia: number
    margen_pct: number
    num_facturas: number
  }[]
  sin_marca: {
    cantidad: number
    neto: number
    ganancia: number
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd C:/Otros/Conico/frontend && npx tsc --noEmit`
Expected: no new errors (existing unrelated errors are acceptable but note them).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(reportes): add ReportesPorMarca type"
```

---

### Task 6: ClienteMultiSelect component

**Files:**
- Create: `frontend/src/components/ClienteMultiSelect.tsx`

- [ ] **Step 1: Inspect existing cliente endpoints**

Run: `cd C:/Otros/Conico/backend && grep -n "@router.get" app/api/clientes.py | head`
Confirm: `GET /api/clientes/?q=...` returns a list of `{id, nombre, ...}`. If the shape differs, adapt the fetch call below.

- [ ] **Step 2: Write the component**

Create `frontend/src/components/ClienteMultiSelect.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

interface ClienteOption {
  id: number
  nombre: string
}

interface Props {
  selected: number[]
  onChange: (ids: number[]) => void
}

export default function ClienteMultiSelect({ selected, onChange }: Props) {
  const [q, setQ] = useState('')
  const [options, setOptions] = useState<ClienteOption[]>([])
  const [open, setOpen] = useState(false)
  const [selectedDetails, setSelectedDetails] = useState<Record<number, string>>({})
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      api.get<ClienteOption[]>(`/api/clientes/?q=${encodeURIComponent(q)}`)
        .then(r => setOptions(r.data.slice(0, 30)))
        .catch(() => setOptions([]))
    }, 150)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    // Cache names of selected ids so chips keep showing after search changes
    const unknown = selected.filter(id => !(id in selectedDetails))
    if (unknown.length === 0) return
    Promise.all(unknown.map(id => api.get<ClienteOption>(`/api/clientes/${id}`).then(r => r.data).catch(() => null)))
      .then(arr => {
        const next = { ...selectedDetails }
        for (const c of arr) if (c) next[c.id] = c.nombre
        setSelectedDetails(next)
      })
  }, [selected, selectedDetails])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function toggle(id: number) {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id))
    else onChange([...selected, id])
  }

  return (
    <div ref={boxRef} className="relative min-w-[200px]">
      <div
        className="bg-gray-900 border border-white/[0.1] rounded-lg px-2 py-1.5 flex flex-wrap gap-1 cursor-text"
        onClick={() => setOpen(true)}
      >
        {selected.map(id => (
          <span
            key={id}
            className="bg-amber-400/15 text-amber-200 text-xs px-2 py-0.5 rounded-md flex items-center gap-1"
          >
            {selectedDetails[id] ?? `#${id}`}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(id) }}
              className="text-amber-200/70 hover:text-amber-100"
            >×</button>
          </span>
        ))}
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          placeholder={selected.length ? '' : 'Filtrar clientes...'}
          className="flex-1 min-w-[100px] bg-transparent text-gray-200 text-xs outline-none"
        />
      </div>
      {open && options.length > 0 && (
        <div className="absolute z-20 mt-1 left-0 right-0 bg-gray-900 border border-white/[0.1] rounded-lg max-h-64 overflow-auto shadow-lg">
          {options.map(o => {
            const isSel = selected.includes(o.id)
            return (
              <button
                type="button"
                key={o.id}
                onClick={() => toggle(o.id)}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-800 ${isSel ? 'text-amber-300' : 'text-gray-300'}`}
              >
                {isSel ? '✓ ' : ''}{o.nombre}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd C:/Otros/Conico/frontend && npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ClienteMultiSelect.tsx
git commit -m "feat(reportes): cliente multi-select component"
```

---

### Task 7: MarcaTab in Reportes page

**Files:**
- Modify: `frontend/src/pages/Reportes.tsx`

- [ ] **Step 1: Extend `Tab` type and `TABS` array**

In `frontend/src/pages/Reportes.tsx`, find lines 520-529 and replace them with:

```tsx
type Tab = 'ventas' | 'cobranza' | 'inventario' | 'compras' | 'margenes' | 'por_marca' | 'dte'

const TABS: { id: Tab; label: string }[] = [
  { id: 'ventas', label: 'Ventas' },
  { id: 'cobranza', label: 'Cobranza' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'compras', label: 'Compras' },
  { id: 'margenes', label: 'Márgenes' },
  { id: 'por_marca', label: 'Por Marca' },
  { id: 'dte', label: 'DTE' },
]
```

- [ ] **Step 2: Extend imports and `exportFile` to support CSV**

At the top of the file, update the types import (line 4-11) to include the new type:

```tsx
import type {
  ReportesVentas,
  ReportesCobranza,
  ReportesInventario,
  ReportesCompras,
  ReportesMargenes,
  ReportesDte,
  ReportesPorMarca,
} from '../types'
```

Add the ClienteMultiSelect import right below:

```tsx
import ClienteMultiSelect from '../components/ClienteMultiSelect'
```

Replace the `exportFile` function (lines 40-52) with a version that supports CSV and extra params:

```tsx
async function exportFile(
  tab: string,
  format: 'excel' | 'pdf' | 'csv',
  dateFrom: string,
  dateTo: string,
  extraQuery = '',
) {
  const extMap = { excel: 'xlsx', pdf: 'pdf', csv: 'csv' }
  const ext = extMap[format]
  const url = `/api/reportes/${tab}/export/${format}?date_from=${dateFrom}&date_to=${dateTo}${extraQuery}`
  const response = await api.get(url, { responseType: 'blob' })
  const blobUrl = URL.createObjectURL(new Blob([response.data]))
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = `${tab}-${dateFrom}-${dateTo}.${ext}`
  a.click()
  URL.revokeObjectURL(blobUrl)
}
```

- [ ] **Step 3: Render `MarcaTab`**

Insert the new tab component near the other tab components (e.g. right after `MargenesTab`). Add after the `MargenesTab` closing brace:

```tsx
function MarcaTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [clienteIds, setClienteIds] = useState<number[]>([])
  const [data, setData] = useState<ReportesPorMarca | null>(null)
  const [loading, setLoading] = useState(true)
  const [subtab, setSubtab] = useState<'marca' | 'marca_cliente'>('marca')

  const extraQuery = clienteIds.map(id => `&cliente_id=${id}`).join('')

  useEffect(() => {
    setLoading(true)
    api.get<ReportesPorMarca>(
      `/api/reportes/por-marca?date_from=${dateFrom}&date_to=${dateTo}${extraQuery}`
    )
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo, extraQuery])

  if (loading) return <div className="text-gray-500 text-sm py-8 text-center">Cargando...</div>
  if (!data) return <div className="text-red-400 text-sm py-8 text-center">Error al cargar datos</div>

  const fmt = (n: number) => `$${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500">Clientes:</span>
        <ClienteMultiSelect selected={clienteIds} onChange={setClienteIds} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Neto total" value={fmt(data.kpis.total_neto)} />
        <KpiCard label="Ganancia total" value={fmt(data.kpis.ganancia_total)} />
        <KpiCard label="Margen promedio" value={`${data.kpis.margen_promedio_pct.toFixed(1)}%`} />
        <KpiCard label="Facturas" value={data.kpis.num_facturas} />
        <KpiCard label="Marcas" value={data.kpis.num_marcas} />
        <KpiCard label="Ticket promedio" value={fmt(data.kpis.ticket_promedio)} />
        <KpiCard label="Cantidad total" value={data.kpis.cantidad_total.toLocaleString('es-CL')} />
        <KpiCard label="Bruto total" value={fmt(data.kpis.total_bruto)} />
      </div>

      <div className="flex gap-1 border-b border-white/[0.06] mb-3">
        {(['marca', 'marca_cliente'] as const).map(t => (
          <button
            key={t}
            onClick={() => setSubtab(t)}
            className={`px-3 py-1.5 text-xs font-medium ${
              subtab === t
                ? 'border-b-2 border-amber-400 text-amber-400'
                : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent'
            }`}
          >
            {t === 'marca' ? 'Por Marca' : 'Marca + Cliente'}
          </button>
        ))}
      </div>

      {subtab === 'marca' && (
        <SectionCard>
          <table className="w-full text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="text-left py-1.5">Marca</th>
                <th className="text-right">Cantidad</th>
                <th className="text-right">Neto</th>
                <th className="text-right">Ganancia</th>
                <th className="text-right">Margen %</th>
                <th className="text-right">Facturas</th>
                <th className="text-right">Clientes</th>
                <th className="text-right">Ticket prom.</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {data.por_marca.map(m => (
                <tr key={m.marca_id} className="border-t border-white/[0.04]">
                  <td className="py-1.5">{m.nombre}</td>
                  <td className="text-right">{m.cantidad.toLocaleString('es-CL')}</td>
                  <td className="text-right">{fmt(m.neto)}</td>
                  <td className="text-right">{fmt(m.ganancia)}</td>
                  <td className="text-right">{m.margen_pct.toFixed(1)}%</td>
                  <td className="text-right">{m.num_facturas}</td>
                  <td className="text-right">{m.num_clientes}</td>
                  <td className="text-right">{fmt(m.ticket_promedio)}</td>
                </tr>
              ))}
              {data.sin_marca.neto > 0 && (
                <tr className="border-t border-white/[0.04] text-gray-500 italic">
                  <td className="py-1.5">(Sin marca)</td>
                  <td className="text-right">{data.sin_marca.cantidad.toLocaleString('es-CL')}</td>
                  <td className="text-right">{fmt(data.sin_marca.neto)}</td>
                  <td className="text-right">{fmt(data.sin_marca.ganancia)}</td>
                  <td className="text-right">—</td>
                  <td className="text-right">—</td>
                  <td className="text-right">—</td>
                  <td className="text-right">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </SectionCard>
      )}

      {subtab === 'marca_cliente' && (
        <SectionCard>
          <table className="w-full text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="text-left py-1.5">Marca</th>
                <th className="text-left">Cliente</th>
                <th className="text-right">Cantidad</th>
                <th className="text-right">Neto</th>
                <th className="text-right">Ganancia</th>
                <th className="text-right">Margen %</th>
                <th className="text-right">Facturas</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {data.por_marca_cliente.map(r => (
                <tr key={`${r.marca_id}-${r.cliente_id}`} className="border-t border-white/[0.04]">
                  <td className="py-1.5">{r.marca_nombre}</td>
                  <td>{r.cliente_nombre}</td>
                  <td className="text-right">{r.cantidad.toLocaleString('es-CL')}</td>
                  <td className="text-right">{fmt(r.neto)}</td>
                  <td className="text-right">{fmt(r.ganancia)}</td>
                  <td className="text-right">{r.margen_pct.toFixed(1)}%</td>
                  <td className="text-right">{r.num_facturas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={() => exportFile('por-marca', 'excel', dateFrom, dateTo, extraQuery)}
          className="bg-gray-900 border border-white/[0.1] text-gray-300 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-800"
        >↓ Excel</button>
        <button
          onClick={() => exportFile('por-marca', 'csv', dateFrom, dateTo, extraQuery)}
          className="bg-gray-900 border border-white/[0.1] text-gray-300 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-800"
        >↓ CSV</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire the tab into the page switch**

In the tab-content section (around line 620-625), add the new branch:

```tsx
{activeTab === 'margenes' && <MargenesTab dateFrom={dateFrom} dateTo={dateTo} />}
{activeTab === 'por_marca' && <MarcaTab dateFrom={dateFrom} dateTo={dateTo} />}
{activeTab === 'dte' && <DteTab dateFrom={dateFrom} dateTo={dateTo} />}
```

- [ ] **Step 5: Verify type-check**

Run: `cd C:/Otros/Conico/frontend && npx tsc --noEmit`
Expected: no new errors introduced by changes.

- [ ] **Step 6: Start dev server and smoke-test the tab manually**

Run: `cd C:/Otros/Conico/frontend && npm run dev` (background it or run in another terminal)
Then in a browser: open Reportes, click "Por Marca", verify KPIs render, switch sub-tabs, pick one cliente in multi-select and confirm data updates, click Excel and CSV export — both should download.

Record any errors observed and fix before moving on.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Reportes.tsx
git commit -m "feat(reportes): por-marca tab with multi-cliente filter and exports"
```

---

### Task 8: Final regression sweep

**Files:** none to modify — verification only.

- [ ] **Step 1: Run full backend test suite**

Run: `cd C:/Otros/Conico/backend && pytest -x`
Expected: all PASS. Fix any regressions before finishing.

- [ ] **Step 2: Run frontend type-check and build**

Run: `cd C:/Otros/Conico/frontend && npx tsc --noEmit && npm run build`
Expected: clean build. Fix any errors before finishing.

- [ ] **Step 3: Update PROGRESS.md**

Append a line to `PROGRESS.md` under the current phase noting "Reportes por Marca — endpoint, exports (Excel/CSV), tab con multi-cliente filter y sub-tabs (por marca / marca+cliente)".

- [ ] **Step 4: Commit progress note**

```bash
git add PROGRESS.md
git commit -m "docs: record reportes por marca"
```

---

## Self-Review Notes

- **Multi-cliente filter:** Task 2 adds `cliente_id: list[int] | None = Query(None)` and test `test_por_marca_filters_by_cliente` covers it.
- **All metrics:** KPIs include neto, bruto, ganancia, margen%, facturas, marcas, ticket, cantidad. Per-marca row exposes cantidad/neto/ganancia/margen/facturas/clientes/ticket. Per-marca-cliente row exposes cantidad/neto/ganancia/margen/facturas. Extensible later by adding fields to `_get_por_marca`.
- **Both groupings:** `por_marca` and `por_marca_cliente` in same response.
- **Both exports:** Task 3 (Excel) + Task 4 (CSV). Each covered by its own test.
- **Tab in Reportes:** Task 7 wires into existing tabs row; no separate page.
- **Sin marca bucket:** Surfaced in JSON and Excel/CSV; shown as italic row in Por Marca sub-tab.
- **Vendedor scoping:** Preserved via `vendedor_id if role == 'vendedor'`.
- **Anulada exclusion:** Applied in `_get_por_marca` base query.
