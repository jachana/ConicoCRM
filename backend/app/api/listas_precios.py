from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import update
from sqlalchemy.orm import Session, joinedload

from app.api.config import require_admin
from app.models.lista_precios import ListaPrecios, ListaPreciosItem
from app.models.producto import Producto
from app.models.user import User
from app.schemas.lista_precios import (
    ListaPreciosItemsPage,
    ListaPreciosOut,
    ListaPreciosPage,
    ListaPreciosUploadResult,
)
from app.services.lista_precios_parser import ParseError, parse_lista_precios

router = APIRouter()

UPLOAD_DIR = Path("uploads") / "listas_precios"


@router.post("/", response_model=ListaPreciosUploadResult, status_code=201)
async def subir_lista(
    archivo: UploadFile = File(...),
    columna_sku: str = Form("sku"),
    columna_costo: str = Form("costo"),
    perms: tuple[User, Session] = Depends(require_admin),
):
    user, db = perms

    content = await archivo.read()
    raw_name = archivo.filename or "lista.xlsx"
    filename = Path(raw_name).name or "lista.xlsx"  # strip directory components
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


@router.get("/", response_model=ListaPreciosPage)
def listar_listas(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    perms: tuple[User, Session] = Depends(require_admin),
):
    _, db = perms
    q = db.query(ListaPrecios).options(joinedload(ListaPrecios.subida_por)).order_by(ListaPrecios.fecha_subida.desc())
    total = q.count()
    rows = q.offset((page - 1) * page_size).limit(page_size).all()
    return ListaPreciosPage(items=rows, total=total, page=page, page_size=page_size)


@router.get("/activa", response_model=ListaPreciosOut | None)
def lista_activa(
    perms: tuple[User, Session] = Depends(require_admin),
):
    _, db = perms
    lista = (
        db.query(ListaPrecios)
        .options(joinedload(ListaPrecios.subida_por))
        .filter(ListaPrecios.activa.is_(True))
        .first()
    )
    return lista


@router.get("/{lista_id}", response_model=ListaPreciosOut)
def obtener_lista(
    lista_id: int,
    perms: tuple[User, Session] = Depends(require_admin),
):
    _, db = perms
    lp = db.get(ListaPrecios, lista_id)
    if not lp:
        raise HTTPException(status_code=404, detail="Lista no encontrada")
    return lp


@router.get("/{lista_id}/items", response_model=ListaPreciosItemsPage)
def listar_items(
    lista_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    perms: tuple[User, Session] = Depends(require_admin),
):
    _, db = perms
    if not db.get(ListaPrecios, lista_id):
        raise HTTPException(status_code=404, detail="Lista no encontrada")
    q = db.query(ListaPreciosItem).filter_by(lista_id=lista_id)
    total = q.count()
    items = q.order_by(ListaPreciosItem.sku).offset((page - 1) * page_size).limit(page_size).all()
    return ListaPreciosItemsPage(items=items, total=total, page=page, page_size=page_size)


@router.get("/{lista_id}/download")
def descargar_lista(
    lista_id: int,
    perms: tuple[User, Session] = Depends(require_admin),
):
    _, db = perms
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
    perms: tuple[User, Session] = Depends(require_admin),
):
    _, db = perms
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
