# Credit Limit NV Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block non-admin users from creating Nota de Venta when the total exceeds the empresa's available credit limit; admins see a confirmation popup and can override.

**Architecture:** Backend adds a `_check_credit_limit` helper to `nota_ventas.py` that raises HTTP 402 for non-admins over the limit; frontend branches `NotaVentaDetalle` modal mode on `isAdmin` — admins get `mode="warning"` (confirm and save), vendors get `mode="request"` (send approval).

**Tech Stack:** FastAPI + SQLAlchemy (backend), React + TypeScript (frontend), pytest (tests)

---

## File Map

| File | Action |
|------|--------|
| `backend/app/api/nota_ventas.py` | Add `_check_credit_limit` helper; call it in `crear_nv` and `crear_nv_desde_cotizacion` |
| `backend/tests/test_nv_credit_limit.py` | New test file — backend enforcement tests |
| `frontend/src/pages/NotaVentaDetalle.tsx` | Branch modal mode on `isAdmin`; pass `onConfirm` for admin path |

---

### Task 1: Backend helper + enforcement in `crear_nv`

**Files:**
- Modify: `backend/app/api/nota_ventas.py`
- Create: `backend/tests/test_nv_credit_limit.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_nv_credit_limit.py` with this content:

```python
from datetime import date
from decimal import Decimal
import random


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_cliente(db):
    from app.models.cliente import Cliente
    c = Cliente(nombre="Test Cliente")
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _make_empresa(db, limite_credito=None):
    from app.models.empresa import Empresa
    e = Empresa(nombre="Test Empresa", limite_credito=limite_credito)
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def _make_producto(db):
    from app.models.producto import Producto
    p = Producto(nombre="Prod Test", precio_costo=Decimal("500"))
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _make_factura(db, empresa_id, cliente_id, total, monto_pagado=None):
    from app.models.factura import Factura
    f = Factura(
        numero=random.randint(10000, 99999),
        cliente_id=cliente_id,
        empresa_id=empresa_id,
        total=Decimal(str(total)),
        monto_pagado=Decimal(str(monto_pagado)) if monto_pagado is not None else None,
        estado="emitida",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _nv_payload(cliente_id, empresa_id, producto_id, valor_neto):
    return {
        "cliente_id": cliente_id,
        "empresa_id": empresa_id,
        "fecha": str(date.today()),
        "lineas": [{
            "orden": 1,
            "producto_id": producto_id,
            "descripcion": "Test item",
            "cantidad": 1,
            "valor_neto": valor_neto,
        }],
    }


# ── tests ─────────────────────────────────────────────────────────────────────

def test_vendedor_blocked_over_credit_limit(client, vendedor_token, vendedor_user, db):
    """Vendedor cannot create NV when total exceeds credito_disponible."""
    cliente = _make_cliente(db)
    empresa = _make_empresa(db, limite_credito=Decimal("100000"))
    producto = _make_producto(db)
    # 90000 of credit already used via unpaid factura
    _make_factura(db, empresa.id, cliente.id, total=90000)
    # NV valor_neto=10000 → total_con_iva=11900, which exceeds disponible (10000)
    resp = client.post(
        "/api/nota_ventas/",
        json=_nv_payload(cliente.id, empresa.id, producto.id, 10000),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 402
    assert "crédito" in resp.json()["detail"].lower()


def test_vendedor_allowed_within_credit_limit(client, vendedor_token, vendedor_user, db):
    """Vendedor can create NV when total is within credito_disponible."""
    cliente = _make_cliente(db)
    empresa = _make_empresa(db, limite_credito=Decimal("100000"))
    producto = _make_producto(db)
    _make_factura(db, empresa.id, cliente.id, total=50000)
    # NV valor_neto=1000 → total=1190, within disponible (50000)
    resp = client.post(
        "/api/nota_ventas/",
        json=_nv_payload(cliente.id, empresa.id, producto.id, 1000),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 201


def test_admin_bypasses_credit_limit(client, admin_token, admin_user, db):
    """Admin can create NV even when over credit limit."""
    cliente = _make_cliente(db)
    empresa = _make_empresa(db, limite_credito=Decimal("1000"))
    producto = _make_producto(db)
    _make_factura(db, empresa.id, cliente.id, total=1000)
    # Credit is fully used, but admin can still create
    resp = client.post(
        "/api/nota_ventas/",
        json=_nv_payload(cliente.id, empresa.id, producto.id, 50000),
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201


def test_no_limit_set_vendedor_can_create(client, vendedor_token, vendedor_user, db):
    """Vendedor can create NV freely when empresa has no limite_credito."""
    cliente = _make_cliente(db)
    empresa = _make_empresa(db, limite_credito=None)
    producto = _make_producto(db)
    resp = client.post(
        "/api/nota_ventas/",
        json=_nv_payload(cliente.id, empresa.id, producto.id, 999999),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 201
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && pytest tests/test_nv_credit_limit.py -v --tb=short -q
```

