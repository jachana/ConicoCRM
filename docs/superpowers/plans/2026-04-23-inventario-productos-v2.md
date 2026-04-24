# Inventario / Productos v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the FIFO lot-based cost system with an admin-uploaded price list (Excel/CSV) that sources `precio_costo` by SKU match. Keep stock tracking intact. Preserve full history of all uploaded lists. Gate cost visibility to admins and surface a stale-cost alert when a product's cost has not been refreshed within a configurable threshold.

**Architecture:** Add `ListaPrecios` + `ListaPreciosItem` tables and an upload endpoint that parses Excel/CSV, creates the lista, bulk-updates `Producto.precio_costo` + a new `precio_costo_actualizado_en` field for matching SKUs, and archives the previous active list. Remove the FIFO service, `LoteCosto` model, `lote_costo_id` column on `MovimientoInventario`, and `ultimo_costo_unitario` on Producto. OC reception and NV salida still create `MovimientoInventario` rows for stock tracking but no longer manage cost layers.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic (backend), Pydantic v2 schemas, pytest for tests. Frontend: React + TypeScript + Vite + TanStack Query + Tailwind. Excel parsing via `openpyxl` (already in requirements.txt). CSV via Python stdlib `csv`.

**Execution strategy:** Build the new price-list system first (Phase 1–3) without touching FIFO, so the codebase stays green throughout. Then disable FIFO writes to `precio_costo` (Phase 4), remove FIFO code and schema (Phase 5), and finish with frontend changes (Phase 6).

---

## Phase 1 — Backend models and migration

### Task 1: Alembic migration for new tables and columns

**Files:**
- Create: `backend/migrations/versions/{hash}_lista_precios_y_costo_actualizado.py`

Run `alembic revision -m "lista_precios_y_costo_actualizado"` from `backend/` to scaffold the file, then replace its body with the content below. Use the generated hash/filename.

- [ ] **Step 1: Generate migration file**

Run from `backend/`:
```bash
alembic revision -m "lista_precios_y_costo_actualizado"
```
Expected: new file created under `backend/migrations/versions/`.

- [ ] **Step 2: Fill in migration body**

Replace the generated file's `upgrade()` / `downgrade()` with:

```python
from alembic import op
import sqlalchemy as sa

revision = "<keep generated>"
down_revision = "<keep generated>"   # must chain after current head
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "listas_precios",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nombre_archivo", sa.String(255), nullable=False),
        sa.Column("ruta_archivo", sa.String(500), nullable=False),
        sa.Column("subida_por_id", sa.Integer, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("fecha_subida", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("activa", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("total_items", sa.Integer, server_default=sa.text("0"), nullable=False),
    )
    op.create_index("ix_listas_precios_activa", "listas_precios", ["activa"])

    op.create_table(
        "lista_precios_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("lista_id", sa.Integer, sa.ForeignKey("listas_precios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sku", sa.String(100), nullable=False),
        sa.Column("costo_unitario", sa.Numeric(12, 2), nullable=False),
    )
    op.create_index("ix_lista_precios_items_sku", "lista_precios_items", ["sku"])
    op.create_index("ix_lista_precios_items_lista_sku", "lista_precios_items", ["lista_id", "sku"])

    op.add_column(
        "productos",
        sa.Column("precio_costo_actualizado_en", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("productos", "precio_costo_actualizado_en")
    op.drop_index("ix_lista_precios_items_lista_sku", table_name="lista_precios_items")
    op.drop_index("ix_lista_precios_items_sku", table_name="lista_precios_items")
    op.drop_table("lista_precios_items")
    op.drop_index("ix_listas_precios_activa", table_name="listas_precios")
    op.drop_table("listas_precios")
```

- [ ] **Step 3: Apply migration**

Run from `backend/`:
```bash
alembic upgrade head
```
Expected: `Running upgrade ... -> <hash>, lista_precios_y_costo_actualizado`

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/versions/
git commit -m "feat: migration for listas_precios tables and precio_costo_actualizado_en"
```

---

### Task 2: `ListaPrecios` model

**Files:**
- Create: `backend/app/models/lista_precios.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_lista_precios_model.py`:

```python
from datetime import datetime
from decimal import Decimal

from app.models.lista_precios import ListaPrecios, ListaPreciosItem
from app.models.user import User


def test_lista_precios_has_expected_columns(db):
    user = User(email="admin@test.com", hashed_password="x", role="admin", nombre="A")
    db.add(user); db.flush()

    lp = ListaPrecios(
        nombre_archivo="precios.xlsx",
        ruta_archivo="uploads/listas_precios/1_precios.xlsx",
        subida_por_id=user.id,
        activa=True,
        total_items=3,
    )
    db.add(lp); db.flush()

    item = ListaPreciosItem(lista_id=lp.id, sku="ABC-1", costo_unitario=Decimal("100.50"))
    db.add(item); db.commit()

    reloaded = db.get(ListaPrecios, lp.id)
    assert reloaded.activa is True
    assert reloaded.total_items == 3
    assert isinstance(reloaded.fecha_subida, datetime)
    assert reloaded.items[0].sku == "ABC-1"
    assert reloaded.items[0].costo_unitario == Decimal("100.50")
```

Add `import app.models.lista_precios  # noqa: F401` to the `setup_test_db` fixture in `backend/tests/conftest.py`.

- [ ] **Step 2: Run the test — expect failure**

```bash
cd backend && pytest tests/test_lista_precios_model.py -v
```
Expected: ImportError (module does not exist yet).

- [ ] **Step 3: Implement the model**

Create `backend/app/models/lista_precios.py`:

```python
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ListaPrecios(Base):
    __tablename__ = "listas_precios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre_archivo: Mapped[str] = mapped_column(String(255))
    ruta_archivo: Mapped[str] = mapped_column(String(500))
    subida_por_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    fecha_subida: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )
    activa: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), index=True)
    total_items: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))

    subida_por: Mapped["User"] = relationship("User")
    items: Mapped[list["ListaPreciosItem"]] = relationship(
        "ListaPreciosItem", back_populates="lista", cascade="all, delete-orphan"
    )


class ListaPreciosItem(Base):
    __tablename__ = "lista_precios_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    lista_id: Mapped[int] = mapped_column(ForeignKey("listas_precios.id", ondelete="CASCADE"))
    sku: Mapped[str] = mapped_column(String(100), index=True)
    costo_unitario: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    lista: Mapped["ListaPrecios"] = relationship("ListaPrecios", back_populates="items")
```

- [ ] **Step 4: Run the test — expect pass**

```bash
cd backend && pytest tests/test_lista_precios_model.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/lista_precios.py backend/tests/test_lista_precios_model.py backend/tests/conftest.py
git commit -m "feat: ListaPrecios and ListaPreciosItem models"
```

---

### Task 3: Add `precio_costo_actualizado_en` to `Producto` model

**Files:**
- Modify: `backend/app/models/producto.py:34`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_productos.py`:

```python
def test_producto_precio_costo_actualizado_en_nullable_by_default(db):
    from app.models.producto import Producto
    p = Producto(nombre="Test", sku="X1")
    db.add(p); db.commit()
    db.refresh(p)
    assert p.precio_costo_actualizado_en is None
```

- [ ] **Step 2: Run the test — expect failure**

```bash
cd backend && pytest tests/test_productos.py::test_producto_precio_costo_actualizado_en_nullable_by_default -v
```
Expected: AttributeError.

- [ ] **Step 3: Add the column to the model**

In `backend/app/models/producto.py`, add after line 34 (`ultimo_costo_unitario`):

```python
    precio_costo_actualizado_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
```

- [ ] **Step 4: Run the test — expect pass**

```bash
cd backend && pytest tests/test_productos.py::test_producto_precio_costo_actualizado_en_nullable_by_default -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/producto.py backend/tests/test_productos.py
git commit -m "feat: add precio_costo_actualizado_en to Producto"
```

---

## Phase 2 — Price list upload service

### Task 4: Schemas for `ListaPrecios`

**Files:**
- Create: `backend/app/schemas/lista_precios.py`

- [ ] **Step 1: Write the schemas**

Create `backend/app/schemas/lista_precios.py`:

```python
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


class UsuarioRef(BaseModel):
    id: int
    nombre: str
    model_config = {"from_attributes": True}


