# Sugerencias de Productos por Cliente/Empresa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando el usuario abre el autocomplete de productos en una Cotización o Nota de Venta y el input está vacío, mostrar los productos que la empresa (o cliente) ha comprado en los últimos 6 meses (según facturas emitidas), ordenados por cantidad total descendente.

**Architecture:**
- Backend expone `GET /api/productos/sugerencias?cliente_id=X&empresa_id=Y` que agrega `factura_lineas` de `facturas` no anuladas en los últimos 6 meses, filtrando por empresa (prevalece) o cliente (fallback), y retorna hasta 20 productos con el mismo schema que `/buscar`.
- Frontend: en `CotizacionDetalle` y `NotaVentaDetalle`, cuando `q === ''` y hay `empresaId` o `clienteId`, llamar al endpoint de sugerencias en vez de `/buscar?q=`. Sin selección → sin resultados (comportamiento actual).
- Schema unificado (mismo shape que `/buscar`) para no tocar el render del dropdown.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Pydantic v2, React + TypeScript, React Query ya no aplica aquí (se usa `api` directo como el resto del autocomplete).

---

## File Structure

- **Create:**
  - `backend/app/api/productos.py` — nuevo endpoint `/sugerencias` (en archivo existente)
  - `backend/tests/test_sugerencias_productos.py` — 6 tests
- **Modify:**
  - `frontend/src/pages/CotizacionDetalle.tsx` — `fetchAutocomplete` ahora ramifica según `q`
  - `frontend/src/pages/NotaVentaDetalle.tsx` — mismo cambio

---

## Task 1: Backend — Endpoint `/api/productos/sugerencias`

**Files:**
- Modify: `backend/app/api/productos.py` (agregar endpoint después de `buscar_productos` en ~línea 123)
- Test: `backend/tests/test_sugerencias_productos.py` (crear)

### Lógica del endpoint

- Path: `GET /api/productos/sugerencias`
- Query: `cliente_id: int | None = None`, `empresa_id: int | None = None`
- Permiso: `require_permission("catalogo", "view")` (igual que `/buscar`)
- Validación: si ambos `None` → retornar `[]` (no error; el frontend lo llama solo cuando hay selección, pero defensivo)
- Fecha corte: `date.today() - timedelta(days=180)` (6 meses = 180 días fijo)
- Query SQLAlchemy (usar `func.sum`, `func.max`, `group_by`):
  - JOIN `FacturaLinea` → `Factura`
  - Filtros: `Factura.estado != 'anulada'`, `Factura.fecha >= corte`
  - Si `empresa_id` viene: `Factura.empresa_id == empresa_id` (prevalece)
  - Si solo `cliente_id`: `Factura.cliente_id == cliente_id`
  - `FacturaLinea.producto_id IS NOT NULL`
  - `GROUP BY FacturaLinea.producto_id`
  - `HAVING SUM(cantidad) > 0`
  - `ORDER BY SUM(cantidad) DESC, MAX(Factura.fecha) DESC`
  - `LIMIT 20`
- Después, cargar los `Producto` correspondientes manteniendo el orden del ranking (porque SQLAlchemy no garantiza orden al hacer `in_`). Patrón: obtener lista `[(producto_id, total), ...]` del aggregate query, luego `productos = db.query(Producto).filter(Producto.id.in_(ids)).all()`, y re-ordenar manualmente por el ranking (dict id→índice).
- Serializar con `ProductoBusquedaOutAdmin` si admin, `ProductoBusquedaOutPublic` si no (mismo patrón que `/buscar`, líneas 121-122).

### Steps

- [ ] **Step 1: Escribir tests (fallar primero)**

Crear `backend/tests/test_sugerencias_productos.py`:

```python
from datetime import date, timedelta
from decimal import Decimal

from app.models.cliente import Cliente
from app.models.empresa import Empresa
from app.models.factura import Factura, FacturaLinea
from app.models.producto import Producto


def _seed_basic(db):
    """Crea 2 productos, 1 empresa, 1 cliente ligado, retorna dict."""
    emp = Empresa(nombre="ACME", rut="11.111.111-1")
    db.add(emp); db.flush()
    cli = Cliente(nombre="Juan", rut="22.222.222-2", empresa_id=emp.id)
    db.add(cli); db.flush()
    pA = Producto(nombre="Producto A", precio_venta=Decimal("100"))
    pB = Producto(nombre="Producto B", precio_venta=Decimal("200"))
    db.add_all([pA, pB]); db.flush()
    db.commit()
    return {"emp": emp, "cli": cli, "pA": pA, "pB": pB}


def _factura_con_lineas(db, cliente_id, empresa_id, fecha, estado, lineas_qty):
    """lineas_qty: dict[producto_id] = cantidad"""
    f = Factura(
        numero=int(fecha.strftime("%Y%m%d")) + cliente_id,
        cliente_id=cliente_id,
        empresa_id=empresa_id,
        fecha=fecha,
        estado=estado,
    )
    db.add(f); db.flush()
    for pid, qty in lineas_qty.items():
        db.add(FacturaLinea(
            factura_id=f.id, producto_id=pid, descripcion="x",
            cantidad=qty, valor_neto=Decimal("1"),
        ))
    db.commit()
    return f


def test_sin_historial_retorna_lista_vacia(client, admin_token, db):
    seed = _seed_basic(db)
    r = client.get(
        f"/api/productos/sugerencias?empresa_id={seed['emp'].id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json() == []


def test_ordena_por_cantidad_total_desc(client, admin_token, db):
    seed = _seed_basic(db)
    # Empresa compra 2 de A y 10 de B
    _factura_con_lineas(
        db, seed["cli"].id, seed["emp"].id, date.today() - timedelta(days=10),
        "pagada", {seed["pA"].id: 2, seed["pB"].id: 10},
    )
    r = client.get(
        f"/api/productos/sugerencias?empresa_id={seed['emp'].id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    nombres = [p["nombre"] for p in r.json()]
    assert nombres == ["Producto B", "Producto A"]


def test_excluye_anuladas(client, admin_token, db):
    seed = _seed_basic(db)
    _factura_con_lineas(
        db, seed["cli"].id, seed["emp"].id, date.today() - timedelta(days=5),
        "anulada", {seed["pA"].id: 99},
    )
    r = client.get(
        f"/api/productos/sugerencias?empresa_id={seed['emp'].id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json() == []


def test_excluye_facturas_viejas(client, admin_token, db):
    seed = _seed_basic(db)
    # Factura de hace 200 días (>180)
    _factura_con_lineas(
        db, seed["cli"].id, seed["emp"].id, date.today() - timedelta(days=200),
        "pagada", {seed["pA"].id: 5},
    )
    r = client.get(
        f"/api/productos/sugerencias?empresa_id={seed['emp'].id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json() == []


def test_empresa_prevalece_sobre_cliente(client, admin_token, db):
    """Si se pasan ambos, agrega por empresa (puede incluir otros clientes de la empresa)."""
    seed = _seed_basic(db)
    otro_cli = Cliente(nombre="Otro", rut="33.333.333-3", empresa_id=seed["emp"].id)
    db.add(otro_cli); db.flush(); db.commit()
    # otro_cli compra pA; seed cliente no compra nada directamente
    _factura_con_lineas(
        db, otro_cli.id, seed["emp"].id, date.today() - timedelta(days=5),
        "pagada", {seed["pA"].id: 3},
    )
    r = client.get(
        f"/api/productos/sugerencias?empresa_id={seed['emp'].id}&cliente_id={seed['cli'].id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    nombres = [p["nombre"] for p in r.json()]
    assert nombres == ["Producto A"]


def test_fallback_cliente_cuando_sin_empresa(client, admin_token, db):
    """Cliente suelto sin empresa: agrega por cliente_id."""
    cli_suelto = Cliente(nombre="Solo", rut="44.444.444-4")
    db.add(cli_suelto); db.flush()
    pX = Producto(nombre="X", precio_venta=Decimal("10"))
    db.add(pX); db.flush(); db.commit()
    _factura_con_lineas(
        db, cli_suelto.id, None, date.today() - timedelta(days=1),
        "emitida", {pX.id: 7},
    )
    r = client.get(
        f"/api/productos/sugerencias?cliente_id={cli_suelto.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["nombre"] == "X"


def test_sin_parametros_retorna_vacio(client, admin_token, db):
    r = client.get(
        "/api/productos/sugerencias",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json() == []
```