Expected: 4 failures — `_check_credit_limit` doesn't exist yet.

- [ ] **Step 3: Add imports to `nota_ventas.py`**

At the top of `backend/app/api/nota_ventas.py`, after the existing model imports (around line 18), add:

```python
from app.models.empresa import Empresa
from app.models.factura import Factura
```

- [ ] **Step 4: Add `_check_credit_limit` helper to `nota_ventas.py`**

After the `_can_edit` function (around line 101), insert:

```python
def _check_credit_limit(db: Session, empresa_id: int | None, total: Decimal, current_user: User) -> None:
    if current_user.role in ("admin", "subadmin"):
        return
    if not empresa_id:
        return
    empresa = db.get(Empresa, empresa_id)
    if not empresa or empresa.limite_credito is None:
        return
    facturas = (
        db.query(Factura)
        .filter(Factura.empresa_id == empresa_id, Factura.estado != "anulada")
        .all()
    )
    credito_usado = sum(
        (f.total - (f.monto_pagado or Decimal("0"))
         for f in facturas
         if f.total - (f.monto_pagado or Decimal("0")) > 0),
        Decimal("0"),
    )
    credito_disponible = empresa.limite_credito - credito_usado
    if total > credito_disponible:
        raise HTTPException(
            status_code=402,
            detail=f"Límite de crédito excedido. Disponible: {credito_disponible}, solicitado: {total}",
        )
```

- [ ] **Step 5: Call the helper in `crear_nv`**

In `crear_nv` (around line 259), after `_recalcular_totales(nv)` and before `_registrar_movimientos_salida`, insert the call:

```python
    _recalcular_totales(nv)
    _check_credit_limit(db, nv.empresa_id, nv.total, current_user)  # ← add this line
    _registrar_movimientos_salida(db, nv.id, nv.lineas, current_user.id)
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
cd backend && pytest tests/test_nv_credit_limit.py -v --tb=short -q
```

Expected: 4 passed.

- [ ] **Step 7: Run the full test suite to catch regressions**

```bash
cd backend && pytest -q --tb=short
```

Expected: all existing tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/nota_ventas.py backend/tests/test_nv_credit_limit.py
git commit -m "feat(nv): block vendedor NV creation when over empresa credit limit"
```

---

### Task 2: Enforce credit limit in `crear_nv_desde_cotizacion`

**Files:**
- Modify: `backend/app/api/nota_ventas.py`
- Modify: `backend/tests/test_nv_credit_limit.py`

- [ ] **Step 1: Add tests for the `from_cotizacion` endpoint**

Append to `backend/tests/test_nv_credit_limit.py`:

```python
# ── from_cotizacion tests ─────────────────────────────────────────────────────

def _make_cotizacion_with_product(db, cliente_id, vendedor_id, empresa_id, producto_id, linea_total):
    """Create a cotizacion with one linea that has a producto_id."""
    from app.models.cotizacion import Cotizacion, CotizacionLinea
    cot = Cotizacion(
        numero=random.randint(10000, 99999),
        cliente_id=cliente_id,
        vendedor_id=vendedor_id,
        empresa_id=empresa_id,
        fecha=date.today(),
        total=Decimal(str(linea_total)),
    )
    db.add(cot)
    db.flush()
    total = Decimal(str(linea_total))
    total_neto = (total / Decimal("1.19")).quantize(Decimal("0.01"))
    iva = total - total_neto
    linea = CotizacionLinea(
        cotizacion_id=cot.id,
        orden=1,
        producto_id=producto_id,
        descripcion="Test item",
        cantidad=1,
        valor_neto=total_neto,
        total_neto=total_neto,
        iva=iva,
        total=total,
    )
    db.add(linea)
    db.commit()
    db.refresh(cot)
    return cot


