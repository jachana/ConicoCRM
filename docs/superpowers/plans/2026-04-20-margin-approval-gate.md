# Margin Approval Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block PDF generation and email sending on any cotización whose line prices deviate from catalog, until an admin approves the prices via the margin approval system.

**Architecture:** Backend helper `check_margin_approval_required(db, cotizacion_id)` detects price deviations and checks for an `aprobada` `aprobacion_margen`; it gates the PDF and email endpoints. A new `GET /{id}/margin-status` endpoint exposes blocked state + approval ID to the frontend. A new `revocar` branch on the existing PATCH endpoint lets vendors invalidate an approved request when they change price/qty/client. Frontend fetches status on load, shows a warning banner, disables PDF/email buttons, and shows a confirmation dialog before revoking.

**Tech Stack:** FastAPI, SQLAlchemy, React, TanStack Query, pytest

---

## File Map

| File | Change |
|---|---|
| `backend/app/api/cotizaciones.py` | Add `check_margin_approval_required()` helper, `margin-status` endpoint, gates in PDF + email |
| `backend/app/api/aprobaciones_margen.py` | Add `revocar` action branch |
| `backend/tests/conftest.py` | Add `aprobacion_margen` model import so test DB creates the table |
| `backend/tests/test_margin_gate.py` | New — all backend tests for this feature |
| `frontend/src/pages/CotizacionDetalle.tsx` | Add `marginStatus` state, fetch, warning banner, disabled buttons, revocation dialog |

---

## Task 1: Backend helper + margin-status endpoint

**Files:**
- Modify: `backend/tests/conftest.py`
- Modify: `backend/app/api/cotizaciones.py`
- Create: `backend/tests/test_margin_gate.py`

- [ ] **Step 1: Add aprobacion_margen import to conftest**

In `backend/tests/conftest.py`, inside `setup_test_db` after the line `import app.models.aprobacion_credito  # noqa: F401`, add:

```python
    import app.models.aprobacion_margen  # noqa: F401
```

- [ ] **Step 2: Write failing tests**

Create `backend/tests/test_margin_gate.py`:

```python
import pytest


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_producto(client, token, precio_venta=1000, precio_costo=600):
    r = client.post("/api/productos/", json={
        "nombre": "Prod Gate Test",
        "sku": "SKU-GATE-01",
        "precio_venta": precio_venta,
        "precio_costo": precio_costo,
        "unidad": "un",
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()


def _make_cliente(client, token):
    r = client.post("/api/clientes/", json={"nombre": "Cliente Gate"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()["id"]


def _make_cotizacion(client, token, cliente_id, producto_id, valor_neto):
    r = client.post("/api/cotizaciones/", json={
        "cliente_id": cliente_id,
        "lineas": [{"orden": 1, "descripcion": "Prod Gate Test",
                    "producto_id": producto_id, "cantidad": 1, "valor_neto": valor_neto}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()


def _approve(client, token, cotizacion_id, linea_id, valor_neto):
    r = client.post("/api/aprobaciones_margen/", json={
        "cotizacion_id": cotizacion_id,
        "lineas_propuestas": [{"linea_id": linea_id, "descripcion": "Prod Gate Test",
            "valor_neto_actual": valor_neto, "margen_actual": 0.25,
            "valor_neto_propuesto": valor_neto, "margen_propuesto": 0.25}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    aprobacion_id = r.json()["id"]
    client.patch(f"/api/aprobaciones_margen/{aprobacion_id}",
                 json={"accion": "aprobar"},
                 headers={"Authorization": f"Bearer {token}"})
    return aprobacion_id


# ── margin-status ─────────────────────────────────────────────────────────────

def test_margin_status_no_deviation(client, admin_token):
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=1000)
    r = client.get(f"/api/cotizaciones/{cot['id']}/margin-status",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["blocked"] is False


def test_margin_status_deviation_no_approval(client, admin_token):
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    r = client.get(f"/api/cotizaciones/{cot['id']}/margin-status",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["blocked"] is True
    assert data["estado"] is None
    assert data["aprobacion_id"] is None


def test_margin_status_approved(client, admin_token):
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    linea_id = cot["lineas"][0]["id"]
    aprobacion_id = _approve(client, admin_token, cot["id"], linea_id, 800)
    r = client.get(f"/api/cotizaciones/{cot['id']}/margin-status",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["blocked"] is False
    assert data["estado"] == "aprobada"
    assert data["aprobacion_id"] == aprobacion_id
```