- [ ] **Step 2: Ejecutar tests para confirmar que fallan**

```
cd backend && pytest tests/test_sugerencias_productos.py -v
```
Esperado: todos fallan con 404 (endpoint no existe).

- [ ] **Step 3: Implementar endpoint**

Agregar en `backend/app/api/productos.py` después de `buscar_productos` (línea 123):

```python
@router.get("/sugerencias")
def sugerencias_productos(
    cliente_id: int | None = Query(None),
    empresa_id: int | None = Query(None),
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    """Top 20 productos comprados por empresa (prevalece) o cliente en últimos 6 meses
    según facturas no anuladas, ordenados por cantidad total descendente.
    """
    user, db = perms
    if cliente_id is None and empresa_id is None:
        return []

    from datetime import date, timedelta
    from sqlalchemy import func
    from app.models.factura import Factura, FacturaLinea

    corte = date.today() - timedelta(days=180)
    q = (
        db.query(
            FacturaLinea.producto_id,
            func.sum(FacturaLinea.cantidad).label("total_qty"),
            func.max(Factura.fecha).label("ultima_fecha"),
        )
        .join(Factura, FacturaLinea.factura_id == Factura.id)
        .filter(
            Factura.estado != "anulada",
            Factura.fecha >= corte,
            FacturaLinea.producto_id.is_not(None),
        )
    )
    if empresa_id is not None:
        q = q.filter(Factura.empresa_id == empresa_id)
    else:
        q = q.filter(Factura.cliente_id == cliente_id)

    ranking = (
        q.group_by(FacturaLinea.producto_id)
        .having(func.sum(FacturaLinea.cantidad) > 0)
        .order_by(func.sum(FacturaLinea.cantidad).desc(), func.max(Factura.fecha).desc())
        .limit(20)
        .all()
    )
    if not ranking:
        return []

    ids = [r.producto_id for r in ranking]
    orden = {pid: i for i, pid in enumerate(ids)}
    productos = db.query(Producto).filter(Producto.id.in_(ids)).all()
    productos.sort(key=lambda p: orden[p.id])

    schema = ProductoBusquedaOutAdmin if user.role == "admin" else ProductoBusquedaOutPublic
    return [schema.model_validate(p).model_dump(mode="json") for p in productos]
```

Mueve los imports `from datetime import timedelta` y `from sqlalchemy import func` al tope del archivo si no están ya (el archivo ya importa `datetime` y `or_`; verifica).

- [ ] **Step 4: Ejecutar tests para confirmar que pasan**

```
cd backend && pytest tests/test_sugerencias_productos.py -v
```
Esperado: 7/7 pasan.

- [ ] **Step 5: Correr suite completa no-smoke**

```
cd backend && pytest -m "not smoke" -q
```
Esperado: 480/480 pasan (473 previos + 7 nuevos).

- [ ] **Step 6: Commit**

```
git add backend/app/api/productos.py backend/tests/test_sugerencias_productos.py
git commit -m "feat: /api/productos/sugerencias ranking por historial de facturas"
```

---

## Task 2: Frontend — Integrar sugerencias en autocomplete

**Files:**
- Modify: `frontend/src/pages/CotizacionDetalle.tsx`
- Modify: `frontend/src/pages/NotaVentaDetalle.tsx`

### Lógica frontend

