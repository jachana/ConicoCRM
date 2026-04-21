# DTE Import Empresa Suggestion + Facturas Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a DTE XML import fails because the empresa RUT is not found, return structured error data so the UI can offer a pre-filled "Create empresa" link; also remove the standalone Facturas page since Cobranza already covers it.

**Architecture:** Backend changes flow through xml_dte.py (parser) → cobranza schema (ImportXMLError) → facturas API (bulk import). Frontend changes: Cobranza renders a link on RUT-not-found errors, Empresas reads URL params to pre-fill its create modal, router/sidebar drop the Facturas list route.

**Tech Stack:** FastAPI/SQLAlchemy (backend), React + React Router + TanStack Query (frontend), pytest (tests)

---

### Task 1: Extract `nombre_receptor` in xml_dte.py

**Files:**
- Modify: `backend/app/services/xml_dte.py:77-79`
- Modify: `backend/tests/test_xml_dte.py`

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_xml_dte.py`, add at the end of the file:

```python
def test_parse_dte33_nombre_receptor():
    result = parse_dte_xml(SAMPLE_DTE_33)
    assert result["nombre_receptor"] == "Cliente Empresa Ltda."


def test_parse_dte_nombre_receptor_absent():
    xml = SAMPLE_DTE_33.replace(
        b"<RznSocRecep>Cliente Empresa Ltda.</RznSocRecep>", b""
    )
    result = parse_dte_xml(xml)
    assert result["nombre_receptor"] is None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
docker compose exec backend pytest tests/test_xml_dte.py::test_parse_dte33_nombre_receptor -v
```

Expected: `FAILED — KeyError: 'nombre_receptor'`

- [ ] **Step 3: Implement extraction in xml_dte.py**

In `backend/app/services/xml_dte.py`, after line 78 (`rut_receptor = _text(receptor, "RUTRecep")`), add:

```python
    nombre_receptor = _text(receptor, "RznSocRecep")
```

Then in the return dict (currently starting at line 108), add `nombre_receptor` after `rut_receptor`:

```python
    return {
        "tipo_dte": tipo_dte,
        "numero": int(folio_str),
        "fecha": date.fromisoformat(fecha_str),
        "fecha_vencimiento": date.fromisoformat(fch_venc_str) if fch_venc_str else None,
        "rut_receptor": rut_receptor,
        "nombre_receptor": nombre_receptor,
        "correo_receptor": _text(receptor, "CorreoRecep"),
        "total_neto": mnt_neto,
        "total_iva": iva,
        "total": mnt_total,
        "lineas": lineas,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
docker compose exec backend pytest tests/test_xml_dte.py -v
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/xml_dte.py backend/tests/test_xml_dte.py
git commit -m "feat(xml_dte): extract nombre_receptor (RznSocRecep) from DTE XML"
```

---

### Task 2: Add `empresa_data` to ImportXMLError schema

**Files:**
- Modify: `backend/app/schemas/cobranza.py:66-68`

- [ ] **Step 1: Update ImportXMLError**

In `backend/app/schemas/cobranza.py`, change the `ImportXMLError` class from:

```python
class ImportXMLError(BaseModel):
    filename: str
    message: str
```

to:

```python
class ImportXMLError(BaseModel):
    filename: str
    message: str
    empresa_data: dict | None = None
```

- [ ] **Step 2: Run existing tests to verify no regressions**

```bash
docker compose exec backend pytest tests/ -v -k "factura or cobranza or xml"
```

Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/cobranza.py
git commit -m "feat(schema): add optional empresa_data field to ImportXMLError"
```

---

### Task 3: Return structured error from `_upsert_from_xml` + handle in `import_xml_bulk`

**Files:**
- Modify: `backend/app/api/facturas.py:116-120` (the empresa not found block)
- Modify: `backend/app/api/facturas.py:330-355` (import_xml_bulk catch block)
- Modify: `backend/tests/test_facturas.py`

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_facturas.py`, add an import at the top and a new test. First check what fixtures are available by looking at the existing test file header — use the same `client` and `admin_token` pattern already in use.

Add to `backend/tests/test_facturas.py`:

```python
def test_import_xml_bulk_empresa_not_found_returns_empresa_data(client, admin_token):
    xml = b"""<?xml version="1.0" encoding="ISO-8859-1"?>
<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0">
  <Documento ID="DTE-33-99999">
    <Encabezado>
      <IdDoc>
        <TipoDTE>33</TipoDTE>
        <Folio>99999</Folio>
        <FchEmis>2024-01-15</FchEmis>
      </IdDoc>
      <Emisor><RUTEmisor>11111111-1</RUTEmisor></Emisor>
      <Receptor>
        <RUTRecep>99999999-9</RUTRecep>
        <RznSocRecep>Empresa Fantasma S.A.</RznSocRecep>
        <CorreoRecep>fantasma@test.cl</CorreoRecep>
      </Receptor>
      <Totales>
        <MntNeto>1000</MntNeto>
        <TasaIVA>19</TasaIVA>
        <IVA>190</IVA>
        <MntTotal>1190</MntTotal>
      </Totales>
      <Detalle>
        <NroLinDet>1</NroLinDet>
        <NmbItem>Item</NmbItem>
        <QtyItem>1</QtyItem>
        <PrcItem>1000</PrcItem>
        <MontoItem>1000</MontoItem>
      </Detalle>
    </Encabezado>
  </Documento>
</DTE>"""
    files = [("files", ("test.xml", xml, "application/xml"))]
    resp = client.post(
        "/api/facturas/import/xml/bulk",
        files=files,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["creadas"] == 0
    assert len(data["errores"]) == 1
    error = data["errores"][0]
    assert "99999999-9" in error["message"]
    assert error["empresa_data"] is not None
    assert error["empresa_data"]["rut"] == "99999999-9"
    assert error["empresa_data"]["nombre"] == "Empresa Fantasma S.A."
    assert error["empresa_data"]["email"] == "fantasma@test.cl"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
docker compose exec backend pytest tests/test_facturas.py::test_import_xml_bulk_empresa_not_found_returns_empresa_data -v
```

Expected: `FAILED — assert error["empresa_data"] is not None`  (currently returns `None` since schema has no such field yet, or the field is absent)

- [ ] **Step 3: Update `_upsert_from_xml` in facturas.py**

In `backend/app/api/facturas.py`, replace lines 116-120:

```python
    if empresa is None:
        raise HTTPException(
            status_code=422,
            detail=f"Empresa con RUT {parsed['rut_receptor']} no encontrada en el sistema",
        )
```

with:

```python
    if empresa is None:
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"Empresa con RUT {parsed['rut_receptor']} no encontrada en el sistema",
                "empresa_data": {
                    "rut": parsed["rut_receptor"],
                    "nombre": parsed.get("nombre_receptor") or "",
                    "email": parsed.get("correo_receptor") or "",
                },
            },
        )
