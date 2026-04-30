import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.factura import Factura
from app.models.factura_adjunto import FacturaAdjunto
from app.models.user import User
from app.schemas.factura_adjunto import FacturaAdjuntoOut

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


@router.get("/{factura_id}/adjuntos/", response_model=list[FacturaAdjuntoOut])
def listar_adjuntos(
    factura_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    if not db.get(Factura, factura_id):
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return (
        db.query(FacturaAdjunto)
        .filter_by(factura_id=factura_id)
        .order_by(FacturaAdjunto.subido_en.desc())
        .all()
    )


@router.post("/{factura_id}/adjuntos/", response_model=FacturaAdjuntoOut, status_code=201)
async def subir_adjunto(
    factura_id: int,
    file: UploadFile,
    perms: tuple[User, Session] = require_permission("facturas", "edit"),
):
    user, db = perms
    factura = db.get(Factura, factura_id)
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    _validate_upload(file)

    count = db.query(FacturaAdjunto).filter_by(factura_id=factura_id).count()
    if count >= MAX_DOCS:
        raise HTTPException(
            status_code=400, detail=f"Máximo {MAX_DOCS} adjuntos por factura"
        )

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="Archivo supera el límite de 10 MB")

    dir_path = UPLOAD_DIR / "facturas" / str(factura_id)
    dir_path.mkdir(parents=True, exist_ok=True)
    filename = file.filename or "adjunto"
    dest = dir_path / f"{uuid.uuid4()}_{filename}"
    dest.write_bytes(content)

    adj = FacturaAdjunto(
        factura_id=factura_id,
        nombre=filename,
        ruta=str(dest),
        mime_type=file.content_type or "application/octet-stream",
        subido_por_id=user.id,
    )
    db.add(adj)
    db.commit()
    db.refresh(adj)
    return adj


@router.get("/{factura_id}/adjuntos/{adj_id}/download")
def descargar_adjunto(
    factura_id: int,
    adj_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    adj = db.get(FacturaAdjunto, adj_id)
    if not adj or adj.factura_id != factura_id:
        raise HTTPException(status_code=404, detail="Adjunto no encontrado")
    path = Path(adj.ruta)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")
    return FileResponse(str(path), filename=adj.nombre, media_type=adj.mime_type)


@router.delete("/{factura_id}/adjuntos/{adj_id}", status_code=204)
def eliminar_adjunto(
    factura_id: int,
    adj_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "edit"),
):
    _, db = perms
    adj = db.get(FacturaAdjunto, adj_id)
    if not adj or adj.factura_id != factura_id:
        raise HTTPException(status_code=404, detail="Adjunto no encontrado")
    path = Path(adj.ruta)
    if path.exists():
        path.unlink()
    db.delete(adj)
    db.commit()