- [ ] **Step 3: Run to confirm tests fail**

```
cd backend && pytest tests/test_margin_gate.py -v
```

Expected: all 3 FAIL with 404 (endpoint does not exist yet).

- [ ] **Step 4: Add import + helper + endpoint to cotizaciones.py**

At the top of `backend/app/api/cotizaciones.py`, add to existing imports:

```python
from app.models.aprobacion_margen import AprobacionMargen
```

After the `_can_edit` function, add:

```python
def check_margin_approval_required(db: Session, cotizacion_id: int) -> bool:
    deviation = (
        db.query(CotizacionLinea)
        .join(Producto, CotizacionLinea.producto_id == Producto.id)
        .filter(
            CotizacionLinea.cotizacion_id == cotizacion_id,
            CotizacionLinea.producto_id.isnot(None),
            CotizacionLinea.valor_neto != Producto.precio_venta,
        )
        .first()
    )
    if not deviation:
        return False
    approved = (
        db.query(AprobacionMargen)
        .filter(
            AprobacionMargen.cotizacion_id == cotizacion_id,
            AprobacionMargen.estado == "aprobada",
        )
        .first()
    )
    return approved is None


@router.get("/{cotizacion_id}/margin-status")
def margin_status(
    cotizacion_id: int,
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    _, db = perms
    cot = db.get(Cotizacion, cotizacion_id)
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    blocked = check_margin_approval_required(db, cotizacion_id)
    aprobacion = (
        db.query(AprobacionMargen)
        .filter(AprobacionMargen.cotizacion_id == cotizacion_id)
        .order_by(AprobacionMargen.created_at.desc())
        .first()
    )
    return {
        "blocked": blocked,
        "estado": aprobacion.estado if aprobacion else None,
        "aprobacion_id": aprobacion.id if aprobacion else None,
    }
```

Place `check_margin_approval_required` and the `margin-status` route immediately after the `_can_edit` function and before the `exportar_excel` route.

- [ ] **Step 5: Run tests to confirm they pass**

```
cd backend && pytest tests/test_margin_gate.py::test_margin_status_no_deviation tests/test_margin_gate.py::test_margin_status_deviation_no_approval tests/test_margin_gate.py::test_margin_status_approved -v
```

Expected: all 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/conftest.py backend/app/api/cotizaciones.py backend/tests/test_margin_gate.py
git commit -m "feat: add check_margin_approval_required helper and margin-status endpoint"
```

---

## Task 2: Gate PDF and email endpoints

**Files:**
- Modify: `backend/app/api/cotizaciones.py`
- Modify: `backend/tests/test_margin_gate.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_margin_gate.py`:

```python
# ── PDF gate ──────────────────────────────────────────────────────────────────

def test_pdf_blocked_when_deviation(client, admin_token, vendedor_token):
    """Non-admin with modified price → PDF 403."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    r = client.get(f"/api/cotizaciones/{cot['id']}/pdf",
                   headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403
    assert "margen" in r.json()["detail"].lower()


def test_pdf_allowed_at_catalog_price(client, admin_token, vendedor_token):
    """Catalog price → PDF 200."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=1000)
    r = client.get(f"/api/cotizaciones/{cot['id']}/pdf",
                   headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


def test_pdf_allowed_after_approval(client, admin_token, vendedor_token):
    """Approved aprobacion → PDF 200."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    linea_id = cot["lineas"][0]["id"]
    _approve(client, admin_token, cot["id"], linea_id, 800)
    r = client.get(f"/api/cotizaciones/{cot['id']}/pdf",
                   headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


def test_pdf_admin_bypasses_gate(client, admin_token):
    """Admin can always generate PDF regardless of deviations."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    r = client.get(f"/api/cotizaciones/{cot['id']}/pdf",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ── Email gate ────────────────────────────────────────────────────────────────

def test_email_blocked_when_deviation(client, admin_token, vendedor_token):
    """Non-admin with modified price → email 403."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    r = client.post(f"/api/cotizaciones/{cot['id']}/email",
                    headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403
    assert "margen" in r.json()["detail"].lower()


def test_email_admin_bypasses_gate(client, admin_token):
    """Admin can always send email regardless of deviations."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    r = client.post(f"/api/cotizaciones/{cot['id']}/email",
                    headers={"Authorization": f"Bearer {admin_token}"})
    # 503 = email not configured in test env — that's fine, gate was passed
    assert r.status_code in (200, 503)