def test_vendedor_blocked_from_cotizacion_over_limit(client, vendedor_token, vendedor_user, db):
    """Vendedor cannot convert cotizacion to NV when it exceeds credito_disponible."""
    cliente = _make_cliente(db)
    empresa = _make_empresa(db, limite_credito=Decimal("100000"))
    producto = _make_producto(db)
    _make_factura(db, empresa.id, cliente.id, total=90000)
    # Cotizacion total (with IVA) = 11900, disponible = 10000 → blocked
    cot = _make_cotizacion_with_product(
        db, cliente.id, vendedor_user.id, empresa.id, producto.id, linea_total=11900
    )
    resp = client.post(
        f"/api/nota_ventas/from_cotizacion/{cot.id}",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 402
    assert "crédito" in resp.json()["detail"].lower()


def test_admin_bypasses_credit_from_cotizacion(client, admin_token, admin_user, db):
    """Admin can convert cotizacion to NV even when over credit limit."""
    cliente = _make_cliente(db)
    empresa = _make_empresa(db, limite_credito=Decimal("1000"))
    producto = _make_producto(db)
    _make_factura(db, empresa.id, cliente.id, total=1000)
    cot = _make_cotizacion_with_product(
        db, cliente.id, admin_user.id, empresa.id, producto.id, linea_total=50000
    )
    resp = client.post(
        f"/api/nota_ventas/from_cotizacion/{cot.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd backend && pytest tests/test_nv_credit_limit.py::test_vendedor_blocked_from_cotizacion_over_limit tests/test_nv_credit_limit.py::test_admin_bypasses_credit_from_cotizacion -v --tb=short
```

Expected: 2 failures.

- [ ] **Step 3: Apply the helper in `crear_nv_desde_cotizacion`**

In `crear_nv_desde_cotizacion` (around line 313), after `_recalcular_totales(nv)` and before `cot.estado = "cerrada_fv"`, insert:

```python
    _recalcular_totales(nv)
    _check_credit_limit(db, nv.empresa_id, nv.total, current_user)  # ← add this line
    cot.estado = "cerrada_fv"
```

- [ ] **Step 4: Run all credit limit tests**

```bash
cd backend && pytest tests/test_nv_credit_limit.py -v --tb=short
```

Expected: 6 passed.

- [ ] **Step 5: Run full test suite**

```bash
cd backend && pytest -q --tb=short
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/nota_ventas.py backend/tests/test_nv_credit_limit.py
git commit -m "feat(nv): enforce credit limit in from_cotizacion endpoint"
```

---

### Task 3: Frontend — admin confirmation popup vs vendor request

**Files:**
- Modify: `frontend/src/pages/NotaVentaDetalle.tsx`

Context: `isAdmin` is already defined at line 106. `creditModal` state is at line 120. `CreditWarningModal` is rendered at line 695. Currently it always uses `mode="request"`.

- [ ] **Step 1: Update `creditModal` state type to support admin override**

At line 120, change the state type to include an `adminOverride` flag:

```typescript
  const [creditModal, setCreditModal] = useState<{
    credito: CreditoInfo
    aprobacionPayload?: AprobacionPayload
    adminOverride?: boolean
  } | null>(null)
```

- [ ] **Step 2: Update `checkCredit` to branch on `isAdmin`**

At line 264 (inside the `if (credito.credito_disponible !== null && ...)` branch), replace the existing `setCreditModal` call with:

```typescript
      if (credito.credito_disponible !== null && Number(credito.credito_disponible) < saleTotal) {
        setCreditModal({
          credito,
          aprobacionPayload: isAdmin ? undefined : aprobacionPayload,
          adminOverride: isAdmin,
        })
      } else {
        onProceed()
      }
```

- [ ] **Step 3: Update `CreditWarningModal` usage to branch on `isAdmin`**

At line 695, replace the existing `<CreditWarningModal ...>` block with:

```tsx
      {creditModal && (
        <CreditWarningModal
          mode={creditModal.adminOverride ? 'warning' : 'request'}
          empresaNombre={empresas.find(e => e.id === empresaId)?.nombre ?? ''}
          credito={creditModal.credito}
          saleTotal={total}
          onConfirm={creditModal.adminOverride ? () => { setCreditModal(null); doSave() } : undefined}
          aprobacionPayload={creditModal.aprobacionPayload}
          onSubmitted={() => setCreditModal(null)}
          onCancel={() => setCreditModal(null)}
        />
      )}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /c/Otros/Conico/frontend && ./node_modules/.bin/tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "C:/Otros/Conico/frontend/src/pages/NotaVentaDetalle.tsx"
git commit -m "feat(nv): admin gets confirmation popup on credit limit, vendor is blocked"
```

- [ ] **Step 6: Push**

```bash
git push
```
