import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.producto import Producto
from app.models.producto_documento import ProductoDocumento
from app.models.user import User
from app.schemas.producto_documento import ProductoDocumentoOut

router = APIRouter()

UPLOAD_DIR = Path("uploads")
MAX_SIZE = 10 * 1024 * 1024
MAX_DOCS = 5
PDF_TYPES = {"application/pdf"}
PDF_EXTS = {".pdf"}


@router.get("/{producto_id}/documentos/", response_model=list[ProductoDocumentoOut])
def listar_documentos(
    producto_id: int,
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    _, db = perms
    if not db.get(Producto, producto_id):
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return (
        db.query(ProductoDocumento)
        .filter_by(producto_id=producto_id)
        .order_by(ProductoDocumento.subido_en.desc())
        .all()
    )


@router.post("/{producto_id}/documentos/", response_model=ProductoDocumentoOut, status_code=201)
async def subir_documento(
    producto_id: int,
    file: UploadFile,
    perms: tuple[User, Session] = require_permission("catalogo", "edit"),
):
    user, db = perms
    producto = db.get(Producto, producto_id)
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    ext = Path(file.filename or "").suffix.lower()
    if file.content_type not in PDF_TYPES or ext not in PDF_EXTS:
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos PDF")

    count = db.query(ProductoDocumento).filter_by(producto_id=producto_id).count()
    if count >= MAX_DOCS:
        raise HTTPException(status_code=400, detail=f"Máximo {MAX_DOCS} documentos por producto")

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="Archivo supera el límite de 10 MB")

    dir_path = UPLOAD_DIR / "productos" / str(producto_id)
    dir_path.mkdir(parents=True, exist_ok=True)
    filename = file.filename or "documento.pdf"
    dest = dir_path / f"{uuid.uuid4()}_{filename}"
    dest.write_bytes(content)

    doc = ProductoDocumento(
        producto_id=producto_id,
        nombre=filename,
        ruta=str(dest),
        subido_por_id=user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{producto_id}/documentos/{doc_id}/download")
def descargar_documento(
    producto_id: int,
    doc_id: int,
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    _, db = perms
    doc = db.get(ProductoDocumento, doc_id)
    if not doc or doc.producto_id != producto_id:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    path = Path(doc.ruta)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")
    return FileResponse(str(path), filename=doc.nombre, media_type="application/pdf")


@router.delete("/{producto_id}/documentos/{doc_id}", status_code=204)
def eliminar_documento(
    producto_id: int,
    doc_id: int,
    perms: tuple[User, Session] = require_permission("catalogo", "edit"),
):
    _, db = perms
    doc = db.get(ProductoDocumento, doc_id)
    if not doc or doc.producto_id != producto_id:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    path = Path(doc.ruta)
    if path.exists():
        path.unlink()
    db.delete(doc)
    db.commit()