class ListaPreciosOut(BaseModel):
    id: int
    nombre_archivo: str
    fecha_subida: datetime
    activa: bool
    total_items: int
    subida_por: UsuarioRef | None = None
    model_config = {"from_attributes": True}


class ListaPreciosItemOut(BaseModel):
    id: int
    sku: str
    costo_unitario: Decimal
    model_config = {"from_attributes": True}


class ListaPreciosItemsPage(BaseModel):
    items: list[ListaPreciosItemOut]
    total: int
    page: int
    page_size: int


class ListaPreciosUploadResult(BaseModel):
    lista_id: int
    total_filas: int
    filas_invalidas: int
    productos_actualizados: int
    skus_sin_producto: list[str]
    productos_no_incluidos_count: int


class HistorialCostoItem(BaseModel):
    fecha_subida: datetime
    costo_unitario: Decimal
    lista_id: int
    nombre_archivo: str
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/lista_precios.py
git commit -m "feat: schemas for listas de precios"
```

---

### Task 5: Parser service for Excel/CSV

**Files:**
- Create: `backend/app/services/lista_precios_parser.py`
- Test: `backend/tests/test_lista_precios_parser.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_lista_precios_parser.py`:

```python
import io
from decimal import Decimal
import csv as _csv

import openpyxl
import pytest

from app.services.lista_precios_parser import (
    ParsedRow,
    ParseError,
    parse_lista_precios,
)


def _build_csv(rows, header=("sku", "costo")):
    buf = io.StringIO()
    writer = _csv.writer(buf)
    writer.writerow(header)
    for r in rows:
        writer.writerow(r)
    return buf.getvalue().encode("utf-8")


def _build_xlsx(rows, header=("sku", "costo")):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(list(header))
    for r in rows:
        ws.append(list(r))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_parse_csv_basic():
    data = _build_csv([("ABC-1", "100.50"), ("XYZ-2", "200")])
    result = parse_lista_precios(data, "precios.csv")
    assert result.rows == [
        ParsedRow(sku="ABC-1", costo_unitario=Decimal("100.50")),
        ParsedRow(sku="XYZ-2", costo_unitario=Decimal("200")),
    ]
    assert result.filas_invalidas == 0


def test_parse_xlsx_basic():
    data = _build_xlsx([("ABC-1", 100.50), ("XYZ-2", 200)])
    result = parse_lista_precios(data, "precios.xlsx")
    skus = [r.sku for r in result.rows]
    assert skus == ["ABC-1", "XYZ-2"]


def test_parse_skips_blank_sku_and_non_numeric_cost():
    data = _build_csv([("", "100"), ("ABC", "not-a-number"), ("XYZ", "50")])
    result = parse_lista_precios(data, "precios.csv")
    assert [r.sku for r in result.rows] == ["XYZ"]
    assert result.filas_invalidas == 2


def test_parse_rejects_duplicate_sku_in_same_file():
    data = _build_csv([("ABC", "100"), ("ABC", "120")])
    with pytest.raises(ParseError) as exc:
        parse_lista_precios(data, "precios.csv")
    assert "ABC" in str(exc.value)


def test_parse_rejects_missing_headers():
    data = _build_csv([("x", "y")], header=("codigo", "precio"))
    with pytest.raises(ParseError) as exc:
        parse_lista_precios(data, "precios.csv")
    assert "sku" in str(exc.value) or "costo" in str(exc.value)


def test_parse_accepts_custom_column_names():
    data = _build_csv([("ABC", "50")], header=("codigo", "precio"))
    result = parse_lista_precios(data, "precios.csv", columna_sku="codigo", columna_costo="precio")
    assert result.rows[0].sku == "ABC"


def test_parse_rejects_unsupported_extension():
    with pytest.raises(ParseError):
        parse_lista_precios(b"irrelevant", "precios.txt")
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend && pytest tests/test_lista_precios_parser.py -v
```
Expected: ImportError.

- [ ] **Step 3: Implement the parser**

Create `backend/app/services/lista_precios_parser.py`:

```python
from __future__ import annotations

import csv as _csv
import io
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path

import openpyxl


@dataclass(frozen=True)
class ParsedRow:
    sku: str
    costo_unitario: Decimal


@dataclass
class ParseResult:
    rows: list[ParsedRow]
    filas_invalidas: int


class ParseError(Exception):
    pass


DEFAULT_SKU_COLUMN = "sku"
DEFAULT_COSTO_COLUMN = "costo"


def parse_lista_precios(
    content: bytes,
    filename: str,
    columna_sku: str = DEFAULT_SKU_COLUMN,
    columna_costo: str = DEFAULT_COSTO_COLUMN,
) -> ParseResult:
    ext = Path(filename).suffix.lower()
    if ext == ".csv":
        raw_rows = _read_csv(content)
    elif ext == ".xlsx":
        raw_rows = _read_xlsx(content)
    else:
        raise ParseError(f"Extensión no soportada: {ext}. Use .xlsx o .csv")

    if not raw_rows:
        raise ParseError("El archivo no contiene filas")

    header = [h.strip().lower() if isinstance(h, str) else "" for h in raw_rows[0]]
    sku_col = columna_sku.strip().lower()
    costo_col = columna_costo.strip().lower()
    try:
        sku_idx = header.index(sku_col)
        costo_idx = header.index(costo_col)
    except ValueError:
        raise ParseError(f"Columnas requeridas no encontradas: '{columna_sku}', '{columna_costo}'. Encontradas: {header}")

    rows: list[ParsedRow] = []
    seen: dict[str, int] = {}
    invalid = 0
    for i, raw in enumerate(raw_rows[1:], start=2):
        if len(raw) <= max(sku_idx, costo_idx):
            invalid += 1
            continue
        sku_val = raw[sku_idx]
        costo_val = raw[costo_idx]
        sku = str(sku_val).strip() if sku_val is not None else ""
        if not sku:
            invalid += 1
            continue
        try:
            costo = Decimal(str(costo_val).strip())
        except (InvalidOperation, AttributeError):
            invalid += 1
            continue
        if sku in seen:
            raise ParseError(f"SKU duplicado en el archivo: '{sku}' (filas {seen[sku]} y {i})")
        seen[sku] = i
        rows.append(ParsedRow(sku=sku, costo_unitario=costo))

    return ParseResult(rows=rows, filas_invalidas=invalid)


def _read_csv(content: bytes) -> list[list]:
    text = content.decode("utf-8-sig")
    reader = _csv.reader(io.StringIO(text))
    return [row for row in reader]


def _read_xlsx(content: bytes) -> list[list]:
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    out: list[list] = []
    for row in ws.iter_rows(values_only=True):
        out.append(list(row))
    return out
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend && pytest tests/test_lista_precios_parser.py -v
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/lista_precios_parser.py backend/tests/test_lista_precios_parser.py
git commit -m "feat: parser for lista de precios (xlsx/csv)"
```

---

### Task 6: Upload endpoint

**Files:**
- Create: `backend/app/api/listas_precios.py`
- Modify: `backend/app/main.py` (register router)
- Test: `backend/tests/test_listas_precios_upload.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_listas_precios_upload.py`:

```python
import io
from decimal import Decimal
from datetime import datetime, timezone

import openpyxl


