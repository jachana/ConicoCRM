import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.nota_venta import NotaVenta
from app.models.nota_venta_adjunto import NotaVentaAdjunto
from app.models.user import User
from app.schemas.nota_venta_adjunto import NotaVentaAdjuntoOut

router = APIRouter()

UPLOAD_DIR = Path("uploads")
MAX_SIZE = 10 * 1024 * 1024
MAX_DOCS = 10
ALLOWED_TYPES = {
    "application/pdf": {".pdf"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
}


def _validate_upload(file: UploadFile) -> None:
    ext = Path(file.filename or "").suffix.lower()
    valid_exts = ALLOWED_TYPES.get(file.content_type or "")
    if not valid_exts or ext not in valid_exts:
        raise HTTPException(
            status_code=400,
            detail="Solo se aceptan archivos PDF, JPG o PNG",
        )


@router.get("/{nv_id}/adjuntos/", response_model=list[NotaVentaAdjuntoOut])
def listar_adjuntos(
    nv_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "view"),
):
    _, db = perms
    if not db.get(NotaVenta, nv_id):
        raise HTTPException(status_code=404, detail="Nota de venta no encontrada")
    return (
        db.query(NotaVentaAdjunto)
        .filter_by(nv_id=nv_id)
        .order_by(NotaVentaAdjunto.subido_en.desc())
        .all()
    )


@router.post("/{nv_id}/adjuntos/", response_model=NotaVentaAdjuntoOut, status_code=201)
async def subir_adjunto(
    nv_id: int,
    file: UploadFile,
    perms: tuple[User, Session] = require_permission("nota_venta", "edit"),
):
    user, db = perms
    nv = db.get(NotaVenta, nv_id)
    if not nv:
        raise HTTPException(status_code=404, detail="Nota de venta no encontrada")

    _validate_upload(file)

    count = db.query(NotaVentaAdjunto).filter_by(nv_id=nv_id).count()
    if count >= MAX_DOCS:
        raise HTTPException(
            status_code=400, detail=f"Máximo {MAX_DOCS} adjuntos por nota de venta"
        )

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="Archivo supera el límite de 10 MB")

    dir_path = UPLOAD_DIR / "nota_ventas" / str(nv_id)
    dir_path.mkdir(parents=True, exist_ok=True)
    filename = file.filename or "adjunto"
    dest = dir_path / f"{uuid.uuid4()}_{filename}"
    dest.write_bytes(content)

    adj = NotaVentaAdjunto(
        nv_id=nv_id,
        nombre=filename,
        ruta=str(dest),
        mime_type=file.content_type or "application/octet-stream",
        subido_por_id=user.id,
    )
    db.add(adj)
    db.commit()
    db.refresh(adj)
    return adj


@router.get("/{nv_id}/adjuntos/{adj_id}/download")
def descargar_adjunto(
    nv_id: int,
    adj_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "view"),
):
    _, db = perms
    adj = db.get(NotaVentaAdjunto, adj_id)
    if not adj or adj.nv_id != nv_id:
        raise HTTPException(status_code=404, detail="Adjunto no encontrado")
    path = Path(adj.ruta)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")
    return FileResponse(str(path), filename=adj.nombre, media_type=adj.mime_type)


@router.delete("/{nv_id}/adjuntos/{adj_id}", status_code=204)
def eliminar_adjunto(
    nv_id: int,
    adj_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "edit"),
):
    _, db = perms
    adj = db.get(NotaVentaAdjunto, adj_id)
    if not adj or adj.nv_id != nv_id:
        raise HTTPException(status_code=404, detail="Adjunto no encontrado")
    path = Path(adj.ruta)
    if path.exists():
        path.unlink()
    db.delete(adj)
    db.commit()