- `fetchAutocomplete(q: string)` decide endpoint:
  - Si `q.trim() !== ''` → `/api/productos/buscar?q=<q>` (como hoy)
  - Si `q === ''`:
    - Si `empresaId` (truthy) → `/api/productos/sugerencias?empresa_id=<empresaId>`
    - Si `clienteId` (truthy, sin empresa) → `/api/productos/sugerencias?cliente_id=<clienteId>`
    - Si ninguno → `setAutocompleteResults([])` y salir (no llamar API)
- Cuando el usuario cambia cliente o empresa con el dropdown abierto, las sugerencias desactualizadas no causan problema (se refrescan al próximo focus/change); no se requiere invalidación proactiva.

### Steps

- [ ] **Step 1: Editar `frontend/src/pages/CotizacionDetalle.tsx` — `fetchAutocomplete`**

Reemplazar la función actual (líneas ~333-341 aprox):

```tsx
async function fetchAutocomplete(q: string) {
  try {
    if (q.trim() !== '') {
      const res = await api.get<Producto[]>(`/api/productos/buscar?q=${encodeURIComponent(q)}`)
      setAutocompleteResults(res.data)
      return
    }
    if (empresaId) {
      const res = await api.get<Producto[]>(`/api/productos/sugerencias?empresa_id=${empresaId}`)
      setAutocompleteResults(res.data)
      return
    }
    if (clienteId) {
      const res = await api.get<Producto[]>(`/api/productos/sugerencias?cliente_id=${clienteId}`)
      setAutocompleteResults(res.data)
      return
    }
    setAutocompleteResults([])
  } catch {
    setAutocompleteResults([])
  }
}
```

- [ ] **Step 2: Editar `frontend/src/pages/NotaVentaDetalle.tsx` — `fetchAutocomplete`**

Misma función pero es `useCallback`. Reemplazar el cuerpo (líneas ~243-249):

```tsx
const fetchAutocomplete = useCallback(async (q: string) => {
  try {
    if (q.trim() !== '') {
      const res = await api.get<Producto[]>(`/api/productos/buscar?q=${encodeURIComponent(q)}`)
      setAutocompleteResults(res.data)
      return
    }
    if (empresaId) {
      const res = await api.get<Producto[]>(`/api/productos/sugerencias?empresa_id=${empresaId}`)
      setAutocompleteResults(res.data)
      return
    }
    if (clienteId) {
      const res = await api.get<Producto[]>(`/api/productos/sugerencias?cliente_id=${clienteId}`)
      setAutocompleteResults(res.data)
      return
    }
    setAutocompleteResults([])
  } catch { setAutocompleteResults([]) }
}, [empresaId, clienteId])
```

Nota: agregar `empresaId` y `clienteId` a las dependencias del `useCallback`. Verificar que esas variables existen en el scope del componente con ese nombre exacto (lee el archivo primero; si se llaman distinto como `empresa_id` o `selectedEmpresaId`, adaptar).

- [ ] **Step 3: Typecheck**

```
cd frontend && npx tsc --noEmit
```
Esperado: sin errores.

- [ ] **Step 4: Test manual en navegador (golden path)**

1. Levantar backend + frontend.
2. Crear cotización nueva → seleccionar empresa con facturas → click en descripción de línea vacía → debe mostrar dropdown con productos comprados antes, ordenados desc.
3. Tipear texto → debe cambiar a resultados de `/buscar`.
4. Borrar texto → debe volver a sugerencias.
5. Repetir en NV.

Si algo falla, diagnostica (no marques step completo).

- [ ] **Step 5: Commit**

```
git add frontend/src/pages/CotizacionDetalle.tsx frontend/src/pages/NotaVentaDetalle.tsx
git commit -m "feat: autocomplete sugiere productos previos del cliente/empresa en input vacío"
```

---

## Notas fuera de scope

- No se agrega badge visual "comprado antes" en el dropdown (mantener simple).
- No se mezcla historial con el resto del catálogo cuando el usuario tipea (buscar es buscar; sugerir es sugerir).
- No se agrega cache en frontend — endpoint es rápido y se llama solo al abrir dropdown.
- No incluir Cotizaciones ni Notas de Venta: el cliente pidió contar solo facturas (única fuente de verdad de "compra").