def _xlsx(rows, header=("sku", "costo")):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(list(header))
    for r in rows:
        ws.append(list(r))
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def test_upload_updates_matching_productos(client, admin_token, db):
    from app.models.producto import Producto
    p1 = Producto(nombre="A", sku="ABC-1", precio_costo=Decimal("10"))
    p2 = Producto(nombre="B", sku="XYZ-2", precio_costo=Decimal("20"))
    db.add_all([p1, p2]); db.commit()

    buf = _xlsx([("ABC-1", 100), ("XYZ-2", 200), ("NOT-IN-DB", 999)])
    resp = client.post(
        "/api/listas-precios/",
        files={"archivo": ("lista.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["total_filas"] == 3
    assert body["productos_actualizados"] == 2
    assert body["skus_sin_producto"] == ["NOT-IN-DB"]

    db.refresh(p1); db.refresh(p2)
    assert p1.precio_costo == Decimal("100")
    assert p2.precio_costo == Decimal("200")
    assert p1.precio_costo_actualizado_en is not None


def test_upload_archives_previous_active_list(client, admin_token, db):
    buf1 = _xlsx([("A", 10)])
    client.post("/api/listas-precios/", files={"archivo": ("a.xlsx", buf1, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                headers={"Authorization": f"Bearer {admin_token}"})
    buf2 = _xlsx([("A", 20)])
    client.post("/api/listas-precios/", files={"archivo": ("b.xlsx", buf2, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                headers={"Authorization": f"Bearer {admin_token}"})

    resp = client.get("/api/listas-precios/", headers={"Authorization": f"Bearer {admin_token}"})
    rows = resp.json()["items"]
    assert len(rows) == 2
    activas = [r for r in rows if r["activa"]]
    assert len(activas) == 1
    assert activas[0]["nombre_archivo"] == "b.xlsx"


def test_upload_refreshes_actualizado_en_even_if_cost_same(client, admin_token, db):
    from app.models.producto import Producto
    p = Producto(nombre="A", sku="ABC", precio_costo=Decimal("50"))
    db.add(p); db.commit()

    buf1 = _xlsx([("ABC", 50)])
    client.post("/api/listas-precios/", files={"archivo": ("a.xlsx", buf1, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                headers={"Authorization": f"Bearer {admin_token}"})
    db.refresh(p)
    first_ts = p.precio_costo_actualizado_en
    assert first_ts is not None

    buf2 = _xlsx([("ABC", 50)])
    client.post("/api/listas-precios/", files={"archivo": ("b.xlsx", buf2, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                headers={"Authorization": f"Bearer {admin_token}"})
    db.refresh(p)
    assert p.precio_costo_actualizado_en > first_ts


def test_upload_keeps_cost_for_products_not_in_new_list(client, admin_token, db):
    from app.models.producto import Producto
    p = Producto(nombre="A", sku="ABC", precio_costo=Decimal("50"))
    db.add(p); db.commit()

    buf = _xlsx([("OTHER-SKU", 100)])
    client.post("/api/listas-precios/", files={"archivo": ("a.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                headers={"Authorization": f"Bearer {admin_token}"})
    db.refresh(p)
    assert p.precio_costo == Decimal("50")
    assert p.precio_costo_actualizado_en is None


def test_upload_rejects_duplicate_sku(client, admin_token):
    buf = _xlsx([("ABC", 10), ("ABC", 20)])
    resp = client.post(
        "/api/listas-precios/",
        files={"archivo": ("dup.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400


def test_upload_requires_admin(client, vendedor_token):
    buf = _xlsx([("A", 10)])
    resp = client.post(
        "/api/listas-precios/",
        files={"archivo": ("a.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend && pytest tests/test_listas_precios_upload.py -v
```
Expected: 404/ImportError — endpoint not registered.

- [ ] **Step 3: Implement the endpoint**

Create `backend/app/api/listas_precios.py`:

```python
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import update
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_permission
from app.models.lista_precios import ListaPrecios, ListaPreciosItem
from app.models.producto import Producto
from app.models.user import User
from app.schemas.lista_precios import (
    ListaPreciosItemsPage,
    ListaPreciosOut,
    ListaPreciosUploadResult,
)
from app.services.lista_precios_parser import ParseError, parse_lista_precios

router = APIRouter()

UPLOAD_DIR = Path("uploads") / "listas_precios"


def _require_admin(current_user: User) -> None:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin")


@router.post("/", response_model=ListaPreciosUploadResult, status_code=201)
async def subir_lista(
    archivo: UploadFile = File(...),
    columna_sku: str = Form("sku"),
    columna_costo: str = Form("costo"),
    perms: tuple[User, Session] = require_permission("catalogo", "edit"),
):
    user, db = perms
    _require_admin(user)

    content = await archivo.read()
    filename = archivo.filename or "lista.xlsx"
    try:
        parsed = parse_lista_precios(content, filename, columna_sku, columna_costo)
    except ParseError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # archive previous active
    db.execute(update(ListaPrecios).where(ListaPrecios.activa.is_(True)).values(activa=False))

    lista = ListaPrecios(
        nombre_archivo=filename,
        ruta_archivo="",  # set after id known
        subida_por_id=user.id,
        activa=True,
        total_items=len(parsed.rows),
    )
    db.add(lista); db.flush()

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest = UPLOAD_DIR / f"{lista.id}_{filename}"
    dest.write_bytes(content)
    lista.ruta_archivo = str(dest)

    for row in parsed.rows:
        db.add(ListaPreciosItem(lista_id=lista.id, sku=row.sku, costo_unitario=row.costo_unitario))

    skus = [r.sku for r in parsed.rows]
    productos = db.query(Producto).filter(Producto.sku.in_(skus)).all() if skus else []
    found_skus = {p.sku for p in productos}
    now = datetime.now(timezone.utc)
    costo_by_sku = {r.sku: r.costo_unitario for r in parsed.rows}
    for p in productos:
        p.precio_costo = costo_by_sku[p.sku]
        p.precio_costo_actualizado_en = now

    db.commit()

    skus_sin_producto = sorted(s for s in costo_by_sku if s not in found_skus)
    base_q = db.query(Producto).filter(Producto.sku.isnot(None))
    if skus:
        base_q = base_q.filter(~Producto.sku.in_(skus))
    productos_no_incluidos_count = base_q.count()

    return ListaPreciosUploadResult(
        lista_id=lista.id,
        total_filas=len(parsed.rows) + parsed.filas_invalidas,
        filas_invalidas=parsed.filas_invalidas,
        productos_actualizados=len(productos),
        skus_sin_producto=skus_sin_producto,
        productos_no_incluidos_count=productos_no_incluidos_count,
    )


class _Page(ListaPreciosOut):
    pass


@router.get("/")
def listar_listas(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    user, db = perms
    _require_admin(user)
    q = db.query(ListaPrecios).options(joinedload(ListaPrecios.subida_por)).order_by(ListaPrecios.fecha_subida.desc())
    total = q.count()
    rows = q.offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [ListaPreciosOut.model_validate(r) for r in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/activa", response_model=ListaPreciosOut | None)
def lista_activa(
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    user, db = perms
    _require_admin(user)
    return db.query(ListaPrecios).filter(ListaPrecios.activa.is_(True)).first()


@router.get("/{lista_id}", response_model=ListaPreciosOut)
def obtener_lista(
    lista_id: int,
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    user, db = perms
    _require_admin(user)
    lp = db.get(ListaPrecios, lista_id)
    if not lp:
        raise HTTPException(status_code=404, detail="Lista no encontrada")
    return lp


@router.get("/{lista_id}/items", response_model=ListaPreciosItemsPage)
def listar_items(
    lista_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    user, db = perms
    _require_admin(user)
    if not db.get(ListaPrecios, lista_id):
        raise HTTPException(status_code=404, detail="Lista no encontrada")
    q = db.query(ListaPreciosItem).filter_by(lista_id=lista_id)
    total = q.count()
    items = q.order_by(ListaPreciosItem.sku).offset((page - 1) * page_size).limit(page_size).all()
    return ListaPreciosItemsPage(items=items, total=total, page=page, page_size=page_size)


@router.get("/{lista_id}/download")
def descargar_lista(
    lista_id: int,
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    user, db = perms
    _require_admin(user)
    lp = db.get(ListaPrecios, lista_id)
    if not lp:
        raise HTTPException(status_code=404, detail="Lista no encontrada")
    path = Path(lp.ruta_archivo)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")
    return FileResponse(str(path), filename=lp.nombre_archivo)


@router.delete("/{lista_id}", status_code=204)
def eliminar_lista(
    lista_id: int,
    perms: tuple[User, Session] = require_permission("catalogo", "delete"),
):
    user, db = perms
    _require_admin(user)
    lp = db.get(ListaPrecios, lista_id)
    if not lp:
        raise HTTPException(status_code=404, detail="Lista no encontrada")
    if lp.activa:
        raise HTTPException(status_code=400, detail="No se puede eliminar la lista activa")
    path = Path(lp.ruta_archivo)
    if path.exists():
        path.unlink()
    db.delete(lp)
    db.commit()
```

- [ ] **Step 4: Register router in `main.py`**

In `backend/app/main.py`, add import and include_router:

```python
from app.api import listas_precios
# ... existing imports ...

app.include_router(listas_precios.router, prefix="/api/listas-precios", tags=["listas_precios"])
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd backend && pytest tests/test_listas_precios_upload.py -v
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/listas_precios.py backend/app/main.py backend/tests/test_listas_precios_upload.py
git commit -m "feat: upload + CRUD endpoints for listas de precios"
```

---

### Task 7: Historial de costos endpoint on Producto

**Files:**
- Modify: `backend/app/api/productos.py` (add new endpoint)
- Test: `backend/tests/test_historial_costos.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_historial_costos.py`:

```python
import io
import openpyxl


def _xlsx(rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["sku", "costo"])
    for r in rows:
        ws.append(list(r))
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return buf


def test_historial_costos_returns_all_lists_for_sku(client, admin_token, db):
    from app.models.producto import Producto
    p = Producto(nombre="A", sku="ABC")
    db.add(p); db.commit()

    for nombre, costo in [("lista1.xlsx", 100), ("lista2.xlsx", 120), ("lista3.xlsx", 150)]:
        buf = _xlsx([("ABC", costo)])
        client.post("/api/listas-precios/", files={"archivo": (nombre, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                    headers={"Authorization": f"Bearer {admin_token}"})

    resp = client.get(f"/api/productos/{p.id}/historial-costos", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 3
    costos = [b["costo_unitario"] for b in body]
    assert set(costos) == {"100.00", "120.00", "150.00"}
    # most recent first
    assert body[0]["nombre_archivo"] == "lista3.xlsx"


def test_historial_costos_requires_admin(client, vendedor_token, db):
    from app.models.producto import Producto
    p = Producto(nombre="A", sku="ABC")
    db.add(p); db.commit()
    resp = client.get(f"/api/productos/{p.id}/historial-costos", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert resp.status_code == 403
```

- [ ] **Step 2: Run the test — expect failure**

```bash
cd backend && pytest tests/test_historial_costos.py -v
```
Expected: 404.

- [ ] **Step 3: Add the endpoint to `productos.py`**

Append to `backend/app/api/productos.py`:

```python
from app.models.lista_precios import ListaPrecios, ListaPreciosItem
from app.schemas.lista_precios import HistorialCostoItem


@router.get("/{producto_id}/historial-costos", response_model=list[HistorialCostoItem])
def historial_costos(
    producto_id: int,
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    current_user, db = perms
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin")
    p = db.get(Producto, producto_id)
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    if not p.sku:
        return []
    rows = (
        db.query(ListaPrecios, ListaPreciosItem)
        .join(ListaPreciosItem, ListaPreciosItem.lista_id == ListaPrecios.id)
        .filter(ListaPreciosItem.sku == p.sku)
        .order_by(ListaPrecios.fecha_subida.desc())
        .all()
    )
    return [
        HistorialCostoItem(
            fecha_subida=lp.fecha_subida,
            costo_unitario=item.costo_unitario,
            lista_id=lp.id,
            nombre_archivo=lp.nombre_archivo,
        )
        for lp, item in rows
    ]
```

- [ ] **Step 4: Run the test — expect pass**

```bash
cd backend && pytest tests/test_historial_costos.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/productos.py backend/tests/test_historial_costos.py
git commit -m "feat: historial de costos por producto"
```

---

## Phase 3 — Admin-only gating and stale indicator

### Task 8: Seed config key `dias_alerta_costo_desactualizado`

**Files:**
- Modify: `backend/app/api/config.py:12-23`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_config.py` (create file if missing):

```python
def test_config_seeds_dias_alerta_costo_desactualizado(client, admin_token):
    resp = client.get("/api/config/", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    items = {c["key"]: c["value"] for c in resp.json()}
    assert items.get("dias_alerta_costo_desactualizado") == "60"
```

- [ ] **Step 2: Run the test — expect failure**

```bash
cd backend && pytest tests/test_config.py::test_config_seeds_dias_alerta_costo_desactualizado -v
```
Expected: FAIL (key missing).

- [ ] **Step 3: Add the key**

In `backend/app/api/config.py`, add to `INITIAL_CONFIG`:

```python
    "dias_alerta_costo_desactualizado": "60",
```

- [ ] **Step 4: Run the test — expect pass**

```bash
cd backend && pytest tests/test_config.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/config.py backend/tests/test_config.py
git commit -m "feat: seed dias_alerta_costo_desactualizado = 60 in config"
```

---

### Task 9: Admin-only cost fields + `costo_desactualizado` in `ProductoOut`

**Files:**
- Modify: `backend/app/schemas/producto.py` (ProductoOut, ProductoBusquedaOut)
- Modify: `backend/app/api/productos.py` (serialize with admin gating)
- Test: extend `backend/tests/test_productos.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_productos.py`:

```python
def test_producto_out_hides_cost_for_vendedor(client, vendedor_token, db):
    from app.models.producto import Producto
    from decimal import Decimal
    p = Producto(nombre="A", sku="X", precio_costo=Decimal("100"), precio_venta=Decimal("150"))
    db.add(p); db.commit()

    resp = client.get(f"/api/productos/{p.id}", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert "precio_costo" not in body
    assert "costo_con_iva" not in body
    assert "precio_costo_actualizado_en" not in body
    assert "costo_desactualizado" not in body
    assert body["precio_venta"] == "150.00"


def test_producto_out_exposes_cost_for_admin(client, admin_token, db):
    from app.models.producto import Producto
    from decimal import Decimal
    p = Producto(nombre="A", sku="X", precio_costo=Decimal("100"))
    db.add(p); db.commit()

    resp = client.get(f"/api/productos/{p.id}", headers={"Authorization": f"Bearer {admin_token}"})
    body = resp.json()
    assert body["precio_costo"] == "100.00"
    assert "costo_con_iva" in body
    assert "costo_desactualizado" in body


def test_costo_desactualizado_true_when_null_fecha(client, admin_token, db):
    from app.models.producto import Producto
    p = Producto(nombre="A", sku="X")
    db.add(p); db.commit()
    resp = client.get(f"/api/productos/{p.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.json()["costo_desactualizado"] is True


def test_costo_desactualizado_false_when_recent(client, admin_token, db):
    from app.models.producto import Producto
    from datetime import datetime, timezone
    p = Producto(nombre="A", sku="X", precio_costo_actualizado_en=datetime.now(timezone.utc))
    db.add(p); db.commit()
    resp = client.get(f"/api/productos/{p.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.json()["costo_desactualizado"] is False
```

- [ ] **Step 2: Run the tests — expect failure**

```bash
cd backend && pytest tests/test_productos.py -v -k "cost or costo_desactualizado"
```
Expected: assertion failures (fields still present for vendedor, `costo_desactualizado` absent).

- [ ] **Step 3: Split the schemas**

Rewrite `backend/app/schemas/producto.py`:

```python
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, field_validator


class MarcaRef(BaseModel):
    id: int
    nombre: str
    model_config = {"from_attributes": True}


class ProductoBase(BaseModel):
    nombre: str
    descripcion: str | None = None
    precio_venta: Decimal = Decimal("0")
    stock_minimo: int = 0
    stock_actual: int = 0
    proveedor_id: int | None = None
    marca_id: int | None = None
    volumen: Decimal | None = None
    tags: list[str] = []

    @field_validator("tags", mode="before")
    @classmethod
    def extract_tags(cls, v):
        if not v:
            return []
        if v and hasattr(v[0], "nombre"):
            return [t.nombre for t in v]
        return list(v)


class ProductoCreate(ProductoBase):
    pass


class ProductoUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    precio_venta: Decimal | None = None
    stock_minimo: int | None = None
    stock_actual: int | None = None
    proveedor_id: int | None = None
    marca_id: int | None = None
    volumen: Decimal | None = None
    tags: list[str] | None = None


class ProductoOutPublic(ProductoBase):
    id: int
    sku: str | None = None
    formato: str | None = None
    precio_con_iva: Decimal = Decimal("0")
    marca: MarcaRef | None = None
    created_at: datetime
    model_config = {"from_attributes": True}


class ProductoOutAdmin(ProductoOutPublic):
    precio_costo: Decimal = Decimal("0")
    costo_con_iva: Decimal = Decimal("0")
    precio_costo_actualizado_en: datetime | None = None
    costo_desactualizado: bool = False


class ProductoBusquedaOut(BaseModel):
    id: int
    nombre: str
    descripcion: str | None = None
    sku: str | None = None
    formato: str | None = None
    precio_venta: Decimal
    precio_costo: Decimal  # admin-only endpoint (serializer trims on response)
    stock_actual: int
    marca_id: int | None = None
    tags: list[str] = []
    model_config = {"from_attributes": True}

    @field_validator("tags", mode="before")
    @classmethod
    def extract_tags(cls, v):
        if not v:
            return []
        if v and hasattr(v[0], "nombre"):
            return [t.nombre for t in v]
        return list(v)
```

- [ ] **Step 4: Update `productos.py` to serialize based on role**

In `backend/app/api/productos.py`, add a helper and update handlers:

```python
from datetime import datetime, timezone
from app.models.system_config import SystemConfig
from app.schemas.producto import ProductoOutAdmin, ProductoOutPublic


def _serialize_producto(db: Session, producto: Producto, user: User):
    if user.role != "admin":
        return ProductoOutPublic.model_validate(producto).model_dump(mode="json")
    cfg = db.get(SystemConfig, "dias_alerta_costo_desactualizado")
    threshold_days = int(cfg.value) if cfg else 60
    fecha = producto.precio_costo_actualizado_en
    if fecha is None:
        stale = True
    else:
        stale = (datetime.now(timezone.utc) - fecha).days > threshold_days
    out = ProductoOutAdmin.model_validate(producto).model_dump(mode="json")
    out["costo_desactualizado"] = stale
    return out
```

Then update all handlers that return `ProductoOut` to call `_serialize_producto`. Remove the `response_model=ProductoOut` annotation on those endpoints so FastAPI returns the dict as-is. Apply to:

- `listar_productos` — return `[_serialize_producto(db, p, user) for p in rows]`
- `crear_producto` — return `_serialize_producto(db, producto, user)`
- `obtener_producto` — return `_serialize_producto(db, p, user)`
- `actualizar_producto` — return `_serialize_producto(db, p, user)`

For `listar_productos` and other paginated/batch endpoints with many products, fetch the config once and pass `threshold_days` via a helper variant to avoid N queries; the simplest form is:

```python
cfg = db.get(SystemConfig, "dias_alerta_costo_desactualizado")
threshold_days = int(cfg.value) if cfg else 60
now = datetime.now(timezone.utc)

def serialize(p):
    if user.role != "admin":
        return ProductoOutPublic.model_validate(p).model_dump(mode="json")
    fecha = p.precio_costo_actualizado_en
    stale = fecha is None or (now - fecha).days > threshold_days
    out = ProductoOutAdmin.model_validate(p).model_dump(mode="json")
    out["costo_desactualizado"] = stale
    return out
```

- [ ] **Step 5: Run the tests — expect pass**

```bash
cd backend && pytest tests/test_productos.py -v
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/producto.py backend/app/api/productos.py backend/tests/test_productos.py
git commit -m "feat: admin-only cost fields + costo_desactualizado flag on Producto"
```

---

## Phase 4 — Disable FIFO writes, keep stock tracking

This phase changes behavior but does not yet drop schema. The FIFO service is no longer called from OC reception, NV salida, or costo approval flows. Stock movements still record `MovimientoInventario` rows.

### Task 10: Remove FIFO from OC reception

**Files:**
- Modify: `backend/app/api/ordenes_compra.py:27, 324`

- [ ] **Step 1: Inspect current usage**

```bash
cd backend && grep -n "crear_lote_entrada\|consumir_stock_fifo\|from app.services.inventario_fifo" app/api/ordenes_compra.py
```
Note the exact lines; the OC receive endpoint calls `crear_lote_entrada` after validating each line.

- [ ] **Step 2: Update existing test expectations**

In `backend/tests/test_ordenes_compra.py`, find tests that assert `producto.precio_costo` changed after OC reception. Update those assertions to expect `precio_costo` **unchanged** by OC reception — only the upload of a price list should change it. Keep assertions that verify `stock_actual` is incremented and `MovimientoInventario` row is created with `tipo=entrada`.

- [ ] **Step 3: Replace FIFO call with plain stock + movement write**

In `backend/app/api/ordenes_compra.py`, remove the `from app.services.inventario_fifo import crear_lote_entrada` import. At the call site (line ~324), replace:

```python
lote = crear_lote_entrada(
    db,
    producto_id=linea.producto_id,
    costo_unitario=linea.costo_unitario,
    cantidad=linea.cantidad_recibida,
    oc_linea_id=linea.id,
    usuario_id=current_user.id,
)
db.add(MovimientoInventario(...))  # if there is one, merge into single write below
```

with:

```python
from app.models.movimiento_inventario import MovimientoInventario  # if not already imported
producto = db.get(Producto, linea.producto_id)
producto.stock_actual += linea.cantidad_recibida
db.add(MovimientoInventario(
    producto_id=linea.producto_id,
    tipo="entrada",
    cantidad=linea.cantidad_recibida,
    signo=1,
    referencia_tipo="orden_compra",
    referencia_id=oc.id,
    usuario_id=current_user.id,
))
```

Remove any `recalcular_precio_costo` / `ultimo_costo_unitario` references in this file.

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_ordenes_compra.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/ordenes_compra.py backend/tests/test_ordenes_compra.py
git commit -m "refactor: OC reception stops using FIFO; cost comes from price list"
```

---

### Task 11: Remove FIFO from NV salida and OC-creating-from-NV paths

**Files:**
- Modify: `backend/app/api/nota_ventas.py:34, 164, 180, 498, 509`

- [ ] **Step 1: Inspect current usage**

```bash
cd backend && grep -n "consumir_stock_fifo\|crear_lote_entrada\|from app.services.inventario_fifo" app/api/nota_ventas.py
```

Note each line. The NV file uses the FIFO service in two contexts: consuming stock on NV confirmation, and creating a lot when an NV line is paired with an inbound OC line.

- [ ] **Step 2: Update tests**

In `backend/tests/test_nota_ventas.py` and `backend/tests/test_inventario.py`, update expectations:
- NV salida still creates a `MovimientoInventario` row (`tipo=salida`, `signo=-1`), but now exactly one per NV line — no multi-row split per lot
- `stock_actual` decrements correctly (still permits negative)
- `precio_costo` is **not** recalculated by NV confirmation

- [ ] **Step 3: Replace calls with direct movement writes**

Replace each `consumir_stock_fifo(...)` call with:

```python
producto = db.get(Producto, linea.producto_id)
producto.stock_actual -= linea.cantidad
db.add(MovimientoInventario(
    producto_id=linea.producto_id,
    tipo="salida",
    cantidad=linea.cantidad,
    signo=-1,
    referencia_tipo="nota_venta",
    referencia_id=nv.id,
    usuario_id=current_user.id,
))
```

Replace `crear_lote_entrada(...)` (line ~180, 509) calls with a plain `MovimientoInventario` `tipo=entrada, signo=+1` write plus `producto.stock_actual += cantidad`. Remove the import.

- [ ] **Step 4: Run tests**

```bash
cd backend && pytest tests/test_nota_ventas.py tests/test_inventario.py -v
```
Expected: PASS. Some assertions may need tightening; adjust until they match the new (simpler) behavior.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/nota_ventas.py backend/tests/test_nota_ventas.py backend/tests/test_inventario.py
git commit -m "refactor: NV salida writes single movimiento, no FIFO"
```

---

### Task 12: Update `aprobaciones_costo.py` to drop FIFO and keep gate

**Files:**
- Modify: `backend/app/api/aprobaciones_costo.py:8, 27-36`

- [ ] **Step 1: Update the test**

In `backend/tests/test_aprobaciones_costo.py`, update the test that exercises approval to assert:
- After approval, NV estado is `pendiente`
- One `MovimientoInventario salida` is created per line (not per lot)
- `producto.precio_costo` is **not** altered by approval

- [ ] **Step 2: Replace FIFO call in the approval handler**

Rewrite `backend/app/api/aprobaciones_costo.py`:

```python
from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.movimiento_inventario import MovimientoInventario
from app.models.nota_venta import NotaVenta
from app.models.producto import Producto
from app.models.user import User
from app.schemas.nota_venta import NotaVentaOut

router = APIRouter()


@router.post("/{nv_id}/aprobar", response_model=NotaVentaOut)
def aprobar_costo(
    nv_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "edit"),
):
    current_user, db = perms
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin puede aprobar")
    nv = db.get(NotaVenta, nv_id)
    if not nv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NV no encontrada")
    if nv.estado != "pendiente_aprobacion_costo":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La NV no está pendiente de aprobación de costo")

    for linea in nv.lineas:
        if linea.producto_id and linea.cantidad > 0:
            producto = db.get(Producto, linea.producto_id)
            producto.stock_actual -= linea.cantidad
            db.add(MovimientoInventario(
                producto_id=linea.producto_id,
                tipo="salida",
                cantidad=linea.cantidad,
                signo=-1,
                referencia_tipo="nota_venta",
                referencia_id=nv_id,
                usuario_id=current_user.id,
            ))

    nv.estado = "pendiente"
    db.commit()
    from app.api.nota_ventas import _load_nv
    return _load_nv(db, nv_id)
```

- [ ] **Step 3: Run tests**

```bash
cd backend && pytest tests/test_aprobaciones_costo.py -v
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/aprobaciones_costo.py backend/tests/test_aprobaciones_costo.py
git commit -m "refactor: aprobaciones_costo writes single movimiento, no FIFO"
```

---

## Phase 5 — Drop FIFO schema and dead code

### Task 13: Remove `/productos/{id}/lotes` endpoint and `lote_costo_id` from CSV export

**Files:**
- Modify: `backend/app/api/productos.py:178, 215-228`

- [ ] **Step 1: Update test expectations**

In `backend/tests/test_lotes.py`, either delete the file or mark tests xfail. Simplest: delete with `git rm backend/tests/test_lotes.py`.

Update the movimientos CSV export test in `backend/tests/test_inventario.py` (or `test_productos.py`) to expect the CSV header without `lote_costo_id`.

- [ ] **Step 2: Remove the endpoint and CSV column**

In `backend/app/api/productos.py`:

- Delete the `listar_lotes_producto` handler at the end of the file (lines ~215-228) and its `LoteCosto`/`LoteCostoOut` imports
- In `exportar_movimientos_producto`, remove `lote_costo_id` from the header list and from the row writer:

```python
writer.writerow(["fecha", "tipo", "cantidad", "signo", "referencia_tipo", "referencia_id", "motivo", "nota", "usuario_id"])
for m in movimientos:
    writer.writerow([
        m.created_at.isoformat(), m.tipo, m.cantidad, m.signo,
        m.referencia_tipo or "", m.referencia_id or "",
        m.motivo or "", m.nota or "",
        m.usuario_id or "",
    ])
```

- [ ] **Step 3: Run tests**

```bash
cd backend && pytest tests/test_productos.py tests/test_inventario.py -v
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/productos.py backend/tests/
git commit -m "refactor: remove lotes endpoint and lote_costo_id column from movimientos CSV"
```

---

### Task 14: Delete FIFO service, LoteCosto model/schema, and fifo test file

**Files:**
- Delete: `backend/app/services/inventario_fifo.py`
- Delete: `backend/app/models/lote_costo.py`
- Delete: `backend/app/schemas/lote_costo.py`
- Delete: `backend/tests/test_fifo.py`
- Modify: `backend/app/models/movimiento_inventario.py:22-23, 33` (remove `lote_costo_id` column and relationship)
- Modify: `backend/tests/conftest.py` (remove `import app.models.lote_costo`)

- [ ] **Step 1: Delete files**

```bash
cd backend
git rm app/services/inventario_fifo.py app/models/lote_costo.py app/schemas/lote_costo.py tests/test_fifo.py
```

- [ ] **Step 2: Strip `lote_costo_id` from `MovimientoInventario`**

In `backend/app/models/movimiento_inventario.py`, delete these blocks:

```python
# DELETE:
lote_costo_id: Mapped[int | None] = mapped_column(
    ForeignKey("lotes_costo.id", ondelete="SET NULL"), nullable=True
)
...
lote_costo: Mapped["LoteCosto | None"] = relationship("LoteCosto")
```

Also delete the `lote_costo_id` field from any schema in `backend/app/schemas/movimiento_inventario.py` and any remaining references.

- [ ] **Step 3: Clean up conftest**

In `backend/tests/conftest.py`, remove the line:
```python
import app.models.lote_costo  # noqa: F401 — registers LoteCosto with Base.metadata
```

- [ ] **Step 4: Run the full test suite**

```bash
cd backend && pytest -x
```
Expected: PASS. Fix any remaining import errors in tests or modules (search for `LoteCosto`, `lote_costo`, `ultimo_costo_unitario`, `inventario_fifo` and delete references).

- [ ] **Step 5: Commit**

```bash
git add -A backend/
git commit -m "refactor: remove LoteCosto, FIFO service, and related schema references"
```

---

### Task 15: Alembic migration to drop `lotes_costo`, `lote_costo_id`, `ultimo_costo_unitario`

**Files:**
- Create: `backend/migrations/versions/{hash}_drop_fifo_schema.py`
- Modify: `backend/app/models/producto.py:32-34` (remove `ultimo_costo_unitario`)

- [ ] **Step 1: Remove the field from the model**

In `backend/app/models/producto.py`, delete lines 32-34:

```python
# DELETE:
ultimo_costo_unitario: Mapped[Decimal] = mapped_column(
    Numeric(12, 2), default=Decimal("0"), server_default=text("0")
)
```

- [ ] **Step 2: Generate migration**

```bash
cd backend && alembic revision -m "drop_fifo_schema"
```

- [ ] **Step 3: Fill in the migration body**

```python
from alembic import op
import sqlalchemy as sa

revision = "<keep generated>"
down_revision = "<keep generated>"   # must chain after Task 1 migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    # batch_alter_table handles SQLite by recreating the table, which drops the FK automatically.
    # On Postgres, drop the named FK constraint before dropping the column. Inspect current
    # constraints with: SELECT conname FROM pg_constraint WHERE conrelid='movimientos_inventario'::regclass
    # and add an explicit drop_constraint call inside the batch block if needed.
    with op.batch_alter_table("movimientos_inventario") as batch:
        batch.drop_column("lote_costo_id")
    op.drop_table("lotes_costo")
    with op.batch_alter_table("productos") as batch:
        batch.drop_column("ultimo_costo_unitario")


def downgrade() -> None:
    with op.batch_alter_table("productos") as batch:
        batch.add_column(sa.Column("ultimo_costo_unitario", sa.Numeric(12, 2), server_default=sa.text("0"), nullable=False))
    op.create_table(
        "lotes_costo",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("producto_id", sa.Integer, sa.ForeignKey("productos.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("oc_linea_id", sa.Integer, sa.ForeignKey("orden_compra_lineas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("costo_unitario", sa.Numeric(12, 2), nullable=False),
        sa.Column("cantidad_inicial", sa.Integer, nullable=False),
        sa.Column("cantidad_restante", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False, index=True),
    )
    with op.batch_alter_table("movimientos_inventario") as batch:
        batch.add_column(sa.Column("lote_costo_id", sa.Integer, sa.ForeignKey("lotes_costo.id", ondelete="SET NULL"), nullable=True))
```

**SQLite note:** The `batch_alter_table` context above ensures SQLite compatibility (the existing migrations already use this pattern — see `migrate_sprint_a.py`).

- [ ] **Step 4: Apply migration**

```bash
cd backend && alembic upgrade head
```

- [ ] **Step 5: Full test suite**

```bash
cd backend && pytest -x
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/versions/ backend/app/models/producto.py
git commit -m "feat: migration dropping lotes_costo, lote_costo_id, ultimo_costo_unitario"
```

---

## Phase 6 — Frontend

### Task 16: Frontend types update

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Update `Producto` and add new types**

In `frontend/src/types/index.ts`:

- On the `Producto` interface, make `precio_costo`, `costo_con_iva`, `precio_costo_actualizado_en`, `costo_desactualizado` optional fields (present only when admin):

```typescript
export interface Producto {
  id: number
  nombre: string
  descripcion: string | null
  sku: string | null
  formato: string | null
  precio_venta: number | string
  precio_con_iva: number | string
  precio_costo?: number | string         // admin only
  costo_con_iva?: number | string        // admin only
  precio_costo_actualizado_en?: string | null  // admin only
  costo_desactualizado?: boolean         // admin only
  stock_minimo: number
  stock_actual: number
  proveedor_id: number | null
  marca_id: number | null
  volumen: number | string | null
  tags: string[]
  marca: { id: number; nombre: string } | null
  created_at: string
}
```

- Remove `ultimo_costo_unitario` if present.
- Add new types:

```typescript
export interface ListaPrecios {
  id: number
  nombre_archivo: string
  fecha_subida: string
  activa: boolean
  total_items: number
  subida_por: { id: number; nombre: string } | null
}

export interface ListaPreciosItem {
  id: number
  sku: string
  costo_unitario: number | string
}

export interface ListaPreciosUploadResult {
  lista_id: number
  total_filas: number
  filas_invalidas: number
  productos_actualizados: number
  skus_sin_producto: string[]
  productos_no_incluidos_count: number
}

export interface HistorialCostoItem {
  fecha_subida: string
  costo_unitario: number | string
  lista_id: number
  nombre_archivo: string
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(fe): types for listas de precios and admin-only producto fields"
```

---

### Task 17: Listas de Precios page (admin)

**Files:**
- Create: `frontend/src/pages/ListasPrecios.tsx`
- Modify: `frontend/src/router.tsx` (add route)
- Modify: `frontend/src/components/layout/...` (add nav link — locate the file by grepping for existing `/inventario` link)

- [ ] **Step 1: Find the nav file**

```bash
cd frontend && grep -rn "Inventario" src/components/layout/ | head -5
```
Note the file that contains the sidebar/nav and the pattern for adding an entry.

- [ ] **Step 2: Create the page**

Create `frontend/src/pages/ListasPrecios.tsx`:

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ListaPrecios, ListaPreciosUploadResult } from '../types'

type ListPage = { items: ListaPrecios[]; total: number; page: number; page_size: number }

export default function ListasPrecios() {
  const qc = useQueryClient()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadResult, setUploadResult] = useState<ListaPreciosUploadResult | null>(null)

  const { data } = useQuery<ListPage>({
    queryKey: ['listas-precios'],
    queryFn: () => api.get('/api/listas-precios/').then(r => r.data),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/listas-precios/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['listas-precios'] }),
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Listas de precios</h1>
        <button className="btn btn-primary" onClick={() => setUploadOpen(true)}>
          Subir nueva lista
        </button>
      </div>

      {uploadResult && (
        <div className="border rounded p-3 bg-green-50 text-sm">
          <div>Lista {uploadResult.lista_id} subida — {uploadResult.productos_actualizados} productos actualizados.</div>
          {uploadResult.skus_sin_producto.length > 0 && (
            <div className="mt-1 text-yellow-800">
              SKUs sin producto en sistema: {uploadResult.skus_sin_producto.join(', ')}
            </div>
          )}
          <div className="text-gray-600">Productos no incluidos: {uploadResult.productos_no_incluidos_count}. Filas inválidas: {uploadResult.filas_invalidas}.</div>
          <button className="text-blue-600 underline text-xs mt-1" onClick={() => setUploadResult(null)}>cerrar</button>
        </div>
      )}

      <table className="min-w-full text-sm border">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left">Fecha</th>
            <th className="px-3 py-2 text-left">Archivo</th>
            <th className="px-3 py-2 text-right">Items</th>
            <th className="px-3 py-2 text-left">Subida por</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map(lp => (
            <tr key={lp.id} className="border-t">
              <td className="px-3 py-2">{new Date(lp.fecha_subida).toLocaleString('es-CL')}</td>
              <td className="px-3 py-2">{lp.nombre_archivo}</td>
              <td className="px-3 py-2 text-right">{lp.total_items}</td>
              <td className="px-3 py-2">{lp.subida_por?.nombre ?? '—'}</td>
              <td className="px-3 py-2 text-center">
                {lp.activa ? <span className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs">Activa</span> : <span className="text-gray-500 text-xs">archivada</span>}
              </td>
              <td className="px-3 py-2 space-x-2 text-right">
                <a className="text-blue-600 underline" href={`/api/listas-precios/${lp.id}/download`} target="_blank" rel="noreferrer">Descargar</a>
                {!lp.activa && (
                  <button className="text-red-600 underline" onClick={() => { if (confirm('Eliminar lista?')) eliminar.mutate(lp.id) }}>
                    Eliminar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onSuccess={(res) => { setUploadResult(res); setUploadOpen(false); qc.invalidateQueries({ queryKey: ['listas-precios'] }) }}
        />
      )}
    </div>
  )
}

function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (res: ListaPreciosUploadResult) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [columnaSku, setColumnaSku] = useState('sku')
  const [columnaCosto, setColumnaCosto] = useState('costo')
  const [error, setError] = useState<string | null>(null)

  const subir = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Seleccione un archivo')
      const fd = new FormData()
      fd.append('archivo', file)
      fd.append('columna_sku', columnaSku)
      fd.append('columna_costo', columnaCosto)
      const r = await api.post('/api/listas-precios/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      return r.data as ListaPreciosUploadResult
    },
    onSuccess,
    onError: (e: any) => setError(e?.response?.data?.detail ?? String(e)),
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-white p-6 rounded shadow max-w-md w-full space-y-3">
        <h2 className="text-lg font-semibold">Subir lista de precios</h2>
        <input type="file" accept=".xlsx,.csv" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">Columna SKU<input className="input" value={columnaSku} onChange={e => setColumnaSku(e.target.value)} /></label>
          <label className="text-sm">Columna Costo<input className="input" value={columnaCosto} onChange={e => setColumnaCosto(e.target.value)} /></label>
        </div>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!file || subir.isPending} onClick={() => subir.mutate()}>
            {subir.isPending ? 'Subiendo...' : 'Subir'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add route**

In `frontend/src/router.tsx`, add:

```tsx
import ListasPrecios from './pages/ListasPrecios'

// inside the routes array:
{ path: '/inventario/listas-precios', element: <ListasPrecios /> },
```

- [ ] **Step 4: Add nav link**

In the nav/sidebar file identified in Step 1, add an entry under the inventario/catálogo group. The link target should be `/inventario/listas-precios`, label `Listas de precios`, and it should only render when the current user's role is `admin`. Follow the existing pattern — do not invent a new one.

- [ ] **Step 5: Manual check**

Start the dev server (`cd frontend && npm run dev` and `cd backend && uvicorn app.main:app --reload`). Log in as admin, navigate to the page, verify:
- Empty state renders
- Upload a sample `.xlsx` file with `sku,costo` headers
- Verify the new lista shows up as active
- Verify upload summary banner appears
- Verify vendedor user does not see the nav link

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ListasPrecios.tsx frontend/src/router.tsx frontend/src/components/layout/
git commit -m "feat(fe): listas de precios page with upload modal"
```

---

### Task 18: ProductoModal — admin-only cost panel + stale indicator + historial tab

**Files:**
- Modify: `frontend/src/components/ProductoModal.tsx`
- Delete: `frontend/src/components/ProductoLotes.tsx`
- Create: `frontend/src/components/ProductoHistorialCostos.tsx`

- [ ] **Step 1: Delete ProductoLotes**

```bash
git rm frontend/src/components/ProductoLotes.tsx frontend/src/components/ProductoLotes.js 2>/dev/null || true
```

- [ ] **Step 2: Update `ProductoModal.tsx`**

In `frontend/src/components/ProductoModal.tsx`:

- Remove the `import ProductoLotes from './ProductoLotes'` line.
- Change `type Tab = 'datos' | 'documentos' | 'historial' | 'lotes'` to `type Tab = 'datos' | 'documentos' | 'historial' | 'historial_costos'`.
- Replace the `lotes` tab button and panel with one for `historial_costos`. Only render the tab button when `isAdmin` is `true`.
- In the `datos` tab, wrap the precio_costo / margen / costo_con_iva section in `{isAdmin && (...)}`. Inside it, add a stale indicator line:

```tsx
{editando?.precio_costo_actualizado_en ? (
  <p className={`text-sm ${editando.costo_desactualizado ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
    Costo actualizado: {new Date(editando.precio_costo_actualizado_en).toLocaleDateString('es-CL')}
    {editando.costo_desactualizado && ' — ⚠ desactualizado'}
  </p>
) : (
  <p className="text-sm text-red-600 font-semibold">Costo nunca actualizado desde una lista</p>
)}
```

- [ ] **Step 3: Create `ProductoHistorialCostos.tsx`**

Create `frontend/src/components/ProductoHistorialCostos.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { HistorialCostoItem } from '../types'

export default function ProductoHistorialCostos({ productoId }: { productoId: number }) {
  const { data, isLoading } = useQuery<HistorialCostoItem[]>({
    queryKey: ['producto-historial-costos', productoId],
    queryFn: () => api.get(`/api/productos/${productoId}/historial-costos`).then(r => r.data),
  })
  if (isLoading) return <div>Cargando…</div>
  if (!data || data.length === 0) return <div className="text-gray-500">Este producto no aparece en ninguna lista de precios.</div>
  return (
    <table className="min-w-full text-sm border">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-3 py-2 text-left">Fecha</th>
          <th className="px-3 py-2 text-right">Costo</th>
          <th className="px-3 py-2 text-left">Lista</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r, idx) => (
          <tr key={idx} className="border-t">
            <td className="px-3 py-2">{new Date(r.fecha_subida).toLocaleString('es-CL')}</td>
            <td className="px-3 py-2 text-right">${Number(r.costo_unitario).toLocaleString('es-CL')}</td>
            <td className="px-3 py-2">
              <a className="text-blue-600 underline" href={`/api/listas-precios/${r.lista_id}/download`} target="_blank" rel="noreferrer">
                {r.nombre_archivo}
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

Wire it into `ProductoModal.tsx`:

```tsx
import ProductoHistorialCostos from './ProductoHistorialCostos'
// ...
{tab === 'historial_costos' && editando && <ProductoHistorialCostos productoId={editando.id} />}
```

- [ ] **Step 4: Manual check**

Start the dev server, edit a producto as admin. Verify:
- Cost fields visible, stale indicator visible
- Historial costos tab shows data after uploading a lista

As vendedor:
- Cost fields hidden
- Historial costos tab hidden

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ProductoModal.tsx frontend/src/components/ProductoHistorialCostos.tsx
git commit -m "feat(fe): admin-only cost panel + stale indicator + historial costos tab"
```

---

### Task 19: Inventario page — stale cost column and filter

**Files:**
- Modify: `frontend/src/pages/Inventario.tsx`

- [ ] **Step 1: Read current Inventario page**

Open `frontend/src/pages/Inventario.tsx` and locate the table column definitions and the filter controls.

- [ ] **Step 2: Add stale column (admin only)**

- Detect `isAdmin` (pattern already used in `ProductoModal.tsx`)
- Add a table column header "Últ. act. costo" visible only when `isAdmin`
- Render days since `precio_costo_actualizado_en`:

```tsx
function diasDesde(iso: string | null | undefined): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  return `${Math.floor(ms / 86400000)}d`
}

// cell:
{isAdmin && (
  <td className={`px-3 py-2 text-right ${p.costo_desactualizado ? 'text-red-600 font-semibold' : ''}`}>
    {diasDesde(p.precio_costo_actualizado_en)}
  </td>
)}
```

- [ ] **Step 3: Add filter "solo costo desactualizado"**

Add a checkbox to the filter bar (admin only):

```tsx
const [soloDesactualizados, setSoloDesactualizados] = useState(false)
// filter the productos list:
const filtrados = productos.filter(p => !soloDesactualizados || p.costo_desactualizado)
// control:
{isAdmin && (
  <label className="text-sm flex items-center gap-1">
    <input type="checkbox" checked={soloDesactualizados} onChange={e => setSoloDesactualizados(e.target.checked)} />
    Solo costo desactualizado
  </label>
)}
```

- [ ] **Step 4: Manual check**

Start the dev server. As admin, verify:
- Column "Últ. act. costo" appears with day counts
- Products with `costo_desactualizado=true` are highlighted
- Filter hides non-stale rows when checked

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Inventario.tsx
git commit -m "feat(fe): stale-cost column and filter in Inventario page"
```

---

### Task 20: Configuración page — `dias_alerta_costo_desactualizado` input

**Files:**
- Modify: `frontend/src/pages/Configuracion.tsx`

- [ ] **Step 1: Read the current Configuración page**

Look for the pattern for existing config inputs (the page already edits keys like `empresa_nombre`).

- [ ] **Step 2: Add the input field**

In the config form, add a numeric input bound to `dias_alerta_costo_desactualizado`:

```tsx
<label className="text-sm block">
  Días para considerar costo desactualizado
  <input
    type="number"
    min={1}
    className="input"
    value={form.dias_alerta_costo_desactualizado ?? '60'}
    onChange={e => setForm({ ...form, dias_alerta_costo_desactualizado: e.target.value })}
  />
</label>
```

Follow the existing save-handler pattern for this page.

- [ ] **Step 3: Manual check**

Start the dev server as admin. Navigate to Configuración, change the value to `30`, save. Verify the value persists on reload. Verify a product with `precio_costo_actualizado_en` ~45 days ago now shows `costo_desactualizado=true` (previously false at 60-day threshold).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Configuracion.tsx
git commit -m "feat(fe): configurable threshold for stale cost alert"
```

---

### Task 21: End-to-end smoke test

- [ ] **Step 1: Run the full backend suite**

```bash
cd backend && pytest
```
Expected: all PASS.

- [ ] **Step 2: Manual end-to-end scenarios (run dev server)**

Log in as admin:
1. Upload `.xlsx` with SKUs `A-1` (50), `A-2` (100). Verify products A-1 and A-2 got the new costs.
2. Upload a second `.xlsx` with only `A-1` (55). Verify A-1 cost updated, A-2 cost unchanged, previous lista shows as "archived".
3. Create an NV with a product whose `precio_costo = 0`. Verify NV enters `pendiente_aprobacion_costo`.
4. As admin, approve the costo. Verify stock decrements and NV estado becomes `pendiente`.
5. Confirm stock delta matches across a full OC → NV round trip.

Log in as vendedor:
6. Verify Listas de Precios nav link hidden, producto cost fields hidden in modals and inventario table.

- [ ] **Step 3: Commit final state (no-op if already clean)**

```bash
git status
```
If anything leaked in, commit with a focused message.

---

## Self-Review Checklist

| Spec item | Task |
|---|---|
| Marca table + CRUD | pre-existing (verify still intact after Phase 5) |
| `marca_id`, `volumen` on Producto | pre-existing |
| `precio_con_iva`, `costo_con_iva` computed | pre-existing |
| `precio_costo_actualizado_en` field | Task 1, 3 |
| `ultimo_costo_unitario` removed | Task 15 |
| ProductoDocumento + PDF upload | pre-existing |
| ListaPrecios + ListaPreciosItem tables | Task 1, 2 |
| Upload endpoint with SKU match + bulk update | Task 6 |
| `filas_invalidas` + `skus_sin_producto` in response | Task 6 |
| Reject duplicate SKUs | Task 5 (parser), Task 6 (endpoint test) |
| Keep cost for products not in new list | Task 6 |
| Refresh `precio_costo_actualizado_en` even if cost unchanged | Task 6 |
| GET listas / activa / detail / items | Task 6 |
| GET listas download | Task 6 |
| DELETE list (only inactive) | Task 6 |
| Historial de costos endpoint | Task 7 |
| Admin-only cost visibility in ProductoOut | Task 9 |
| `costo_desactualizado` computed boolean | Task 9 |
| `dias_alerta_costo_desactualizado` config (default 60) | Task 8 |
| NV costo=0 gate preserved | Task 12 (verify existing behavior still works) |
| Remove FIFO from OC reception | Task 10 |
| Remove FIFO from NV salida | Task 11 |
| Remove FIFO from costo approval | Task 12 |
| Drop LoteCosto model + schema | Task 14 |
| Drop `lotes_costo` table | Task 15 |
| Drop `lote_costo_id` from MovimientoInventario | Task 14, 15 |
| Remove `/productos/{id}/lotes` endpoint | Task 13 |
| Remove `lote_costo_id` column from movimientos CSV | Task 13 |
| Frontend: Listas de Precios page | Task 17 |
| Frontend: admin-only cost panel | Task 18 |
| Frontend: stale cost indicator | Task 18, 19 |
| Frontend: historial de costos tab | Task 18 |
| Frontend: stale cost filter in Inventario | Task 19 |
| Frontend: remove ProductoLotes | Task 18 |
| Frontend: config input for stale threshold | Task 20 |

All spec items covered.