```

- [ ] **Step 2: Run to confirm they fail**

```
cd backend && pytest tests/test_margin_gate.py -k "pdf or email" -v
```

Expected: all FAIL (no gate checks yet).

- [ ] **Step 3: Add gate to PDF endpoint**

In `backend/app/api/cotizaciones.py`, in `generar_pdf`, change `_, db = perms` to `current_user, db = perms`, then add after the 404 check:

```python
    if current_user.role not in ("admin", "subadmin") and check_margin_approval_required(db, cotizacion_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requiere aprobación de márgenes",
        )
```

- [ ] **Step 4: Add gate to email endpoint**

In `enviar_email`, change `_, db = perms` to `current_user, db = perms`, then add after the 404 check:

```python
    if current_user.role not in ("admin", "subadmin") and check_margin_approval_required(db, cotizacion_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requiere aprobación de márgenes",
        )
```

- [ ] **Step 5: Run tests**

```
cd backend && pytest tests/test_margin_gate.py -v
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/cotizaciones.py backend/tests/test_margin_gate.py
git commit -m "feat: gate PDF and email on margin approval for non-admins"
```

---

## Task 3: Add revocar action to aprobaciones_margen

**Files:**
- Modify: `backend/app/api/aprobaciones_margen.py`
- Modify: `backend/tests/test_margin_gate.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_margin_gate.py`:

```python
# ── revocar ───────────────────────────────────────────────────────────────────