```

- [ ] **Step 4: Update `import_xml_bulk` error handler in facturas.py**

In the `import_xml_bulk` function, replace the `except HTTPException` block:

```python
        except HTTPException as exc:
            errores.append(ImportXMLError(filename=f.filename or "unknown", message=exc.detail))
```

with:

```python
        except HTTPException as exc:
            if isinstance(exc.detail, dict):
                errores.append(ImportXMLError(
                    filename=f.filename or "unknown",
                    message=exc.detail["message"],
                    empresa_data=exc.detail.get("empresa_data"),
                ))
            else:
                errores.append(ImportXMLError(
                    filename=f.filename or "unknown",
                    message=exc.detail,
                ))
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
docker compose exec backend pytest tests/test_facturas.py::test_import_xml_bulk_empresa_not_found_returns_empresa_data -v
```

Expected: PASS

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
docker compose exec backend pytest tests/ -v
```

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/facturas.py backend/tests/test_facturas.py
git commit -m "feat(facturas): return empresa_data in bulk XML import error when RUT not found"
```

---

### Task 4: Frontend — Cobranza ImportModal shows "Crear empresa →" link

**Files:**
- Modify: `frontend/src/pages/Cobranza.tsx` (ImportModal error rendering, ~lines 291-296)

- [ ] **Step 1: Update ImportModal error type and rendering**

In `frontend/src/pages/Cobranza.tsx`, find the type or interface for import errors (search for `ImportXMLError` or `errores` in the file). Add `empresa_data` to it. If it's an inline type, update it to:

```typescript
type ImportError = {
  filename: string
  message: string
  empresa_data?: {
    rut: string
    nombre: string
    email: string
  } | null
}
```

Then find the error rendering block (currently around line 291-296):

```tsx
{result.errores.map((e, i) => (
  <p key={i} className="text-xs text-red-500">{e.filename}: {e.message}</p>
))}
```

Replace it with:

```tsx
{result.errores.map((e, i) => (
  <div key={i} className="text-xs text-red-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
    <span>{e.filename}: {e.message}</span>
    {e.empresa_data && (
      <Link
        to={`/empresas?create=true&rut=${encodeURIComponent(e.empresa_data.rut)}&nombre=${encodeURIComponent(e.empresa_data.nombre)}&email=${encodeURIComponent(e.empresa_data.email)}`}
        className="text-blue-500 underline whitespace-nowrap hover:text-blue-400"
      >
        Crear empresa →
      </Link>
    )}
  </div>
))}
```

Make sure `Link` is imported from `react-router-dom` at the top of the file. If it isn't already imported, add it:

```typescript
import { Link } from 'react-router-dom'
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Cobranza.tsx
git commit -m "feat(cobranza): show 'Crear empresa' link in XML import errors when RUT not found"
```

---

### Task 5: Frontend — Empresas.tsx reads URL params to pre-fill create modal

**Files:**
- Modify: `frontend/src/pages/Empresas.tsx`

- [ ] **Step 1: Add useSearchParams and useEffect imports**

In `frontend/src/pages/Empresas.tsx`, update the first import line from:

```typescript
import { useState, useMemo } from 'react'
```

to:

```typescript
import { useState, useMemo, useEffect } from 'react'
```

And add `useSearchParams` to the react-router-dom import. If there is no react-router-dom import yet, add:

```typescript
import { useSearchParams } from 'react-router-dom'
```

- [ ] **Step 2: Add useSearchParams hook and pre-fill effect**

Inside the `Empresas` function component, after the existing state declarations (after line ~54, before `toggleSort`), add:

```typescript
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get('create') !== 'true') return
    const rut = searchParams.get('rut') || ''
    const nombre = searchParams.get('nombre') || ''
    const email = searchParams.get('email') || ''
    setForm({ ...EMPTY_FORM, rut, nombre, email })
    setEditando(null)
    setModalOpen(true)
    setSearchParams({}, { replace: true })
  }, [])
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Empresas.tsx
git commit -m "feat(empresas): pre-fill create modal from URL params (?create=true&rut=X&nombre=Y&email=Z)"
```

---

### Task 6: Remove standalone Facturas page

**Files:**
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Delete: `frontend/src/pages/Facturas.tsx`

- [ ] **Step 1: Remove Facturas route from router.tsx**

In `frontend/src/router.tsx`:

Remove the import on line 17:
```typescript
import Facturas from './pages/Facturas'
```

Remove only the list route (line 61) — keep `/facturas/nueva` and `/facturas/:id` since FacturaDetalle is still used:
```typescript
      { path: 'facturas', element: <Facturas /> },