def test_revocar_aprobacion(client, admin_token):
    """Revoking an approved request → estado becomes revocada."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    linea_id = cot["lineas"][0]["id"]
    aprobacion_id = _approve(client, admin_token, cot["id"], linea_id, 800)
    r = client.patch(f"/api/aprobaciones_margen/{aprobacion_id}",
                     json={"accion": "revocar"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["estado"] == "revocada"


def test_revocar_pendiente_fails(client, admin_token):
    """Cannot revoke a non-approved (pendiente) request."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    linea_id = cot["lineas"][0]["id"]
    r = client.post("/api/aprobaciones_margen/", json={
        "cotizacion_id": cot["id"],
        "lineas_propuestas": [{"linea_id": linea_id, "descripcion": "Prod Gate Test",
            "valor_neto_actual": 800, "margen_actual": 0.25,
            "valor_neto_propuesto": 800, "margen_propuesto": 0.25}],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    aprobacion_id = r.json()["id"]
    r = client.patch(f"/api/aprobaciones_margen/{aprobacion_id}",
                     json={"accion": "revocar"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 409


def test_pdf_blocked_after_revocar(client, admin_token, vendedor_token):
    """Revoked approval → PDF blocked again."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    linea_id = cot["lineas"][0]["id"]
    aprobacion_id = _approve(client, admin_token, cot["id"], linea_id, 800)
    client.patch(f"/api/aprobaciones_margen/{aprobacion_id}",
                 json={"accion": "revocar"},
                 headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get(f"/api/cotizaciones/{cot['id']}/pdf",
                   headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403
```

- [ ] **Step 2: Run to confirm they fail**

```
cd backend && pytest tests/test_margin_gate.py::test_revocar_aprobacion tests/test_margin_gate.py::test_revocar_pendiente_fails tests/test_margin_gate.py::test_pdf_blocked_after_revocar -v
```

Expected: `test_revocar_aprobacion` FAIL (no revocar branch), others may vary.

- [ ] **Step 3: Replace accionar_solicitud_margen in aprobaciones_margen.py**

Replace the entire `accionar_solicitud_margen` function in `backend/app/api/aprobaciones_margen.py` with:

```python
@router.patch("/{aprobacion_id}", response_model=AprobacionMargenOut)
def accionar_solicitud_margen(
    aprobacion_id: int,
    body: AprobacionMargenAccion,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    a = _load(db, aprobacion_id)

    if body.accion == "revocar":
        if a.vendedor_id != current_user.id and current_user.role not in ("admin", "subadmin"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
        if a.estado != "aprobada":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                detail="Solo se pueden revocar solicitudes aprobadas")
        a.estado = "revocada"
        db.commit()
        return _load(db, a.id)

    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Solo administradores pueden aprobar o denegar")
    if a.estado != "pendiente":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="La solicitud ya fue procesada")

    if body.accion == "denegar":
        a.estado = "denegada"
        db.commit()
        return _load(db, a.id)

    if body.accion != "aprobar":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Acción inválida")

    cot = (
        db.query(Cotizacion)
        .options(joinedload(Cotizacion.lineas))
        .filter(Cotizacion.id == a.cotizacion_id)
        .first()
    )
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")

    lineas_data = json.loads(a.lineas_propuestas)
    lineas_by_id = {l.id: l for l in cot.lineas}

    for item in lineas_data:
        linea = lineas_by_id.get(item["linea_id"])
        if not linea:
            continue
        nuevo_vn = Decimal(str(item["valor_neto_propuesto"]))
        linea.valor_neto = nuevo_vn
        linea.total_neto = linea.cantidad * nuevo_vn
        linea.iva = round(linea.total_neto * Decimal("0.19"), 2)
        linea.total = linea.total_neto + linea.iva
        if linea.producto_id and nuevo_vn > 0:
            from app.models.producto import Producto
            prod = db.get(Producto, linea.producto_id)
            if prod:
                linea.margen = (nuevo_vn - prod.precio_costo) / nuevo_vn

    cot.total_neto = sum(l.total_neto for l in cot.lineas)
    cot.total_iva = sum(l.iva for l in cot.lineas)
    cot.total = sum(l.total for l in cot.lineas)

    a.estado = "aprobada"
    db.commit()
    return _load(db, a.id)
```

- [ ] **Step 4: Run full test suite**

```
cd backend && pytest -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/aprobaciones_margen.py backend/tests/test_margin_gate.py
git commit -m "feat: add revocar action to aprobaciones_margen"
```

---

## Task 4: Frontend — margin-status state, warning banner, disabled buttons

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`

- [ ] **Step 1: Add marginStatus state**

After the `creditModal` state declaration (around line 86), add:

```typescript
const [marginStatus, setMarginStatus] = useState<{
  blocked: boolean
  estado: 'pendiente' | 'aprobada' | 'denegada' | 'revocada' | null
  aprobacion_id: number | null
} | null>(null)
```

- [ ] **Step 2: Fetch margin-status on page load**

After the `cotizacion` query (`const { data: cotizacion }`, around line 88), add:

```typescript
useEffect(() => {
  if (isNew || isAdmin) return
  api.get(`/api/cotizaciones/${id}/margin-status`)
    .then(r => setMarginStatus(r.data))
    .catch(() => {})
}, [id, isNew, isAdmin])
```

- [ ] **Step 3: Add warning banner**

In the JSX, after the `{error && <div ...>}` error block (around line 403), add:

```tsx
{!isAdmin && marginStatus?.blocked && (
  <div className={`mb-4 px-4 py-3 rounded-lg text-sm border flex items-center gap-2 ${
    marginStatus.estado === 'pendiente'
      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
      : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
  }`}>
    {marginStatus.estado === 'pendiente'
      ? 'Precios modificados — solicitud de aprobación pendiente. PDF y email deshabilitados.'
      : 'Precios modificados requieren aprobación antes de generar PDF o enviar email.'}
  </div>
)}
```

- [ ] **Step 4: Disable PDF button when blocked**

Find the PDF button (around line 369). Replace it with:

```tsx
<button
  onClick={() => openPdf(`/api/cotizaciones/${id}/pdf`)}
  disabled={!isAdmin && !!marginStatus?.blocked}
  title={!isAdmin && marginStatus?.blocked ? 'Requiere aprobación de márgenes' : undefined}
  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
>
  <FileText size={15} />
  PDF
</button>
```

- [ ] **Step 5: Disable Email button when blocked**

Find the Email button (around line 376). Replace it with:

```tsx
<button
  onClick={() => emailMut.mutate()}
  disabled={emailMut.isPending || (!isAdmin && !!marginStatus?.blocked)}
  title={!isAdmin && marginStatus?.blocked ? 'Requiere aprobación de márgenes' : undefined}
  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
>
  <Mail size={15} />
  {emailMut.isPending ? 'Enviando...' : 'Email'}
</button>
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/CotizacionDetalle.tsx
git commit -m "feat: show margin approval warning banner and disable PDF/email when blocked"
```

---

## Task 5: Frontend — revocation confirmation dialog

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`

- [ ] **Step 1: Add revokeDialog state**

After the `marginStatus` state declaration, add:

```typescript
const [revokeDialog, setRevokeDialog] = useState<{ pendingChange: () => void } | null>(null)
```

- [ ] **Step 2: Add withRevokeGuard and confirmRevoke**

After the `removeLinea` function (around line 211), add:

```typescript
function withRevokeGuard(change: () => void) {
  if (!isAdmin && marginStatus?.estado === 'aprobada') {
    setRevokeDialog({ pendingChange: change })
  } else {
    change()
  }
}

async function confirmRevoke() {
  if (!revokeDialog || !marginStatus?.aprobacion_id) return
  revokeDialog.pendingChange()
  setRevokeDialog(null)
  try {
    await api.patch(`/api/aprobaciones_margen/${marginStatus.aprobacion_id}`, { accion: 'revocar' })
  } catch {
    // server error — local state still updated optimistically
  }
  setMarginStatus(prev => prev ? { ...prev, blocked: true, estado: 'revocada' } : prev)
}
```

- [ ] **Step 3: Wrap handleValorNetoChange**

Replace the `handleValorNetoChange` function body with:

```typescript
function handleValorNetoChange(idx: number, val: string) {
  withRevokeGuard(() => setLineas(prev => prev.map((l, i) => {
    if (i !== idx) return l
    const vn = Math.max(0, parseFloat(val) || 0)
    const newMargen = l._costo != null && vn > 0 ? (vn - l._costo) / vn : l.margen
    return calcLinea({ ...l, valor_neto: vn, margen: newMargen })
  })))
}
```

- [ ] **Step 4: Wrap cantidad onChange**

Find the cantidad input `onChange` (around line 524):
```tsx
onChange={e => updateLinea(idx, { cantidad: Math.max(1, parseInt(e.target.value) || 1) })}
```
Replace with:
```tsx
onChange={e => withRevokeGuard(() => updateLinea(idx, { cantidad: Math.max(1, parseInt(e.target.value) || 1) }))}
```

- [ ] **Step 5: Wrap handleClienteChange**

Replace the `handleClienteChange` function with:

```typescript
function handleClienteChange(cid: number | '') {
  withRevokeGuard(() => {
    setClienteId(cid)
    if (cid) {
      const c = clientes.find(cl => cl.id === cid)
      if (c) {
        setContacto(c.nombre)
        setCorreo(c.email ?? '')
        if (c.empresa_id) setEmpresaId(c.empresa_id)
      }
    }
  })
}
```

- [ ] **Step 6: Add revocation dialog JSX**

After the `emailToast` toast block at the bottom of the JSX (around line 594), add:

```tsx
{revokeDialog && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 max-w-md w-full mx-4 shadow-xl">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
        Revocar aprobación de márgenes
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
        Esta cotización tiene aprobación de márgenes vigente. Modificarla revocará la aprobación y bloqueará el PDF y email. ¿Continuar?
      </p>
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setRevokeDialog(null)}
          className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={confirmRevoke}
          className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
        >
          Continuar
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/CotizacionDetalle.tsx
git commit -m "feat: add revocation confirmation dialog for approved margin requests"
```