```

The file should still have:
```typescript
      { path: 'facturas/nueva', element: <FacturaDetalle /> },
      { path: 'facturas/:id', element: <FacturaDetalle /> },
```

- [ ] **Step 2: Remove Facturas nav item from Sidebar.tsx**

In `frontend/src/components/layout/Sidebar.tsx`:

Remove this line from the NAV array (line 27):
```typescript
  { to: '/facturas',       icon: Receipt,         label: 'Facturas',          module: 'facturas' },
```

Remove `Receipt` from the lucide-react import (line 4-7) since it's no longer used:

```typescript
import {
  LayoutDashboard, FileText, Users, Package, ShoppingCart,
  Warehouse, Truck, UserCog, Building2, CreditCard,
  ChevronLeft, ChevronRight, LogOut, Sun, Moon, X, ClipboardList, Settings, Banknote,
} from 'lucide-react'
```

- [ ] **Step 3: Delete Facturas.tsx**

```bash
rm frontend/src/pages/Facturas.tsx
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/router.tsx frontend/src/components/layout/Sidebar.tsx
git rm frontend/src/pages/Facturas.tsx
git commit -m "feat(nav): remove standalone Facturas page, all invoice views live under Cobranza"
```

---

## Manual Verification Checklist

After all tasks complete:

1. **XML import with unknown RUT:**
   - Go to Cobranza → Facturas tab → import a DTE XML with an unknown empresa RUT
   - Error row should show `{filename}: Empresa con RUT X no encontrada...` with a blue "Crear empresa →" link

2. **Pre-fill flow:**
   - Click "Crear empresa →"
   - Should navigate to Empresas page with the create modal already open
   - RUT field should be pre-filled; nombre and email pre-filled if present in XML
   - URL should be clean (no query params) after modal opens

3. **Nav consolidation:**
   - Sidebar should not show "Facturas" item
   - Navigating to `/facturas` should show a 404 (RouteError page), not a list
   - `/facturas/:id` still works for existing factura detail links
   - Cobranza page still shows its Facturas tab with full list

4. **Regression — existing XML import with known RUT still works:**
   - Import a DTE XML where the empresa RUT exists in the system
   - Factura should be created/updated normally with no empresa_data in response
